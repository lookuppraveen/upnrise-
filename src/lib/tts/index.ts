// Per-tenant TTS factory. Mirrors src/lib/video/index.ts.
//
// Resolution order:
//   1. Tenant TtsProvider row with isDefault=true
//   2. ELEVENLABS_API_KEY env var (legacy default — behaves exactly like
//      the pre-factory /api/roleplay/tts route)
//
// The streamTts() method returns a raw upstream Response so callers can
// pipe the audio body straight to the browser without buffering. That
// matches how src/lib/voice/elevenlabs-tts-stream.ts already works, and
// keeps time-to-first-byte low.

import "server-only";
import type { TtsProviderKind } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import {
  streamTts as elevenLabsStreamTts,
  DEFAULT_TTS_MODEL as ELEVENLABS_DEFAULT_MODEL,
} from "@/lib/voice/elevenlabs-tts-stream";

const SARVAM_TTS_ENDPOINT = "https://api.sarvam.ai/text-to-speech";
const SARVAM_DEFAULT_MODEL = "bulbul:v2";
// Sarvam's default English-friendly voice. Admins override per-provider.
const SARVAM_DEFAULT_VOICE = "meera";

export type TtsSynthArgs = {
  text: string;
  /** Overrides the tenant provider's default voiceId. */
  voiceId?: string;
  /** Overrides the tenant provider's default model. */
  model?: string;
  signal?: AbortSignal;
};

export type TtsDriver = {
  kind: TtsProviderKind;
  /** The voiceId a caller should use when it hasn't been told otherwise. */
  defaultVoiceId: string | null;
  /** The model a caller should use when it hasn't been told otherwise. */
  defaultModel: string;
  /**
   * Fire an upstream TTS request and return the raw Response. The body
   * is audio/mpeg (ElevenLabs) or audio/wav (Sarvam) — callers should
   * read Content-Type off the response, not assume mp3.
   */
  streamTts(args: TtsSynthArgs): Promise<Response>;
};

/**
 * Resolve a TTS driver for the given company. Falls back to a driver
 * hydrated from the ELEVENLABS_API_KEY env var when the tenant hasn't
 * configured a provider yet, so existing behavior is preserved.
 * Returns null when no driver can be resolved (no tenant row + no env
 * fallback) — the caller should return provider_disabled.
 */
export async function getTtsDriver(
  companyId: string | null,
): Promise<TtsDriver | null> {
  if (companyId) {
    const row = await prisma.ttsProvider
      .findFirst({
        where: { companyId, isDefault: true },
      })
      .catch(() => null);
    if (row) {
      return row.kind === "sarvam"
        ? buildSarvamDriver({
            apiKey: row.apiKey,
            voiceId: row.voiceId ?? SARVAM_DEFAULT_VOICE,
            model: row.model ?? SARVAM_DEFAULT_MODEL,
          })
        : buildElevenLabsDriver({
            apiKey: row.apiKey,
            voiceId: row.voiceId,
            model: row.model ?? ELEVENLABS_DEFAULT_MODEL,
          });
    }
  }

  // Legacy env fallback — keeps the pre-factory behavior working.
  const envKey = process.env.ELEVENLABS_API_KEY;
  if (envKey && envKey.trim().length >= 8) {
    return buildElevenLabsDriver({
      apiKey: envKey.trim(),
      voiceId: null,
      model: ELEVENLABS_DEFAULT_MODEL,
    });
  }
  return null;
}

// ─── Drivers ───

function buildElevenLabsDriver(cfg: {
  apiKey: string;
  voiceId: string | null;
  model: string;
}): TtsDriver {
  return {
    kind: "elevenlabs",
    defaultVoiceId: cfg.voiceId,
    defaultModel: cfg.model,
    streamTts: (args) =>
      elevenLabsStreamTts({
        apiKey: cfg.apiKey,
        voiceId: args.voiceId ?? cfg.voiceId ?? "",
        text: args.text,
        model: args.model ?? cfg.model,
        signal: args.signal,
      }),
  };
}

function buildSarvamDriver(cfg: {
  apiKey: string;
  voiceId: string;
  model: string;
}): TtsDriver {
  return {
    kind: "sarvam",
    defaultVoiceId: cfg.voiceId,
    defaultModel: cfg.model,
    streamTts: async (args) => {
      const voice = args.voiceId ?? cfg.voiceId;
      const model = args.model ?? cfg.model;
      // Sarvam returns a JSON payload with a base64-encoded WAV in
      // `audios[0]`. We unwrap it into a proper audio/wav Response so
      // callers can treat both drivers uniformly.
      const upstream = await fetch(SARVAM_TTS_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-subscription-key": cfg.apiKey,
        },
        body: JSON.stringify({
          inputs: [args.text],
          target_language_code: "en-IN",
          speaker: voice,
          model,
        }),
        signal: args.signal ?? AbortSignal.timeout(60_000),
        cache: "no-store",
      });
      if (!upstream.ok) {
        // Return the error response as-is so callers can log status/body.
        return upstream;
      }
      const json = (await upstream.json().catch(() => null)) as {
        audios?: string[];
      } | null;
      const b64 = json?.audios?.[0];
      if (!b64) {
        return new Response(
          JSON.stringify({ error: "sarvam_no_audio_payload" }),
          { status: 502, headers: { "Content-Type": "application/json" } },
        );
      }
      const bytes = Buffer.from(b64, "base64");
      return new Response(bytes, {
        status: 200,
        headers: {
          "Content-Type": "audio/wav",
          "Cache-Control": "no-store",
        },
      });
    },
  };
}

// Re-export client-safe UI constants — they live in constants.ts so
// client components can import them without pulling in prisma / the
// server-only ElevenLabs stream helper.
export {
  TTS_PROVIDER_LABEL,
  TTS_PROVIDER_DESCRIPTION,
  TTS_PROVIDER_KINDS,
  TTS_VOICE_HINT,
} from "./constants";
