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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ElevenLabsSpeakOpts = {
  voiceId?: string;
  gender?: "female" | "male";
  model?: string;
  /** RoleplaySession id the utterance belongs to. Sent to the route so
   *  voice_usage_log rows can be attributed to the session and counted
   *  against the per-session cap. Omit for previews / non-session TTS. */
  sessionId?: string | null;
};

export type UseElevenLabsTTSResult = {
  /** Play `text` and resolve on `ended`. Throws on any error so the
   *  caller can fall back to browser TTS for that utterance. */
  speak: (text: string, opts?: ElevenLabsSpeakOpts) => Promise<void>;
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
  const abortRef = useRef<AbortController | null>(null);
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
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
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

  const speak = useCallback(
    async (text: string, opts?: ElevenLabsSpeakOpts): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const audio = audioRef.current;
      if (!audio) throw new Error("audio_element_missing");

      // Kill any prior in-flight fetch / playback so overlapping turns
      // don't queue.
      cancel();

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/roleplay/tts", {
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
        if (!res.ok) {
          const status = res.status;
          throw new Error(`tts_${status}`);
        }

        // MediaSource path when the browser can decode chunked mp3 —
        // first word plays ~2-3× sooner than the blob approach.
        if (canStreamAudioMp3() && res.body) {
          await playViaMediaSource(
            audio,
            res.body,
            controller.signal,
            setPlaying,
          );
          return;
        }

        // Fallback: buffer the whole response, play as a blob. iOS
        // Safari <17.1 lands here; so does anything without MSE.
        await playViaBlob(audio, res, controller.signal, setPlaying, (url) => {
          objectUrlRef.current = url;
        });
      } catch (err) {
        // AbortError is expected on cancel — swallow it, everything else
        // bubbles so the caller can fall back to browser TTS.
        if (err instanceof Error && err.name === "AbortError") return;
        throw err;
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [cancel],
  );

  return { speak, cancel, playing };
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
