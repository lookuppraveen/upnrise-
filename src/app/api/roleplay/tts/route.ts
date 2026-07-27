// POST /api/roleplay/tts
//
// Body: { text: string, voiceId?: string }
// Resp: audio/mpeg streamed body
//
// Reads ELEVENLABS_API_KEY server-side; pipes ElevenLabs's streaming
// mp3 response straight back to the client so the trainee hears the
// persona voice as soon as the first bytes arrive.
//
// Failure modes and status codes (all handled by the client with a
// graceful fallback to window.speechSynthesis for the current session):
//
//   401 unauthorized        — trainee not signed in
//   403 forbidden           — role not allowed to run roleplays
//   400 bad body            — text missing / too long
//   503 provider disabled   — VOICE_PROVIDER_DEFAULT=browser or key missing
//                              (client should fall back silently)
//   502 upstream error      — ElevenLabs returned non-2xx
//                              (client should fall back + toast)
//
// Auth is required so anonymous callers can't rack up TTS spend.

import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import {
  streamTts,
  DEFAULT_TTS_MODEL,
} from "@/lib/voice/elevenlabs-tts-stream";
import { pickDefaultVoice } from "@/lib/voice/voice-catalog";

const Body = z.object({
  text: z.string().trim().min(1).max(2000),
  voiceId: z.string().trim().min(1).max(100).optional(),
  /** Optional gender hint when voiceId isn't provided — Phase 1 default
   *  path so the client can just say "female" / "male" and get sensible
   *  audio without the admin having picked a voice yet. */
  gender: z.enum(["female", "male"]).optional(),
  /** For non-English personas the client can force multilingual. */
  model: z.string().trim().min(1).max(60).optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user)
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  if (user.role !== "trainee" && user.role !== "admin")
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });

  // Global kill switch — flip VOICE_PROVIDER_DEFAULT=browser to force
  // every session onto browser TTS without a code change.
  const providerDefault = process.env.VOICE_PROVIDER_DEFAULT ?? "elevenlabs";
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (providerDefault !== "elevenlabs" || !apiKey) {
    return new Response(JSON.stringify({ error: "provider_disabled" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return new Response(JSON.stringify({ error: "bad_body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

  const voiceId =
    parsed.data.voiceId ?? pickDefaultVoice(parsed.data.gender ?? null).id;

  const upstream = await streamTts({
    apiKey,
    voiceId,
    text: parsed.data.text,
    model: parsed.data.model ?? DEFAULT_TTS_MODEL,
    signal: req.signal,
  }).catch((err: unknown) => {
    console.error(
      "[roleplay/tts] elevenlabs fetch threw",
      err instanceof Error ? err.message : err,
    );
    return null;
  });

  if (!upstream || !upstream.ok || !upstream.body) {
    const statusMsg = upstream ? `${upstream.status}` : "network";
    const errText = upstream
      ? await upstream.text().catch(() => "")
      : "";
    console.error(
      `[roleplay/tts] upstream ${statusMsg} for voice ${voiceId}: ${errText.slice(0, 200)}`,
    );
    return new Response(JSON.stringify({ error: "upstream_error" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Pipe the streaming mp3 straight through. The client plays it via
  // <audio src=blob:...>; when we later switch to MediaSource for
  // token-level playback, this route doesn't change.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      // Help debuggers correlate a client toast to an upstream call.
      "X-TTS-Voice": voiceId,
    },
  });
}
