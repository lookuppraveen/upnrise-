"use client";

// Client-side hook that speaks a persona line via ElevenLabs.
//
// Phase 5 upgrade — MediaSource streaming with blob fallback:
//   • Preferred path: pipe ElevenLabs's chunked mp3 straight into a
//     MediaSource + SourceBuffer so the audio element starts playing
//     as soon as the first buffered chunk lands. First-word latency
//     drops from ~600ms (blob) to ~250ms (streamed).
//   • Fallback path: browsers without usable MediaSource — mainly
//     older iOS Safari — download the full response as a blob and
//     play that. Same UX as Phase 1, no worse.
//   • Detection is upfront (MediaSource.isTypeSupported for audio/mpeg)
//     so we don't consume the response body on a failed streaming
//     attempt. If MSE fails mid-stream, the caller falls back to
//     browser TTS for that utterance via the useVoiceMode kill switch.
//
// Failure model:
//   • The hook resolves normally on success and rejects on any error.
//   • Callers (useVoiceMode) catch that reject and fall back to
//     window.speechSynthesis for the current utterance, then flip a
//     session-scoped `ttsFallback` flag so subsequent turns skip the
//     network round-trip entirely instead of retry-storming.
//   • 503 from the route means "provider disabled" (kill switch or
//     missing key on prod) — permanent fallback for the session.
//   • 502 or a network error means "transient upstream problem" —
//     also fall back for the session; ops sees a log entry.

const STREAMING_MIME = "audio/mpeg";

function canStreamAudioMp3(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof MediaSource === "undefined") return false;
  try {
    return MediaSource.isTypeSupported(STREAMING_MIME);
  } catch {
    return false;
  }
}

import { useCallback, useEffect, useRef, useState } from "react";
import { pushTiming, getTurn } from "@/lib/roleplay/latency-telemetry";

export type ElevenLabsSpeakOpts = {
  voiceId?: string;
  gender?: "female" | "male";
  model?: string;
  /** RoleplaySession id the utterance belongs to. Sent to the route so
   *  voice_usage_log rows can be attributed to the session and counted
   *  against the per-session cap. Omit for previews / non-session TTS. */
  sessionId?: string | null;
};

/**
 * Handle returned by `prepare()`. The fetch is already in flight; call
 * `play()` when you want to hear it. Multiple prepared handles can be
 * held simultaneously so their fetches parallelize — the caller is
 * responsible for playing them in the right order (usually via a chain
 * so the single shared audio element only plays one at a time).
 */
export type PreparedSpeech = {
  /** Consume the buffered/streaming response and play it end-to-end. */
  play: () => Promise<void>;
  /** Abort the underlying fetch + playback if it hasn't been played yet. */
  cancel: () => void;
};

export type UseElevenLabsTTSResult = {
  /** Play `text` and resolve on `ended`. Throws on any error so the
   *  caller can fall back to browser TTS for that utterance. */
  speak: (text: string, opts?: ElevenLabsSpeakOpts) => Promise<void>;
  /** Start the TTS fetch now and return a handle whose `play()` method
   *  consumes the response later. Enables pipelining: prepare(N+1) while
   *  N is still playing so the network round-trip lands in parallel
   *  with the audio, eliminating the perceptible gap between chunks. */
  prepare: (
    text: string,
    opts?: ElevenLabsSpeakOpts,
  ) => Promise<PreparedSpeech>;
  /** Cancel any in-flight fetch + playback. Safe to call multiple times. */
  cancel: () => void;
  /** True while the audio element is playing back (used to drive the
   *  same "speaking" state as the browser TTS path). */
  playing: boolean;
};

