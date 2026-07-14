// POST /api/roleplay/streaming/session
//
// Returns a discriminated payload the client uses to open a WebRTC
// stream against the tenant's configured streaming-avatar provider:
//
//   HeyGen (LiveAvatar):
//     { provider: "heygen", token, avatarId, voiceId }
//     → client passes token to @heygen/liveavatar-web-sdk
//
//   D-ID Talks Streams:
//     { provider: "did", streamId, sessionId, offer, iceServers,
//       avatarId, voiceId }
//     → client builds RTCPeerConnection({ iceServers }), feeds offer
//       into setRemoteDescription, sends answer back via
//       /api/roleplay/streaming/did/sdp.
//
// The tenant's default video_providers row dictates which path. If the
// default is render-only (Synthesia / ElevenLabs), we 412 with a clear
// next-step message rather than silently picking another provider.

import { NextResponse } from "next/server";
import { z } from "zod";
import type { VideoProviderKind } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { loadModuleForUser } from "@/lib/ai/roleplay-access";
import { PROVIDER_SUPPORTS_STREAMING, getStreamingDriver } from "@/lib/video";
import { isValidDidSourceUrl } from "@/lib/video/did-validation";
import { isValidHeygenAvatarId } from "@/lib/video/heygen-validation";

// LiveAvatar host. Override per-environment via env if HeyGen migrates
// further or for staging/proxy testing.
const STREAMING_BASE =
  process.env.LIVEAVATAR_BASE ?? "https://api.liveavatar.com";

async function loadDefaultStreamingProvider(companyId: string) {
  // We want the company's CURRENT default row only — never silently
  // pick a non-default fallback. If the default doesn't support
  // streaming, surface that to the admin.
  return prisma.videoProvider.findFirst({
    where: { companyId, isDefault: true },
    select: {
      id: true,
      kind: true,
      apiKey: true,
      avatarId: true,
      voiceId: true,
    },
  });
}

const Body = z.object({
  moduleId: z.string().trim().min(1).max(100).optional(),
});

type PersonaOverride = {
  liveAvatarId?: string | null;
  liveVoiceId?: string | null;
};

// Persona overrides are stored as bare strings, but the value space is
// provider-specific:
//   • D-ID expects an https:// or s3://d-id-images-prod/… image URI.
//   • HeyGen expects a LiveAvatar avatar id (UUID-shaped string, never
//     a URL).
// If a tenant flips its default provider, the previously-stored override
// will be the wrong shape for the new provider. Drop the mismatch and
// fall back to the provider-level default rather than push a guaranteed-
// to-fail value upstream.
function isAvatarOverrideCompatible(
  kind: VideoProviderKind,
  avatarId: string,
): boolean {
  if (kind === "did") return isValidDidSourceUrl(avatarId);
  if (kind === "heygen") return isValidHeygenAvatarId(avatarId);
  return true;
}

// Microsoft/Azure neural voice ids follow the shape xx-XX-NameNeural
// (e.g. en-IN-NeerjaNeural). Only D-ID accepts these; passing one to
// HeyGen would 4xx. The PersonaModal preseeds an Indian Microsoft voice
// as the default liveVoiceId, so this check lets HeyGen-backed tenants
// silently drop it and fall back to their provider default voice.
function isMicrosoftNeuralVoice(id: string): boolean {
  return /^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/.test(id);
}

function isVoiceOverrideCompatible(
  kind: VideoProviderKind,
  voiceId: string,
): boolean {
  const ms = isMicrosoftNeuralVoice(voiceId);
  if (kind === "did") return ms;
  if (kind === "heygen") return !ms;
  return true;
}

