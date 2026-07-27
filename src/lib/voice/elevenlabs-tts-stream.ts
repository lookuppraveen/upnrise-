// Server-side ElevenLabs TTS streaming helper.
//
// Distinct from lib/video/providers/elevenlabs-tts.ts (which is used by
// the narration module to render admin-authored audio to a stored mp3).
// This one is for the *live* roleplay conversation: short bursts of
// persona speech, low latency, streamed straight back to the browser.
//
// Endpoint:
//   POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream
//
// Response is a chunked audio/mpeg body — we pipe it straight to the
// client without buffering so the trainee hears audio as soon as the
// first bytes arrive.
//
// Model default is Flash v2.5: ~200-400ms time-to-first-byte, ~$5 per
// 1M chars (10× cheaper than Multilingual v2). Callers can override
// via `model` when a persona is configured for non-English.

const ELEVENLABS_BASE = "https://api.elevenlabs.io";

export const DEFAULT_TTS_MODEL =
  process.env.ELEVENLABS_TTS_MODEL ?? "eleven_flash_v2_5";

export type StreamTtsOpts = {
  apiKey: string;
  voiceId: string;
  text: string;
  /** Override the default model per-call — pass `eleven_multilingual_v2`
   *  for non-English personas where naturalness matters more than latency. */
  model?: string;
  /** ElevenLabs voice_settings knobs. Defaults tuned for conversational
   *  roleplay — slightly lower stability makes the voice more expressive. */
  stability?: number;
  similarityBoost?: number;
  /** Abort signal chained to the request lifecycle. */
  signal?: AbortSignal;
};

/**
 * Kick off a streaming TTS request and return the raw upstream Response.
 * The caller (a route handler) pipes `.body` straight to the browser.
 * Non-2xx statuses are returned as-is so the caller can log the payload.
 */
export async function streamTts(opts: StreamTtsOpts): Promise<Response> {
  const url = `${ELEVENLABS_BASE}/v1/text-to-speech/${encodeURIComponent(
    opts.voiceId,
  )}/stream`;
  return fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": opts.apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: opts.text,
      model_id: opts.model ?? DEFAULT_TTS_MODEL,
      voice_settings: {
        stability: opts.stability ?? 0.4,
        similarity_boost: opts.similarityBoost ?? 0.75,
      },
    }),
    signal: opts.signal ?? AbortSignal.timeout(60_000),
    // Vercel edge/node: don't cache these ever.
    cache: "no-store",
  });
}
