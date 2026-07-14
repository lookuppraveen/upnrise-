"use server";

// Video provider config actions. Tenant-scoped — each company runs its
// own keys so usage and billing stay isolated. Exactly one provider per
// company is the default at any moment; saving a new row with
// isDefault=true flips the previous default off in the same transaction.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { VideoProviderKind } from "@prisma/client";
import {
  DID_SOURCE_URL_ERROR,
  HEYGEN_AVATAR_ID_ERROR,
  isValidDidSourceUrl,
  isValidHeygenAvatarId,
} from "@/lib/video";
import {
  ENV_FALLBACK_VARS,
  resolveEnvFallback,
} from "@/lib/video/env-fallback";
import { uploadToStorage } from "@/lib/storage/supabase-storage";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    throw new Error("forbidden");
  }
  return user;
}

const CreateSchema = z
  .object({
    kind: z.nativeEnum(VideoProviderKind),
    label: z.string().max(80).optional().nullable(),
    apiKey: z.string().max(500).optional().default(""),
    avatarId: z.string().max(2000).optional().nullable(),
    voiceId: z.string().max(120).optional().nullable(),
    isDefault: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    const avatarId = data.avatarId?.trim();
    if (!avatarId) return;
    if (data.kind === "did" && !isValidDidSourceUrl(avatarId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["avatarId"],
        message: DID_SOURCE_URL_ERROR,
      });
    }
    if (data.kind === "heygen" && !isValidHeygenAvatarId(avatarId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["avatarId"],
        message: HEYGEN_AVATAR_ID_ERROR,
      });
    }
  });

export async function createVideoProvider(
  data: z.infer<typeof CreateSchema>,
) {
  const user = await requireAdmin();
  const parsed = CreateSchema.parse(data);

  // Resolve the effective key. If the admin left the field blank and this
  // kind supports an env fallback (ElevenLabs → ELEVENLABS_API_KEY), pull
  // from process.env at create time so the DB row still holds a real key.
  // Rotating the env var later requires re-saving the row.
  const typedKey = parsed.apiKey.trim();
  let effectiveKey = typedKey;
  if (!effectiveKey) {
    const envKey = resolveEnvFallback(parsed.kind);
    if (!envKey) {
      const varName = ENV_FALLBACK_VARS[parsed.kind];
      throw new Error(
        varName
          ? `API key is required. Paste one, or set ${varName} in .env and reload the server.`
          : "API key is required.",
      );
    }
    effectiveKey = envKey;
  } else if (effectiveKey.length < 8) {
    throw new Error("API key looks too short (min 8 chars).");
  }

  await prisma.$transaction(async (tx) => {
    if (parsed.isDefault) {
      await tx.videoProvider.updateMany({
        where: { companyId: user.companyId!, isDefault: true },
        data: { isDefault: false },
      });
    }
    await tx.videoProvider.create({
      data: {
        companyId: user.companyId!,
        kind: parsed.kind,
        label: parsed.label?.trim() || null,
        apiKey: effectiveKey,
        avatarId: parsed.avatarId?.trim() || null,
        voiceId: parsed.voiceId?.trim() || null,
        isDefault: parsed.isDefault,
      },
    });
  });
  revalidatePath("/admin/video-providers");
}


const UpdateSchema = z.object({
  id: z.string().uuid(),
  label: z.string().max(80).optional().nullable(),
  apiKey: z.string().min(8).max(500).optional(),
  avatarId: z.string().max(2000).optional().nullable(),
  voiceId: z.string().max(120).optional().nullable(),
});

export async function updateVideoProvider(
  data: z.infer<typeof UpdateSchema>,
) {
  const user = await requireAdmin();
  const parsed = UpdateSchema.parse(data);
  const row = await prisma.videoProvider.findFirst({
    where: { id: parsed.id, companyId: user.companyId! },
    select: { id: true, kind: true },
  });
  if (!row) throw new Error("not found");
  const nextAvatar = parsed.avatarId?.trim();
  if (nextAvatar) {
    if (row.kind === "did" && !isValidDidSourceUrl(nextAvatar)) {
      throw new Error(DID_SOURCE_URL_ERROR);
    }
    if (row.kind === "heygen" && !isValidHeygenAvatarId(nextAvatar)) {
      throw new Error(HEYGEN_AVATAR_ID_ERROR);
    }
  }
  await prisma.videoProvider.update({
    where: { id: parsed.id },
    data: {
      label: parsed.label !== undefined ? parsed.label?.trim() || null : undefined,
      apiKey: parsed.apiKey?.trim(),
      avatarId:
        parsed.avatarId !== undefined ? parsed.avatarId?.trim() || null : undefined,
      voiceId:
        parsed.voiceId !== undefined ? parsed.voiceId?.trim() || null : undefined,
    },
  });
  revalidatePath("/admin/video-providers");
}

