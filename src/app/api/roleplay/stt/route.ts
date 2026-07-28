// POST /api/roleplay/stt
//
// Body: multipart/form-data
//   audio        — Blob (webm/opus, mp4/aac, mp3, or wav)
//   languageCode — optional ISO 639-1 hint (e.g. "en", "hi")
//
// Resp: { text: string, languageCode?: string }
//
// Client posts a short mic recording after silence-based VAD fires;
// we forward to ElevenLabs Scribe and return the transcript. Same
// auth model as /api/roleplay/tts.
//
// Failure modes (client falls back to browser SpeechRecognition):
//   401 unauthorized       — no session
//   403 forbidden          — wrong role
//   400 bad_body           — missing audio blob / too large
//   503 provider_disabled  — VOICE_PROVIDER_DEFAULT=browser or key missing
//   502 upstream_error     — ElevenLabs returned non-2xx (rate limit, quota…)
//
// Firefox has no SpeechRecognition to fall back to, so if the client
// hits 503/502 there, the mic path is effectively unavailable — the
// UI already surfaces "type instead" for that case.

import { getSessionUser } from "@/lib/auth/session";
import { transcribe, SttError } from "@/lib/voice/elevenlabs-stt";

// Cap the accepted upload size. Roleplay chunks are <6s of speech
// which is well under 100KB at opus 32kbps; 5MB is a generous ceiling
// that stops a bad client from sending an entire minute of audio.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
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

  try {
    const result = await transcribe({
      apiKey,
      audio,
      // Preserve extension so ElevenLabs's mime sniffing picks the
      // right decoder. Browser MediaRecorder default is webm.
      filename: guessFilename(audio.type),
      languageCode,
      signal: req.signal,
    });
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
        },
      },
    );
  } catch (err) {
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
