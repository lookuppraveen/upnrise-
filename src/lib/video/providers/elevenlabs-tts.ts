// ElevenLabs Text-to-Speech driver.
//
// Used by the narration module type (admin-authored audio narration
// for trainee playback). Distinct from the VideoDriver interface in
// types.ts because there's no render job / polling lifecycle here —
// ElevenLabs returns the finished audio bytes synchronously on POST.
//
// API:
//   POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
//   Headers: { xi-api-key, Content-Type: application/json, Accept: audio/mpeg }
//   Body:    { text, model_id?, voice_settings? }
//   Returns: audio/mpeg bytes (we use mp3 — broadest browser support)
//
// Docs: https://elevenlabs.io/docs/api-reference/text-to-speech

const ELEVENLABS_BASE = "https://api.elevenlabs.io";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // "Rachel" — ElevenLabs default catalogue voice
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
// ElevenLabs accepts up to ~5000 chars per request. We split anything
// longer into chunks at sentence boundaries, then concatenate. This
// matches our narration editor's "Generate audio" UX where the admin
// pastes a paragraph-length script.
const MAX_CHARS_PER_REQUEST = 4500;

export type ElevenLabsRenderOpts = {
  apiKey: string;
  voiceId: string | null;
  script: string;
};

/**
 * Render a script to mp3 bytes. Splits long scripts at sentence
 * boundaries so each chunk stays under the API's per-request limit,
 * then concatenates the responses. The split-concat pattern is safe for
 * mp3 (frames are self-contained) and avoids us having to mux through
 * ffmpeg server-side.
 */
export async function renderNarrationAudio(
  opts: ElevenLabsRenderOpts,
): Promise<{ bytes: Uint8Array; contentType: "audio/mpeg" }> {
  const text = opts.script.trim();
  if (!text) throw new Error("script is empty");
  const voiceId = (opts.voiceId ?? DEFAULT_VOICE_ID).trim() || DEFAULT_VOICE_ID;
  const chunks = chunkScript(text, MAX_CHARS_PER_REQUEST);

  const buffers: Uint8Array[] = [];
  for (const chunk of chunks) {
    const buf = await postChunk({
      apiKey: opts.apiKey,
      voiceId,
      text: chunk,
    });
    buffers.push(buf);
  }

  // Concatenate mp3 segments. Frame-aligned mp3s play back as one file.
  const total = buffers.reduce((n, b) => n + b.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    out.set(b, offset);
    offset += b.byteLength;
  }
  return { bytes: out, contentType: "audio/mpeg" };
}

async function postChunk(opts: {
  apiKey: string;
  voiceId: string;
  text: string;
}): Promise<Uint8Array> {
  const res = await fetch(
    `${ELEVENLABS_BASE}/v1/text-to-speech/${encodeURIComponent(opts.voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": opts.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: opts.text,
        model_id: DEFAULT_MODEL_ID,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `ElevenLabs rejected the API key (HTTP ${res.status}). Update the key at /admin/video-providers. Upstream: ${errText.slice(0, 160)}`,
      );
    }
    throw new Error(
      `ElevenLabs TTS failed (${res.status}): ${errText.slice(0, 200)}`,
    );
  }
  const arr = await res.arrayBuffer();
  return new Uint8Array(arr);
}

/**
 * Split text at sentence boundaries so each chunk is under `max` chars.
 * Falls back to a hard slice if a single sentence exceeds `max`.
 */
function chunkScript(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)|.+$/g) ?? [text];
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (s.length > max) {
      if (buf) {
        out.push(buf);
        buf = "";
      }
      for (let i = 0; i < s.length; i += max) {
        out.push(s.slice(i, i + max));
      }
      continue;
    }
    if ((buf + s).length > max) {
      out.push(buf);
      buf = s;
    } else {
      buf += s;
    }
  }
  if (buf) out.push(buf);
  return out;
}
