// Client-side speech-to-text via ElevenLabs Scribe.
//
// Buffered pattern (Phase 2 — see the design note in the TTS route):
//   1. getUserMedia() gets the mic stream (cached across utterances so
//      we don't re-prompt for permission every turn).
//   2. MediaRecorder captures audio in webm/opus (or mp4/aac on Safari).
//   3. A parallel AudioContext + AnalyserNode measures RMS volume every
//      100ms — that's the VAD.
//   4. State machine:
//        Silent  → volume > threshold for ≥ MIN_SPEECH_MS → Speaking
//        Speaking → volume < threshold for silenceThresholdMs → commit
//   5. On commit: stop MediaRecorder, POST the blob to /api/roleplay/stt,
//      fire onTranscript with the returned text.
//
// Cross-browser mime picker:
//   - Chrome/Edge/Firefox: audio/webm;codecs=opus
//   - Safari desktop/iOS:  audio/mp4
// If nothing supported → supported=false and the caller falls back
// to browser SpeechRecognition (or shows "type instead" on Firefox).
//
// Failure model matches TTS: any error → the caller catches it in
// its wrapper and falls back to browser STT for the current turn AND
// flips a session-scoped kill switch so we don't retry-storm.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ListeningMode = "active" | "background";

// Volume threshold on a 0-255 byte scale (from AnalyserNode). 20 is a
// reasonable middle for the median mic in a quiet room. Trainees on
// noisy backgrounds (open office, café) may false-trigger — Phase 5
// can add adaptive noise-floor calibration.
const VOLUME_THRESHOLD = 20;
// Minimum time above threshold before we consider it "real speech"
// (not a cough / mic bump). Avoids sending 100ms of noise to Scribe.
const MIN_SPEECH_MS = 250;
// How often the VAD polls the analyser. 100ms is a good balance of
// responsiveness and CPU cost.
const VAD_TICK_MS = 100;
// Fallback silence threshold if the caller doesn't provide one.
const DEFAULT_SILENCE_MS = 1200;

function pickMimeType(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return null;
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mpeg",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return null;
}

type Options = {
  enabled: boolean;
  languageCode?: string;
  silenceThresholdMs?: number;
  onTranscript: (text: string) => void;
  /** Fired when speech is detected during "background" mode (used by
   *  the player to cancel persona TTS). */
  onInterruption?: () => void;
};

export type UseElevenLabsSTTResult = {
  /** MediaRecorder + getUserMedia both available on this browser. */
  supported: boolean;
  state: "idle" | "listening";
  /** Attempt to open the mic (prompts for permission on first call). */
  startListening: (opts?: { mode?: ListeningMode }) => Promise<void>;
  /** Switch an already-open mic between background and active without
   *  restarting the MediaRecorder session. */
  setListeningMode: (mode: ListeningMode) => void;
  stopListening: () => void;
};

