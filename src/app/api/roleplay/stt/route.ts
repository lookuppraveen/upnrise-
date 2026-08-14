// POST /api/roleplay/stt
//
// Body: multipart/form-data
//   audio        — Blob (webm/opus, mp4/aac, mp3, or wav)
//   languageCode — optional ISO 639-1 hint (e.g. "en", "hi")
//   sessionId    — optional RoleplaySession uuid for cost attribution
//
// Resp: { text: string, languageCode?: string }
//
// Client posts a short mic recording after silence-based VAD fires;
// we forward to ElevenLabs Scribe and return the transcript.
//
// Phase 4 additions:
//   • Record a VoiceUsageLog row (kind="stt") via after() so
//     transcription cost is attributed alongside TTS.
//   • No per-session cap on STT (learner mic input is bounded by
//     session duration, not char count). Per-tenant monthly cap is
//     TTS-only for the same reason.

import { after } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { transcribe, SttError } from "@/lib/voice/elevenlabs-stt";
import { estimateSttCostCentsFromBytes } from "@/lib/voice/cost";
import { recordVoiceUsage } from "@/lib/voice/usage";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const STT_MODEL = process.env.ELEVENLABS_STT_MODEL ?? "scribe_v1";

export async function POST(req: Request) {
  const tHandlerStart = performance.now();
  const user = await getSessionUser();
  if (!user)
    return jsonError(401, "unauthorized");
  if (user.role !== "trainee" && user.role !== "admin")
    return jsonError(403, "forbidden");

  const providerDefault = process.env.VOICE_PROVIDER_DEFAULT ?? "elevenlabs";
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (providerDefault !== "elevenlabs" || !apiKey)
    return jsonError(503, "provider_disabled");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, "bad_body");
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob)) return jsonError(400, "bad_body");
  if (audio.size === 0) return jsonError(400, "bad_body");
  if (audio.size > MAX_UPLOAD_BYTES) return jsonError(400, "too_large");

  const languageCodeRaw = form.get("languageCode");
  const languageCode =
    typeof languageCodeRaw === "string" && languageCodeRaw.length <= 8
      ? languageCodeRaw.trim().toLowerCase()
      : undefined;

  const sessionIdRaw = form.get("sessionId");
  const sessionId =
    typeof sessionIdRaw === "string" && /^[0-9a-fA-F-]{36}$/.test(sessionIdRaw)
      ? sessionIdRaw
      : null;

  const bytesIn = audio.size;
  const companyId = user.companyId;

  try {
    const result = await transcribe({
      apiKey,
      audio,
      filename: guessFilename(audio.type),
      languageCode,
      signal: req.signal,
    });

    // Attribute after the response is sent — same non-blocking pattern
    // as the TTS route.
    if (companyId) {
      const costCents = estimateSttCostCentsFromBytes(bytesIn, STT_MODEL);
      after(async () => {
        await recordVoiceUsage({
          companyId,
          userId: user.id,
          sessionId,
          kind: "stt",
          model: STT_MODEL,
          bytesIn,
          costCents,
        });
      });
    }

    const handlerMs = Math.round(performance.now() - tHandlerStart);
    return new Response(
      JSON.stringify({
        text: result.text,
        languageCode: result.languageCode ?? null,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-Handler-Ms": String(handlerMs),
        },
      },
    );
  } catch (err) {
    // Log failed calls too so persistent Scribe errors show up in the
    // super-admin tile as $0 rows with an error tag.
    if (companyId) {
      const statusStr =
        err instanceof SttError ? `${err.status}` : "network";
      after(async () => {
        await recordVoiceUsage({
          companyId,
          userId: user.id,
          sessionId,
          kind: "stt",
          model: STT_MODEL,
          bytesIn,
          costCents: 0,
          meta: { error: `upstream_${statusStr}` },
        });
      });
    }
    if (err instanceof SttError) {
      console.error(
        `[roleplay/stt] upstream ${err.status}: ${err.upstreamBody}`,
      );
      return jsonError(502, "upstream_error");
    }
    console.error(
      "[roleplay/stt] transcribe threw",
      err instanceof Error ? err.message : err,
    );
    return jsonError(502, "upstream_error");
  }
}

function jsonError(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function guessFilename(mime: string): string {
  if (mime.includes("webm")) return "audio.webm";
  if (mime.includes("mp4") || mime.includes("m4a")) return "audio.m4a";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "audio.mp3";
  if (mime.includes("wav")) return "audio.wav";
  return "audio.webm";
}