export function useElevenLabsTTS(): UseElevenLabsTTSResult {
  const [playing, setPlaying] = useState(false);
  // One reusable Audio element per hook instance. Reusing it (rather
  // than creating a fresh one per call) matters on iOS Safari: the
  // first play() call needs to happen inside a user gesture, but
  // subsequent plays on the *same* element are permitted without one.
  // The trainee clicks Start (user gesture) → the persona's opening
  // line plays → every subsequent turn reuses the primed element.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Every prepare() gets its own controller so cancel() can abort them
  // all in one pass — including ones whose fetch has resolved but whose
  // play() hasn't been called yet (pipelined queue).
  const preparedControllersRef = useRef<Set<AbortController>>(new Set());
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const a = new Audio();
    a.preload = "auto";
    audioRef.current = a;
    return () => {
      try {
        a.pause();
      } catch {
        /* ignore */
      }
      a.removeAttribute("src");
      audioRef.current = null;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const cancel = useCallback(() => {
    // Abort every prepared handle — in-flight fetches, buffered-but-
    // unplayed responses, and the currently-playing one. Clearing the
    // set inside the loop is safe because each controller's own
    // teardown deletes itself; iterating a snapshot avoids a mutate-
    // during-iterate surprise.
    for (const c of Array.from(preparedControllersRef.current)) {
      c.abort();
    }
    preparedControllersRef.current.clear();
    const a = audioRef.current;
    if (a) {
      try {
        a.pause();
        // Rewind so the next play() starts fresh instead of resuming
        // from a paused mid-buffer position.
        a.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPlaying(false);
  }, []);

  const prepare = useCallback(
    async (
      text: string,
      opts?: ElevenLabsSpeakOpts,
    ): Promise<PreparedSpeech> => {
      const trimmed = text.trim();
      if (!trimmed) {
        // Empty text — hand back a no-op handle so callers don't have
        // to special-case blanks.
        return { play: async () => {}, cancel: () => {} };
      }
      const audio = audioRef.current;
      if (!audio) throw new Error("audio_element_missing");

      const controller = new AbortController();
      preparedControllersRef.current.add(controller);

      let res: Response;
      try {
        const tFetchStart = performance.now();
        res = await fetch("/api/roleplay/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: trimmed,
            voiceId: opts?.voiceId,
            gender: opts?.gender,
            model: opts?.model,
            sessionId: opts?.sessionId ?? undefined,
          }),
          signal: controller.signal,
        });
        // TTFB (headers received) — the audio hasn't started playing yet
        // but this is the number that determines "how long before the
        // trainee hears the first byte".
        const ttfbMs = Math.round(performance.now() - tFetchStart);
        const serverMsHeader = res.headers.get("X-Handler-Ms");
        const serverMs = serverMsHeader ? Number(serverMsHeader) : undefined;
        pushTiming({
          turn: getTurn(),
          kind: "tts",
          totalMs: ttfbMs,
          serverMs,
        });
        if (!res.ok) {
          throw new Error(`tts_${res.status}`);
        }
      } catch (err) {
        preparedControllersRef.current.delete(controller);
        if (err instanceof Error && err.name === "AbortError") {
          // Silent — caller cancelled before headers arrived.
          return { play: async () => {}, cancel: () => {} };
        }
        throw err;
      }

      let played = false;
      return {
        play: async () => {
          if (played) return;
          played = true;
          try {
            if (controller.signal.aborted) return;
            if (canStreamAudioMp3() && res.body) {
              await playViaMediaSource(
                audio,
                res.body,
                controller.signal,
                setPlaying,
              );
              return;
            }
            await playViaBlob(
              audio,
              res,
              controller.signal,
              setPlaying,
              (url) => {
                objectUrlRef.current = url;
              },
            );
          } catch (err) {
            if (err instanceof Error && err.name === "AbortError") return;
            throw err;
          } finally {
            preparedControllersRef.current.delete(controller);
          }
        },
        cancel: () => {
          if (played) return;
          controller.abort();
          preparedControllersRef.current.delete(controller);
        },
      };
    },
    [],
  );

  // speak() = cancel-any-existing + prepare + play. Kept for callers
  // that want the classic one-shot behavior (barge-in cancel of prior
  // audio, then this line takes over). Pipelined callers should use
  // prepare() directly.
  const speak = useCallback(
    async (text: string, opts?: ElevenLabsSpeakOpts): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed) return;
      cancel();
      const prep = await prepare(trimmed, opts);
      await prep.play();
    },
    [cancel, prepare],
  );

  return { speak, prepare, cancel, playing };
}