export function useElevenLabsSTT(opts: Options): UseElevenLabsSTTResult {
  const {
    enabled,
    languageCode,
    silenceThresholdMs = DEFAULT_SILENCE_MS,
    onTranscript,
    onInterruption,
  } = opts;

  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<"idle" | "listening">("idle");

  // Live refs so the VAD tick doesn't need to be re-created on every
  // render or option change.
  const onTranscriptRef = useRef(onTranscript);
  const onInterruptionRef = useRef(onInterruption);
  const silenceThresholdRef = useRef(silenceThresholdMs);
  const languageCodeRef = useRef(languageCode);
  const modeRef = useRef<ListeningMode>("active");
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);
  useEffect(() => {
    onInterruptionRef.current = onInterruption;
  }, [onInterruption]);
  useEffect(() => {
    silenceThresholdRef.current = silenceThresholdMs;
  }, [silenceThresholdMs]);
  useEffect(() => {
    languageCodeRef.current = languageCode;
  }, [languageCode]);

  // Long-lived resources — held across utterances so we don't
  // re-prompt for mic permission every turn.
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mimeRef = useRef<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speechStartedAtRef = useRef<number | null>(null);
  const lastSoundAtRef = useRef<number | null>(null);
  const hasSpokeRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mime = pickMimeType();
    mimeRef.current = mime;
    setSupported(
      !!mime &&
        typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia,
    );
  }, []);

  const teardownVad = useCallback(() => {
    if (vadTimerRef.current) {
      clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
  }, []);

  const stopRecorder = useCallback((discard: boolean) => {
    const rec = recorderRef.current;
    if (!rec) return;
    try {
      if (rec.state !== "inactive") rec.stop();
    } catch {
      /* already stopped */
    }
    recorderRef.current = null;
    if (discard) {
      chunksRef.current = [];
    }
  }, []);

  const stopListening = useCallback(() => {
    teardownVad();
    stopRecorder(true);
    hasSpokeRef.current = false;
    speechStartedAtRef.current = null;
    lastSoundAtRef.current = null;
    setState("idle");
  }, [teardownVad, stopRecorder]);

  // Commit path: recorder stops, its final blob resolves, we POST it.
  // Called when the VAD sees silence for silenceThresholdMs AFTER real
  // speech was detected. The returned promise is fire-and-forget from
  // the caller's POV — onTranscript fires when the round-trip finishes.
  const commit = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    // Grab whatever chunks land after stop().
    const finalChunks = chunksRef.current;
    chunksRef.current = [];
    hasSpokeRef.current = false;
    speechStartedAtRef.current = null;
    lastSoundAtRef.current = null;

    const doneBlob = new Promise<Blob>((resolve) => {
      const mime = mimeRef.current ?? "audio/webm";
      // Some browsers fire ondataavailable AFTER stop() completes;
      // wait for that final chunk before assembling.
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) finalChunks.push(e.data);
      };
      rec.onstop = () => {
        resolve(new Blob(finalChunks, { type: mime }));
      };
      try {
        rec.stop();
      } catch {
        // If stop throws, resolve with whatever we have.
        resolve(new Blob(finalChunks, { type: mime }));
      }
    });

    recorderRef.current = null;

    let blob: Blob;
    try {
      blob = await doneBlob;
    } catch {
      return;
    }
    // Discard tiny blobs — usually a mis-fired VAD or a cough. Below
    // ~1KB of opus is well under 100ms of audio.
    if (blob.size < 1024) return;

    try {
      const form = new FormData();
      form.append("audio", blob);
      if (languageCodeRef.current) {
        form.append("languageCode", languageCodeRef.current);
      }
      const res = await fetch("/api/roleplay/stt", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        // Let the caller catch this via a session-scoped fallback.
        throw new Error(`stt_${res.status}`);
      }
      const data = (await res.json()) as { text?: string };
      const text = (data.text ?? "").trim();
      // Silence is idle — the parent typically re-opens the mic on
      // the next turn via a fresh startListening() call.
      setState("idle");
      if (text) onTranscriptRef.current(text);
    } catch (err) {
      // Silently swallow so a network blip doesn't break the mic loop.
      // The caller (useVoiceMode) monitors the STT hook's overall
      // health via a separate error path if needed.
      console.warn(
        "[stt] POST failed",
        err instanceof Error ? err.message : err,
      );
    }
  }, []);

  // Compute RMS over the analyser's byte buffer. Fast enough to run
  // at 10Hz without touching the render loop.
  const readVolume = useCallback((): number => {
    const an = analyserRef.current;
    if (!an) return 0;
    const buf = new Uint8Array(an.fftSize);
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i] - 128;
      sum += v * v;
    }
    return Math.sqrt(sum / buf.length);
  }, []);

  const startVadLoop = useCallback(() => {
    teardownVad();
    speechStartedAtRef.current = null;
    lastSoundAtRef.current = null;
    hasSpokeRef.current = false;

    vadTimerRef.current = setInterval(() => {
      const vol = readVolume();
      const now = Date.now();
      const isSound = vol > VOLUME_THRESHOLD;

      if (modeRef.current === "background") {
        // Interruption detection during persona TTS: any sustained
        // sound flips us to active AND fires the callback.
        if (isSound) {
          if (speechStartedAtRef.current == null) {
            speechStartedAtRef.current = now;
          } else if (now - speechStartedAtRef.current >= MIN_SPEECH_MS) {
            modeRef.current = "active";
            onInterruptionRef.current?.();
            hasSpokeRef.current = true;
            lastSoundAtRef.current = now;
          }
        } else {
          speechStartedAtRef.current = null;
        }
        return;
      }

      // Active mode: track speech onset then wait for silence.
      if (isSound) {
        if (speechStartedAtRef.current == null) {
          speechStartedAtRef.current = now;
        } else if (
          !hasSpokeRef.current &&
          now - speechStartedAtRef.current >= MIN_SPEECH_MS
        ) {
          hasSpokeRef.current = true;
        }
        lastSoundAtRef.current = now;
      } else if (
        hasSpokeRef.current &&
        lastSoundAtRef.current != null &&
        now - lastSoundAtRef.current >= silenceThresholdRef.current
      ) {
        // Silence has run long enough after real speech — commit.
        teardownVad();
        void commit();
      }
    }, VAD_TICK_MS);
  }, [readVolume, teardownVad, commit]);

  const ensureMedia = useCallback(async (): Promise<boolean> => {
    if (streamRef.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) throw new Error("no AudioContext");
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;
      return true;
    } catch (err) {
      console.warn(
        "[stt] getUserMedia failed",
        err instanceof Error ? err.message : err,
      );
      return false;
    }
  }, []);

  const startListening = useCallback(
    async (o?: { mode?: ListeningMode }) => {
      if (!enabled || !supported) return;
      const ok = await ensureMedia();
      if (!ok) return;
      const stream = streamRef.current;
      const mime = mimeRef.current;
      if (!stream || !mime) return;

      // Kill any prior recorder so overlapping utterances don't
      // stack. VAD loop restarts fresh below.
      stopRecorder(true);

      modeRef.current = o?.mode ?? "active";
      chunksRef.current = [];
      const rec = new MediaRecorder(stream, { mimeType: mime });
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = rec;
      try {
        // Chunked start so a mid-utterance stop still has data.
        rec.start(250);
      } catch (err) {
        console.warn(
          "[stt] MediaRecorder.start failed",
          err instanceof Error ? err.message : err,
        );
        recorderRef.current = null;
        return;
      }
      setState("listening");
      startVadLoop();
    },
    [enabled, supported, ensureMedia, stopRecorder, startVadLoop],
  );

  const setListeningMode = useCallback((mode: ListeningMode) => {
    modeRef.current = mode;
    // Reset speech-onset tracking so the mode switch doesn't
    // false-commit against stale timers.
    speechStartedAtRef.current = null;
    lastSoundAtRef.current = null;
    hasSpokeRef.current = false;
  }, []);

  // Full teardown when the hook unmounts or the feature disables.
  useEffect(() => {
    if (enabled) return;
    stopListening();
    // Also release the mic + audio graph so the tab drops its
    // "recording" indicator when voice mode is off.
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {
        /* ignore */
      });
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }, [enabled, stopListening]);

  useEffect(() => {
    return () => {
      // Cleanup on unmount even if enabled was left true.
      if (vadTimerRef.current) clearInterval(vadTimerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {
          /* ignore */
        });
      }
    };
  }, []);

  return { supported, state, startListening, setListeningMode, stopListening };
}
