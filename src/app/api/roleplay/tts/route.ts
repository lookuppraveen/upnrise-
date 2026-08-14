// POST /api/roleplay/tts
//
// Body: { text: string, voiceId?: string, gender?: "female"|"male",
//         model?: string, sessionId?: string }
// Resp: audio/mpeg streamed body
//
// Reads ELEVENLABS_API_KEY server-side; pipes ElevenLabs's streaming
// mp3 response straight back to the client so the trainee hears the
// persona voice as soon as the first bytes arrive.
//
// Phase 4 additions:
//   • Enforce per-session soft cap (VOICE_MAX_CHARS_PER_SESSION env,
//     default 12,000). Returns 503 { error: "cap_reached" } once hit.
//   • Enforce per-tenant monthly cap from
//     plan.limits.voice_chars_per_month. Null = unlimited.
//   • Record a VoiceUsageLog row via after() so cost attribution
//     never blocks the audio stream.
//
// Failure modes (the client falls back to browser TTS silently):
//   401 unauthorized       — trainee not signed in
//   403 forbidden          — role not allowed to run roleplays
//   400 bad body           — text missing / too long
//   503 provider_disabled  — VOICE_PROVIDER_DEFAULT=browser or key missing
//   503 cap_reached        — session or tenant cap exceeded
//   502 upstream_error     — ElevenLabs returned non-2xx

import { z } from "zod";
import { after } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { DEFAULT_TTS_MODEL } from "@/lib/voice/elevenlabs-tts-stream";
import { getTtsDriver } from "@/lib/tts";
import { pickDefaultVoice } from "@/lib/voice/voice-catalog";
import { estimateTtsCostCents } from "@/lib/voice/cost";
import {
  checkSessionTtsCap,
  checkTenantMonthlyTtsCap,
  recordVoiceUsage,
} from "@/lib/voice/usage";

const Body = z.object({
  text: z.string().trim().min(1).max(2000),
  voiceId: z.string().trim().min(1).max(100).optional(),
  gender: z.enum(["female", "male"]).optional(),
  model: z.string().trim().min(1).max(60).optional(),
  /** RoleplaySession this call is scoped to. When set, the row lands
   *  in voice_usage_log with kind="tts" and counts toward the
   *  per-session cap. When absent (e.g. admin editor preview button),
   *  the row is kind="tts_preview" and doesn't count against any
   *  session budget. */
  sessionId: z.string().trim().uuid().optional(),
});

export async function POST(req: Request) {
  const tHandlerStart = performance.now();
  const user = await getSessionUser();
  if (!user) return jsonError(401, "unauthorized");
  if (user.role !== "trainee" && user.role !== "admin")
    return jsonError(403, "forbidden");

  // VOICE_PROVIDER_DEFAULT=browser is the operator-side kill-switch that
  // forces every tenant onto browser TTS regardless of TtsProvider rows.
  if ((process.env.VOICE_PROVIDER_DEFAULT ?? "elevenlabs") === "browser")
    return jsonError(503, "provider_disabled");

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "bad_body");

  const companyId = user.companyId;
  const driver = await getTtsDriver(companyId ?? null);
  if (!driver) return jsonError(503, "provider_disabled");

  // For ElevenLabs we keep the "voice-catalog default when the caller
  // didn't specify" behavior; for Sarvam the driver's own default speaker
  // wins because the catalog is ElevenLabs-only.
  const fallbackVoice =
    driver.kind === "elevenlabs"
      ? pickDefaultVoice(parsed.data.gender ?? null).id
      : (driver.defaultVoiceId ?? "meera");
  const voiceId = parsed.data.voiceId ?? driver.defaultVoiceId ?? fallbackVoice;
  const model = parsed.data.model ?? driver.defaultModel ?? DEFAULT_TTS_MODEL;
  const sessionId = parsed.data.sessionId ?? null;
  const kind: "tts" | "tts_preview" = sessionId ? "tts" : "tts_preview";
  const charsIn = parsed.data.text.length;

  // Cap enforcement — session cap only applies to real sessions
  // (previews are unbounded, admin's problem). Tenant cap applies to
  // both so previews can't be used to bypass a monthly budget.
  if (sessionId) {
    const sessionCap = await checkSessionTtsCap(sessionId).catch(() => ({
      allowed: true,
      used: 0,
      cap: 0,
    }));
    if (!sessionCap.allowed) {
      console.warn(
        `[roleplay/tts] session cap reached: session=${sessionId} used=${sessionCap.used} cap=${sessionCap.cap}`,
      );
      return jsonError(503, "cap_reached", {
        scope: "session",
        used: sessionCap.used,
        cap: sessionCap.cap,
      });
    }
  }
  if (companyId) {
    const tenantCap = await checkTenantMonthlyTtsCap(companyId).catch(() => ({
      allowed: true,
      used: 0,
      cap: null as number | null,
    }));
    if (!tenantCap.allowed) {
      console.warn(
        `[roleplay/tts] tenant cap reached: company=${companyId} used=${tenantCap.used} cap=${tenantCap.cap}`,
      );
      return jsonError(503, "cap_reached", {
        scope: "tenant",
        used: tenantCap.used,
        cap: tenantCap.cap,
      });
    }
  }

  const upstream = await driver
    .streamTts({
      voiceId,
      text: parsed.data.text,
      model,
      signal: req.signal,
    })
    .catch((err: unknown) => {
      console.error(
        `[roleplay/tts] ${driver.kind} fetch threw`,
        err instanceof Error ? err.message : err,
      );
      return null;
    });

  if (!upstream || !upstream.ok || !upstream.body) {
    const statusMsg = upstream ? `${upstream.status}` : "network";
    const errText = upstream ? await upstream.text().catch(() => "") : "";
    console.error(
      `[roleplay/tts] upstream ${statusMsg} for voice ${voiceId}: ${errText.slice(0, 200)}`,
    );
    // Log the failed call too so the super-admin tile shows blown
    // spend from persistent upstream errors (rate-limit storms etc.).
    if (companyId) {
      after(async () => {
        await recordVoiceUsage({
          companyId,
          userId: user.id,
          sessionId,
          kind,
          model,
          voiceId,
          charsIn,
          costCents: 0,
          meta: { error: `upstream_${statusMsg}` },
        });
      });
    }
    return jsonError(502, "upstream_error");
  }

  // Success path — attribute usage after the response is sent so we
  // never delay the audio for the sake of a metrics row.
  if (companyId) {
    const costCents = estimateTtsCostCents(charsIn, model);
    after(async () => {
      await recordVoiceUsage({
        companyId,
        userId: user.id,
        sessionId,
        kind,
        model,
        voiceId,
        charsIn,
        costCents,
      });
    });
  }

  // Sarvam returns audio/wav, ElevenLabs returns audio/mpeg. Honor the
  // upstream Content-Type so the browser <audio> element picks the right
  // decoder without us hard-coding a MIME.
  const contentType =
    upstream.headers.get("Content-Type") ?? "audio/mpeg";
  // Handler time here = TTS TTFB from the client's perspective, since we
  // haven't started piping the audio yet (upstream stream just opened).
  const handlerMs = Math.round(performance.now() - tHandlerStart);
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-TTS-Voice": voiceId,
      "X-TTS-Provider": driver.kind,
      "X-Handler-Ms": String(handlerMs),
    },
  });
}

function jsonError(
  status: number,
  code: string,
  extra?: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify({ error: code, ...(extra ?? {}) }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
