// Server-side ElevenLabs Speech-to-Text helper (Scribe).
//
// The realtime WebSocket variant doesn't proxy cleanly through Vercel
// serverless. Phase 2 therefore uses the buffered REST endpoint:
// client records a short chunk (typically ~2-6s between pauses),
// POSTs the blob to /api/roleplay/stt, we forward it here, and
// return the transcript.
//
// Endpoint:
//   POST https://api.elevenlabs.io/v1/speech-to-text
//   Content-Type: multipart/form-data
//   Fields:
//     file          — the audio blob (webm/opus or mp4/aac work fine)
//     model_id      — "scribe_v1" (default)
//     language_code — optional ISO 639-1 (e.g. "en", "hi"). Omit to
//                     let Scribe auto-detect.
//
// Response:
//   { text, language_code, language_probability, words[] }

const ELEVENLABS_BASE = "https://api.elevenlabs.io";

export const DEFAULT_STT_MODEL =
  process.env.ELEVENLABS_STT_MODEL ?? "scribe_v1";

export type SttResult = {
  text: string;
  languageCode?: string;
  languageProbability?: number;
};

export type TranscribeOpts = {
  apiKey: string;
  audio: Blob;
  filename?: string;
  model?: string;
  /** ISO 639-1 language hint. Improves accuracy for short chunks
   *  where Scribe's auto-detect might guess wrong. */
  languageCode?: string;
  signal?: AbortSignal;
};

export async function transcribe(opts: TranscribeOpts): Promise<SttResult> {
  const form = new FormData();
  // Scribe accepts webm/opus, mp3, mp4/aac, wav — anything reasonable.
  form.append("file", opts.audio, opts.filename ?? "audio.webm");
  form.append("model_id", opts.model ?? DEFAULT_STT_MODEL);
  if (opts.languageCode) form.append("language_code", opts.languageCode);

  const res = await fetch(`${ELEVENLABS_BASE}/v1/speech-to-text`, {
    method: "POST",
    headers: {
      "xi-api-key": opts.apiKey,
      // NOTE: do NOT set Content-Type — the browser/undici must
      // set it with the correct boundary for multipart.
    },
    body: form,
    signal: opts.signal ?? AbortSignal.timeout(30_000),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new SttError(res.status, body.slice(0, 500));
  }

  const data = (await res.json()) as {
    text?: string;
    language_code?: string;
    language_probability?: number;
  };
  return {
    text: (data.text ?? "").trim(),
    languageCode: data.language_code,
    languageProbability: data.language_probability,
  };
}

export class SttError extends Error {
  status: number;
  upstreamBody: string;
  constructor(status: number, upstreamBody: string) {
    super(`elevenlabs_stt_${status}`);
    this.status = status;
    this.upstreamBody = upstreamBody;
  }
}