export async function setDefaultVideoProvider(id: string) {
  const user = await requireAdmin();
  await prisma.$transaction(async (tx) => {
    const row = await tx.videoProvider.findFirst({
      where: { id, companyId: user.companyId! },
      select: { id: true },
    });
    if (!row) throw new Error("not found");
    await tx.videoProvider.updateMany({
      where: { companyId: user.companyId!, isDefault: true },
      data: { isDefault: false },
    });
    await tx.videoProvider.update({
      where: { id },
      data: { isDefault: true },
    });
  });
  revalidatePath("/admin/video-providers");
}

export async function deleteVideoProvider(id: string) {
  const user = await requireAdmin();
  await prisma.videoProvider.deleteMany({
    where: { id, companyId: user.companyId! },
  });
  revalidatePath("/admin/video-providers");
}

// ─── D-ID portrait library ───
//
// Tenant-scoped saved D-ID source images. Admin uploads a portrait via
// D-ID's POST /images, pastes the returned s3:// URL here once with a
// friendly label + optional voice, and from then on can pick it from a
// modal on the provider form / persona override.

const DidPortraitCreateSchema = z.object({
  label: z.string().trim().min(1).max(80),
  sourceUrl: z.string().trim().min(1).max(2000),
  voiceId: z.string().trim().max(120).optional().nullable(),
  voiceName: z.string().trim().max(80).optional().nullable(),
});

const DidPortraitUpdateSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  sourceUrl: z.string().trim().min(1).max(2000),
  voiceId: z.string().trim().max(120).optional().nullable(),
  voiceName: z.string().trim().max(80).optional().nullable(),
});

export async function createDidPortrait(
  data: z.infer<typeof DidPortraitCreateSchema>,
) {
  const user = await requireAdmin();
  const parsed = DidPortraitCreateSchema.parse(data);
  if (!isValidDidSourceUrl(parsed.sourceUrl)) {
    throw new Error(DID_SOURCE_URL_ERROR);
  }
  await prisma.didPortrait.create({
    data: {
      companyId: user.companyId!,
      label: parsed.label,
      sourceUrl: parsed.sourceUrl,
      voiceId: parsed.voiceId || null,
      voiceName: parsed.voiceName || null,
    },
  });
  revalidatePath("/admin/video-providers");
}

export async function updateDidPortrait(
  data: z.infer<typeof DidPortraitUpdateSchema>,
) {
  const user = await requireAdmin();
  const parsed = DidPortraitUpdateSchema.parse(data);
  if (!isValidDidSourceUrl(parsed.sourceUrl)) {
    throw new Error(DID_SOURCE_URL_ERROR);
  }
  const row = await prisma.didPortrait.findFirst({
    where: { id: parsed.id, companyId: user.companyId! },
    select: { id: true },
  });
  if (!row) throw new Error("not found");
  await prisma.didPortrait.update({
    where: { id: parsed.id },
    data: {
      label: parsed.label,
      sourceUrl: parsed.sourceUrl,
      voiceId: parsed.voiceId || null,
      voiceName: parsed.voiceName || null,
    },
  });
  revalidatePath("/admin/video-providers");
}

export async function deleteDidPortrait(id: string) {
  const user = await requireAdmin();
  await prisma.didPortrait.deleteMany({
    where: { id, companyId: user.companyId! },
  });
  revalidatePath("/admin/video-providers");
}

// Browser → /images (proxied here so the D-ID API key stays server-only).
// Accepts a File via FormData, forwards it to D-ID, then writes the
// returned s3:// URL into a fresh DidPortrait row. The tenant must have
// a D-ID provider configured (any row, default or not — we want this
// to work even before the admin marks D-ID as default).
const MAX_PORTRAIT_BYTES = 10 * 1024 * 1024;
const ALLOWED_PORTRAIT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