function readPersonaOverride(
  modBody: unknown,
  kind: VideoProviderKind,
): PersonaOverride {
  if (!modBody || typeof modBody !== "object") return {};
  const persona = (modBody as { persona?: unknown }).persona;
  if (!persona || typeof persona !== "object") return {};
  const p = persona as Record<string, unknown>;
  const rawAvatar =
    typeof p.liveAvatarId === "string" && p.liveAvatarId.trim()
      ? p.liveAvatarId.trim()
      : null;
  let liveAvatarId: string | null = rawAvatar;
  if (rawAvatar && !isAvatarOverrideCompatible(kind, rawAvatar)) {
    console.warn(
      `[streaming/session] dropping persona.liveAvatarId — value ${JSON.stringify(rawAvatar)} is not shape-compatible with current default provider (${kind}). Falling back to provider default.`,
    );
    liveAvatarId = null;
  }
  const rawVoice =
    typeof p.liveVoiceId === "string" && p.liveVoiceId.trim()
      ? p.liveVoiceId.trim()
      : null;
  let liveVoiceId: string | null = rawVoice;
  if (rawVoice && !isVoiceOverrideCompatible(kind, rawVoice)) {
    console.warn(
      `[streaming/session] dropping persona.liveVoiceId — value ${JSON.stringify(rawVoice)} is not shape-compatible with current default provider (${kind}). Falling back to provider default voice.`,
    );
    liveVoiceId = null;
  }
  return { liveAvatarId, liveVoiceId };
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "trainee" && user.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.companyId)
    return NextResponse.json({ error: "no tenant" }, { status: 400 });

  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success)
    return NextResponse.json(
      { error: "bad body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  const { moduleId } = parsed.data;

  const provider = await loadDefaultStreamingProvider(user.companyId);
  if (!provider) {
    return NextResponse.json(
      {
        error:
          "no default video provider configured. Add one at /admin/video-providers and mark it default.",
      },
      { status: 412 },
    );
  }
  if (!PROVIDER_SUPPORTS_STREAMING[provider.kind]) {
    return NextResponse.json(
      {
        error: `The current default provider (${provider.kind}) is render-only and does not support live roleplay. Mark a HeyGen or D-ID row as default at /admin/video-providers.`,
      },
      { status: 412 },
    );
  }

  // Resolve avatar/voice. Order of precedence:
  //   1. persona.liveAvatarId / persona.liveVoiceId on this module
  //   2. provider.avatarId / provider.voiceId (tenant default)
  let chosenAvatarId: string | null = provider.avatarId;
  let chosenVoiceId: string | null = provider.voiceId;
  if (moduleId) {
    const mod = await loadModuleForUser(user, moduleId);
    if (mod) {
      const override = readPersonaOverride(mod.body, provider.kind);
      if (override.liveAvatarId) chosenAvatarId = override.liveAvatarId;
      if (override.liveVoiceId) chosenVoiceId = override.liveVoiceId;
    }
  }

  if (!chosenAvatarId) {
    return NextResponse.json(
      {
        error:
          provider.kind === "did"
            ? "no source image configured — paste a portrait URL on this persona or set a default Avatar ID at /admin/video-providers"
            : "no avatar configured — pick one on this persona or set a default at /admin/video-providers",
      },
      { status: 412 },
    );
  }

  try {
    if (provider.kind === "heygen") {
      return await mintHeyGenSession({
        apiKey: provider.apiKey,
        avatarId: chosenAvatarId,
        voiceId: chosenVoiceId,
      });
    }
    if (provider.kind === "did") {
      return await mintDidSession({
        providerKind: provider.kind,
        apiKey: provider.apiKey,
        avatarId: chosenAvatarId,
        voiceId: chosenVoiceId,
      });
    }
    return NextResponse.json(
      { error: `unsupported streaming provider: ${provider.kind}` },
      { status: 412 },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Failed to mint streaming session",
      },
      { status: 502 },
    );
  }
}

async function mintHeyGenSession(opts: {
  apiKey: string;
  avatarId: string;
  voiceId: string | null;
}) {
  // LiveAvatar's session-token endpoint REQUIRES avatar_id. Kept as raw
  // fetch (not via the StreamingAvatarDriver) because the existing
  // client SDK consumes `session_token` directly — the driver's
  // createSession returns a different LiveKit-room blob meant for raw
  // WebRTC peers, which the SDK doesn't accept.
  const res = await fetch(`${STREAMING_BASE}/v1/sessions/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": opts.apiKey,
    },
    body: JSON.stringify({ mode: "LITE", avatar_id: opts.avatarId }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `LiveAvatar rejected the API key (HTTP ${res.status}). The X-API-KEY stored on your video provider is invalid or expired. Issue a new LiveAvatar key at app.liveavatar.com and update it at /admin/video-providers. Upstream said: ${text.slice(0, 160)}`,
      );
    }
    throw new Error(`sessions/token ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    data?: { session_token?: string; session_id?: string };
  };
  const token = data.data?.session_token;
  if (!token) throw new Error("sessions/token returned no session_token");
  return NextResponse.json({
    provider: "heygen" as const,
    token,
    avatarId: opts.avatarId,
    voiceId: opts.voiceId,
  });
}

async function mintDidSession(opts: {
  providerKind: VideoProviderKind;
  apiKey: string;
  avatarId: string;
  voiceId: string | null;
}) {
  const driver = getStreamingDriver(opts.providerKind);
  if (!driver) throw new Error("d-id streaming driver missing");
  const creds = await driver.createSession({
    apiKey: opts.apiKey,
    avatarId: opts.avatarId,
    voiceId: opts.voiceId,
  });
  if (creds.provider !== "did") {
    throw new Error("d-id driver returned non-d-id credentials");
  }
  return NextResponse.json({
    provider: "did" as const,
    streamId: creds.streamId,
    sessionId: creds.sessionId,
    offer: creds.offer,
    iceServers: creds.iceServers,
    avatarId: opts.avatarId,
    voiceId: opts.voiceId,
  });
}