// ───────────────────────────────────────────────────────────────
// Playback paths
// ───────────────────────────────────────────────────────────────

/**
 * Streaming path: MediaSource + SourceBuffer. Audio starts playing as
 * soon as the first chunk is decoded — usually 200–350ms after the
 * fetch resolves. On any error mid-stream the promise rejects; the
 * caller (useVoiceMode) falls back to browser TTS for the utterance.
 */
async function playViaMediaSource(
  audio: HTMLAudioElement,
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  setPlaying: (v: boolean) => void,
): Promise<void> {
  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  audio.src = objectUrl;

  try {
    await waitForSourceOpen(mediaSource);
    const sourceBuffer = mediaSource.addSourceBuffer(STREAMING_MIME);

    // Kick playback the moment the first bytes land — Safari won't
    // auto-start otherwise, and Chrome benefits from the head start.
    setPlaying(true);
    const playPromise = audio.play().catch((err) => {
      throw err instanceof Error ? err : new Error("audio_play_failed");
    });

    const reader = body.getReader();
    while (true) {
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        await appendChunk(sourceBuffer, value);
      }
    }

    // Signal end-of-stream so `ended` fires after the buffered tail
    // plays out. Wait for the play() promise so a very fast, short
    // response doesn't race the state transition.
    await playPromise;
    if (mediaSource.readyState === "open") {
      try {
        mediaSource.endOfStream();
      } catch {
        /* readyState raced closed — nothing to do */
      }
    }

    await waitForEnded(audio, signal);
  } finally {
    setPlaying(false);
    URL.revokeObjectURL(objectUrl);
  }
}

function waitForSourceOpen(ms: MediaSource): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("mediasource_error"));
    };
    const cleanup = () => {
      ms.removeEventListener("sourceopen", onOpen);
      ms.removeEventListener("error", onErr);
    };
    ms.addEventListener("sourceopen", onOpen);
    ms.addEventListener("error", onErr);
  });
}

function appendChunk(
  sb: SourceBuffer,
  chunk: Uint8Array,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onEnd = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("sourcebuffer_append_error"));
    };
    const cleanup = () => {
      sb.removeEventListener("updateend", onEnd);
      sb.removeEventListener("error", onErr);
    };
    sb.addEventListener("updateend", onEnd);
    sb.addEventListener("error", onErr);
    try {
      // Some browsers want a plain ArrayBuffer, not a typed-array view
      // that might reference a shared buffer offset. .slice() copies.
      sb.appendBuffer(chunk.slice().buffer);
    } catch (err) {
      cleanup();
      reject(err instanceof Error ? err : new Error("append_threw"));
    }
  });
}

function waitForEnded(
  audio: HTMLAudioElement,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onEnd = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("audio_playback_error"));
    };
    const onPause = () => {
      // Native pause we didn't drive → treat near-end as clean, else soft-cancel.
      if (audio.ended || audio.currentTime === 0) {
        cleanup();
        resolve();
      }
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("aborted", "AbortError"));
    };
    const cleanup = () => {
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("error", onErr);
      audio.removeEventListener("pause", onPause);
      signal.removeEventListener("abort", onAbort);
    };
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("error", onErr);
    audio.addEventListener("pause", onPause);
    signal.addEventListener("abort", onAbort);
  });
}

/**
 * Fallback path: download the full response as a blob and play. Used
 * on browsers without a usable MediaSource for audio/mpeg (mainly
 * older iOS Safari). Identical UX to the Phase 1 implementation.
 */
async function playViaBlob(
  audio: HTMLAudioElement,
  res: Response,
  signal: AbortSignal,
  setPlaying: (v: boolean) => void,
  registerObjectUrl: (url: string) => void,
): Promise<void> {
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  registerObjectUrl(objectUrl);
  audio.src = objectUrl;

  try {
    setPlaying(true);
    audio.play().catch((err) => {
      throw err instanceof Error ? err : new Error("audio_play_failed");
    });
    await waitForEnded(audio, signal);
  } finally {
    setPlaying(false);
    URL.revokeObjectURL(objectUrl);
  }
}