export async function uploadDidPortraitFromFile(
  formData: FormData,
): Promise<{ id: string; sourceUrl: string }> {
  const user = await requireAdmin();

  const file = formData.get("file");
  const label = String(formData.get("label") ?? "").trim();
  const voiceId = String(formData.get("voiceId") ?? "").trim() || null;
  const voiceName = String(formData.get("voiceName") ?? "").trim() || null;

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Pick a portrait image to upload.");
  }
  if (!ALLOWED_PORTRAIT_TYPES.has(file.type)) {
    throw new Error("Only JPG/PNG images are accepted by D-ID.");
  }
  if (file.size > MAX_PORTRAIT_BYTES) {
    throw new Error("Image is over D-ID's 10 MB limit.");
  }
  if (!label) throw new Error("Label is required.");
  if (label.length > 80) throw new Error("Label is too long (max 80 chars).");

  const provider = await prisma.videoProvider.findFirst({
    where: { companyId: user.companyId!, kind: "did" },
    select: { apiKey: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  if (!provider) {
    throw new Error(
      "No D-ID provider configured — add one with your D-ID API key at /admin/video-providers before uploading portraits.",
    );
  }

  // Read the file bytes once — we send the same buffer to D-ID for the
  // s3:// reference AND to Supabase Storage for the publicly fetchable
  // displayUrl that the audio-only roleplay surface renders.
  const buffer = Buffer.from(await file.arrayBuffer());

  // Build the upstream FormData. We need a NEW Blob so the body stream
  // can be consumed by fetch without conflicting with the Supabase
  // upload.
  const upstreamForm = new FormData();
  upstreamForm.append(
    "image",
    new Blob([new Uint8Array(buffer)], { type: file.type }),
    file.name,
  );

  const res = await fetch("https://api.d-id.com/images", {
    method: "POST",
    headers: { Authorization: `Basic ${provider.apiKey}` },
    body: upstreamForm,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `D-ID rejected the API key (HTTP ${res.status}). Update it at /admin/video-providers.`,
      );
    }
    throw new Error(`D-ID upload failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { url?: string; id?: string };
  if (!json.url || !isValidDidSourceUrl(json.url)) {
    throw new Error("D-ID returned an unexpected response — no usable URL.");
  }

  // Mirror to Supabase Storage. Failures here are non-fatal — the
  // portrait still works for streaming; we just won't have an image to
  // show in the audio-only surface. Surface a console warning so the
  // admin can see it in the dev-server log.
  const ext = file.name.match(/\.([a-z0-9]{1,5})$/i)?.[1]?.toLowerCase() ?? "jpg";
  const safeRand =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const storagePath = `portraits/${user.companyId}/${safeRand}.${ext}`;
  let displayUrl: string | null = null;
  try {
    const uploaded = await uploadToStorage({
      path: storagePath,
      file: buffer,
      contentType: file.type,
    });
    displayUrl = uploaded.url;
  } catch (err) {
    console.warn(
      "[uploadDidPortraitFromFile] Supabase mirror failed:",
      err instanceof Error ? err.message : err,
    );
  }

  const row = await prisma.didPortrait.create({
    data: {
      companyId: user.companyId!,
      label,
      sourceUrl: json.url,
      displayUrl,
      voiceId,
      voiceName,
    },
    select: { id: true, sourceUrl: true },
  });
  revalidatePath("/admin/video-providers");
  return row;
}

// Pings each provider's lightweight key-validation endpoint to confirm
// the stored API key actually works. We don't keep any result — this is
// a smoke test so admins don't have to drive a trainee through a real
// render or roleplay just to learn the key is wrong.
//
// Dispatches by `kind`:
//   - heygen     → LiveAvatar /v1/sessions/token (covers both the
//                  streaming roleplay path AND the v2 video key, which
//                  is the same key on the same account)
//   - synthesia  → GET /v2/videos?limit=1   (401 = bad key)
//   - did        → GET /credits             (401 = bad key)
//   - elevenlabs → GET /v1/user             (key validation)
export async function testStreamingProvider(
  id: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const user = await requireAdmin();
  const provider = await prisma.videoProvider.findFirst({
    where: { id, companyId: user.companyId! },
    select: { kind: true, apiKey: true, avatarId: true },
  });
  if (!provider) return { ok: false, status: 404, message: "Provider not found." };
  if (provider.kind === "synthesia") {
    return testSynthesia(provider.apiKey);
  }
  if (provider.kind === "did") {
    return testDid(provider.apiKey);
  }
  if (provider.kind === "elevenlabs") {
    return testElevenLabs(provider.apiKey);
  }
  // Falls through to heygen — the existing LiveAvatar streaming probe.
  const base = process.env.LIVEAVATAR_BASE ?? "https://api.liveavatar.com";

  // The token endpoint REQUIRES avatar_id in the body. If the admin
  // hasn't picked one yet (typical first-key-test flow), fetch the
  // first ACTIVE avatar off the public catalogue and use it. That way
  // the test really exercises the auth path — a 401 here means the
  // key is bad, not that the avatar_id is.
  let probeAvatarId = provider.avatarId;
  if (!probeAvatarId) {
    try {
      const listRes = await fetch(
        `${base}/v1/avatars/public?page=1&page_size=1`,
        { cache: "no-store" },
      );
      if (listRes.ok) {
        const json = (await listRes.json()) as {
          data?: { results?: Array<{ id?: string; status?: string }> };
        };
        const first = json.data?.results?.find(
          (a) => (a.status ?? "ACTIVE") === "ACTIVE" && typeof a.id === "string",
        );
        if (first?.id) probeAvatarId = first.id;
      }
    } catch {
      // Public list is just a probe — fall through; the next check
      // will report the right error.
    }
  }
  if (!probeAvatarId) {
    return {
      ok: false,
      status: 412,
      message:
        "Couldn't get a probe avatar from the public catalogue. Set an Avatar ID on this provider and retry.",
    };
  }

  try {
    const res = await fetch(`${base}/v1/sessions/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": provider.apiKey,
      },
      body: JSON.stringify({ mode: "LITE", avatar_id: probeAvatarId }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          status: res.status,
          message: `LiveAvatar rejected the API key. Make sure you're using a LiveAvatar key from app.liveavatar.com, not a legacy HeyGen key. Upstream: ${text.slice(0, 160)}`,
        };
      }
      return {
        ok: false,
        status: res.status,
        message: `Upstream HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      status: 502,
      message: e instanceof Error ? e.message : "Network error",
    };
  }
}

// ─── Per-provider probes ───
//
// Each probe hits an authenticated, cheap endpoint and converts the
// response shape into the same { ok } | { ok: false, status, message }
// envelope so the UI can render the result uniformly.

type ProbeResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

async function testSynthesia(apiKey: string): Promise<ProbeResult> {
  try {
    const res = await fetch("https://api.synthesia.io/v2/videos?limit=1", {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { ok: true };
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        status: res.status,
        message: `Synthesia rejected the API key. Generate one at app.synthesia.io → Account → API. Upstream: ${text.slice(0, 160)}`,
      };
    }
    return {
      ok: false,
      status: res.status,
      message: `Synthesia HTTP ${res.status}: ${text.slice(0, 200)}`,
    };
  } catch (e) {
    return {
      ok: false,
      status: 502,
      message: e instanceof Error ? e.message : "Network error",
    };
  }
}

async function testDid(apiKey: string): Promise<ProbeResult> {
  try {
    const res = await fetch("https://api.d-id.com/credits", {
      headers: { Authorization: `Basic ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { ok: true };
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        status: res.status,
        message: `D-ID rejected the API key. Copy the key (already base64-encoded) from studio.d-id.com → API Keys. Upstream: ${text.slice(0, 160)}`,
      };
    }
    return {
      ok: false,
      status: res.status,
      message: `D-ID HTTP ${res.status}: ${text.slice(0, 200)}`,
    };
  } catch (e) {
    return {
      ok: false,
      status: 502,
      message: e instanceof Error ? e.message : "Network error",
    };
  }
}

async function testElevenLabs(apiKey: string): Promise<ProbeResult> {
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user", {
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { ok: true };
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        status: res.status,
        message: `ElevenLabs rejected the API key. Upstream: ${text.slice(0, 160)}`,
      };
    }
    return {
      ok: false,
      status: res.status,
      message: `ElevenLabs HTTP ${res.status}: ${text.slice(0, 200)}`,
    };
  } catch (e) {
    return {
      ok: false,
      status: 502,
      message: e instanceof Error ? e.message : "Network error",
    };
  }
}
