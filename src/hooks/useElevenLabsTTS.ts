// Client-side hook that speaks a persona line via ElevenLabs.
//
// Phase 1 strategy — download-then-play (blob URL + HTMLAudioElement):
//   • Simplest cross-browser path that works everywhere the roleplay
//     player is likely to run (Chrome, Edge, Firefox, Safari desktop,
//     iOS Safari, Chrome Android).
//   • First-byte latency is higher than a true streaming pipe (~600ms
//     for a short sentence vs ~250ms), but the failure surface is
//     tiny — no MediaSource quirks, no codec bikeshedding.
//   • Phase 5 can upgrade to MediaSource / Web Audio for lower latency
//     without touching the caller's interface.
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

      let objectUrl: string | null = null;
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
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        audio.src = objectUrl;

        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            audio.removeEventListener("ended", onEnd);
            audio.removeEventListener("error", onErr);
            audio.removeEventListener("pause", onPause);
          };
          const onEnd = () => {
            cleanup();
            setPlaying(false);
            resolve();
          };
          const onErr = () => {
            cleanup();
            setPlaying(false);
            reject(new Error("audio_playback_error"));
          };
          const onPause = () => {
            // A pause we didn't drive (e.g. user hit a system control)
            // shouldn't hang the promise. Treat it as a natural end
            // if we're at/near the end, otherwise a soft cancel.
            if (audio.ended || audio.currentTime === 0) {
              cleanup();
              setPlaying(false);
              resolve();
            }
          };
          audio.addEventListener("ended", onEnd);
          audio.addEventListener("error", onErr);
          audio.addEventListener("pause", onPause);

          setPlaying(true);
          audio.play().catch((err) => {
            cleanup();
            setPlaying(false);
            reject(err instanceof Error ? err : new Error("audio_play_failed"));
          });
        });
      } catch (err) {
        // AbortError is expected on cancel — swallow it, everything else
        // bubbles so the caller can fall back to browser TTS.
        if (err instanceof Error && err.name === "AbortError") return;
        throw err;
      } finally {
        if (objectUrl && objectUrl === objectUrlRef.current) {
          URL.revokeObjectURL(objectUrl);
          objectUrlRef.current = null;
        }
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [cancel],
  );

  return { speak, cancel, playing };
}
