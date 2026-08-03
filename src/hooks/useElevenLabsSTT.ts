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

// Adaptive VAD tuning (Phase 5).
//
// Threshold is calibrated per-mic-open to the trainee's actual noise
// floor: sample volume for the first CALIBRATION_MS, take the mean,
// multiply by NOISE_MULTIPLIER, floor at MIN_THRESHOLD. Handles the
// full range from a quiet home office (baseline ~5) to a café or open
// floor (baseline ~30) without needing per-user config.
// Lowered from 15 → 3 to handle quiet built-in laptop mics. Real
// ambient noise almost never sustains at 3+; below-threshold speech
// is the more common failure mode (users complain "nothing happens").
// Combined with the analyser GainNode boost below, the effective bar
// is around 12 pre-boost, which comfortably captures normal speech
// even on very quiet hardware.
const MIN_THRESHOLD = 3;
const FALLBACK_THRESHOLD = 8; // used before calibration completes
const NOISE_MULTIPLIER = 3.0;
const CALIBRATION_MS = 500;
// Analyser-only gain boost. The AnalyserNode gets `source → GainNode
// → Analyser` so the VAD reads a louder signal for detection
// purposes; MediaRecorder still gets the raw stream so audio quality
// to the STT server is unchanged. 4× is enough to lift a stubbornly
// quiet mic (peak vol 3-4 without boost) into confidently-detectable
// range without saturating a normal mic.
const ANALYSER_GAIN = 4.0;
// Minimum time above threshold before we consider it "real speech".
// Two values because the modes have different noise profiles:
//   - active mode (mic-only, TTS silent): 250ms — a short "yes" or
//     "hi" still triggers, coughs don't.
//   - background mode (mic open DURING persona TTS): 800ms — this is
//     the false-barge-in filter. Persona voice bleeding into the mic
//     on speakers/laptop mics can sustain 400-600ms bursts as phrases
//     land. A real interruption from the trainee easily crosses 800ms
//     because they're speaking their own full sentence, not just a
//     word-echo. Prior 500ms let too much bleed through, which then
//     cascaded into the "calibrate-during-wind-down → threshold-too-
//     high → stuck mic" pathology.
const MIN_SPEECH_MS_ACTIVE = 250;
const MIN_SPEECH_MS_BACKGROUND = 800;
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
  /** RoleplaySession id — sent to /api/roleplay/stt for cost
   *  attribution. Null before start returns; TTS route accepts
   *  omitted sessionId so a leading gap doesn't error. */
  sessionId?: string | null;
  onTranscript: (text: string) => void;
  /** Fired when speech is detected during "background" mode (used by
   *  the player to cancel persona TTS). */
  onInterruption?: () => void;
};

export type SttError =
  | "permission_denied"
  | "no_device"
  | "in_use"
  | "unsupported"
  | "unknown";

export type UseElevenLabsSTTResult = {
  /** MediaRecorder + getUserMedia both available on this browser. */
  supported: boolean;
  state: "idle" | "listening";
  /** Last mic-open error. `null` when mic is healthy or hasn't been
   *  tried yet. Consumers (useVoiceMode / RoleplayPlayer) render this
   *  as a user-facing message so a denied mic isn't invisible. */
  error: SttError | null;
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
    sessionId,
    onTranscript,
    onInterruption,
  } = opts;

  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<"idle" | "listening">("idle");
  const [error, setError] = useState<SttError | null>(null);

  // Live refs so the VAD tick doesn't need to be re-created on every
  // render or option change.
  const onTranscriptRef = useRef(onTranscript);
  const onInterruptionRef = useRef(onInterruption);
  const silenceThresholdRef = useRef(silenceThresholdMs);
  const languageCodeRef = useRef(languageCode);
  const sessionIdRef = useRef(sessionId ?? null);
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
  useEffect(() => {
    sessionIdRef.current = sessionId ?? null;
  }, [sessionId]);

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
  // Adaptive VAD state — reset on every startListening. We collect
  // volume samples during the calibration window, then lock in a
  // threshold based on the observed noise floor.
  const calibrationStartRef = useRef<number | null>(null);
  const calibrationSamplesRef = useRef<number[]>([]);
  const adaptiveThresholdRef = useRef(FALLBACK_THRESHOLD);
  // Throttled VAD trace — log once per second so the console isn't
  // flooded but we can still see mode + volume + threshold health.
  const lastTraceAtRef = useRef(0);

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
    console.log("[stt] commit called", { hasRecorder: !!rec });
    if (!rec) return;
    // Grab whatever chunks land after stop().
    const finalChunks = chunksRef.current;
    chunksRef.current = [];
    hasSpokeRef.current = false;
    speechStartedAtRef.current = null;
    lastSoundAtRef.current = null;

    const doneBlob = new Promise<Blob>((resolve) => {
      // Container-only mime for the assembled blob. MediaRecorder is
      // created with the full "audio/webm;codecs=opus" hint (Chrome
      // needs it), but Scribe's upload parser rejects blobs whose
      // Content-Type includes the codec suffix as "corrupted". Strip
      // to just the container ("audio/webm" or "audio/mp4") for the
      // final blob type so the multipart part header is clean.
      const rawMime = mimeRef.current ?? "audio/webm";
      const containerMime = rawMime.split(";")[0].trim() || "audio/webm";
      // Some browsers fire ondataavailable AFTER stop() completes;
      // wait for that final chunk before assembling.
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) finalChunks.push(e.data);
      };
      rec.onstop = () => {
        resolve(new Blob(finalChunks, { type: containerMime }));
      };
      try {
        rec.stop();
      } catch {
        // If stop throws, resolve with whatever we have.
        resolve(new Blob(finalChunks, { type: containerMime }));
      }
    });

    recorderRef.current = null;

    let blob: Blob;
    try {
      blob = await doneBlob;
    } catch {
      return;
    }
    console.log("[stt] blob assembled", {
      size: blob.size,
      type: blob.type,
      chunkCount: finalChunks.length,
    });
    // Discard tiny blobs — usually a mis-fired VAD or a cough. Below
    // ~1KB of opus is well under 100ms of audio.
    if (blob.size < 1024) {
      console.log("[stt] blob too small, discarding");
      return;
    }

    try {
      const form = new FormData();
      form.append("audio", blob);
      if (languageCodeRef.current) {
        form.append("languageCode", languageCodeRef.current);
      }
      if (sessionIdRef.current) {
        form.append("sessionId", sessionIdRef.current);
      }
      console.log("[stt] POST /api/roleplay/stt");
      const res = await fetch("/api/roleplay/stt", {
        method: "POST",
        body: form,
      });
      console.log("[stt] POST result", res.status);
      if (!res.ok) {
        // Let the caller catch this via a session-scoped fallback.
        throw new Error(`stt_${res.status}`);
      }
      const data = (await res.json()) as { text?: string };
      const text = (data.text ?? "").trim();
      console.log("[stt] transcribed", { textLen: text.length, textPreview: text.slice(0, 40) });
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
    // Reset adaptive calibration for this listening session. The
    // threshold falls back to FALLBACK_THRESHOLD until CALIBRATION_MS
    // of samples land, then locks in based on the observed noise floor.
    calibrationStartRef.current = Date.now();
    calibrationSamplesRef.current = [];
    adaptiveThresholdRef.current = FALLBACK_THRESHOLD;

    vadTimerRef.current = setInterval(() => {
      const vol = readVolume();
      const now = Date.now();

      // Calibration: for the first CALIBRATION_MS of listening we
      // collect samples silently — the trainee shouldn't be speaking
      // yet (the mic just opened) so this measures room noise. Once
      // the window closes we compute the threshold and stop
      // sampling. In background mode we can't calibrate reliably
      // (persona TTS is bleeding into the mic on non-headphone setups)
      // so we skip calibration and use the fallback threshold.
      if (
        modeRef.current === "active" &&
        calibrationStartRef.current != null
      ) {
        if (now - calibrationStartRef.current < CALIBRATION_MS) {
          calibrationSamplesRef.current.push(vol);
        } else {
          const samples = calibrationSamplesRef.current;
          if (samples.length > 0) {
            const mean =
              samples.reduce((a, b) => a + b, 0) / samples.length;
            adaptiveThresholdRef.current = Math.max(
              MIN_THRESHOLD,
              Math.round(mean * NOISE_MULTIPLIER),
            );
          }
          calibrationStartRef.current = null;
          calibrationSamplesRef.current = [];
        }
      }

      const threshold = adaptiveThresholdRef.current;
      const isSound = vol > threshold;

      // 1Hz VAD trace so we can see whether audio is even landing.
      if (now - lastTraceAtRef.current >= 1000) {
        lastTraceAtRef.current = now;
        console.log("[stt-vad] tick", {
          mode: modeRef.current,
          vol: Math.round(vol),
          threshold,
          isSound,
          hasSpoke: hasSpokeRef.current,
        });
      }

      if (modeRef.current === "background") {
        // Interruption detection during persona TTS: sustained sound
        // for MIN_SPEECH_MS_BACKGROUND flips us to active AND fires the
        // callback. Longer threshold here (vs active mode) filters out
        // persona-voice bleed from speakers/laptop mics that would
        // otherwise falsely trigger barge-in.
        if (isSound) {
          if (speechStartedAtRef.current == null) {
            speechStartedAtRef.current = now;
          } else if (
            now - speechStartedAtRef.current >=
            MIN_SPEECH_MS_BACKGROUND
          ) {
            console.log("[stt-vad] BARGE-IN triggered", { vol, threshold });
            modeRef.current = "active";
            onInterruptionRef.current?.();
            hasSpokeRef.current = true;
            lastSoundAtRef.current = now;
            // Do NOT recalibrate here. cancelSpeech() doesn't silence
            // audio instantly — the wind-down keeps bleeding into the
            // mic for a few hundred ms. Sampling that as "room noise"
            // computes a threshold that's way above the user's real
            // voice, and every subsequent utterance falls below it →
            // stuck mic that captures nothing.
            //
            // Instead, force the threshold back to FALLBACK so the
            // trainee's real speech is guaranteed to trigger. If the
            // environment is genuinely noisy, they can retry via the
            // idle→active recalibration on the next mic reopen.
            adaptiveThresholdRef.current = FALLBACK_THRESHOLD;
            calibrationStartRef.current = null;
            calibrationSamplesRef.current = [];
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
          console.log("[stt-vad] speech onset", { vol, threshold });
        } else if (
          !hasSpokeRef.current &&
          now - speechStartedAtRef.current >= MIN_SPEECH_MS_ACTIVE
        ) {
          hasSpokeRef.current = true;
          console.log("[stt-vad] speech confirmed (armed for commit)");
        }
        lastSoundAtRef.current = now;
      } else if (
        hasSpokeRef.current &&
        lastSoundAtRef.current != null &&
        now - lastSoundAtRef.current >= silenceThresholdRef.current
      ) {
        // Silence has run long enough after real speech — commit.
        console.log("[stt-vad] silence threshold reached, committing");
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
      // Insert a GainNode between source and analyser. This boosts
      // the VAD-visible signal WITHOUT changing the audio going to
      // MediaRecorder — the raw stream is still recorded at native
      // gain, so Scribe transcription quality is preserved. Quiet
      // built-in laptop mics (baseline vol 1-3, speech peak 8-15) get
      // lifted into the 4-12 baseline / 32-60 speech-peak range that
      // the VAD can confidently distinguish.
      const gain = ctx.createGain();
      gain.gain.value = ANALYSER_GAIN;
      source.connect(gain);
      gain.connect(analyser);
      analyserRef.current = analyser;
      // Successful open — clear any prior error so the player drops
      // the "mic not working" banner.
      setError(null);
      return true;
    } catch (err) {
      // Classify the failure so the player can render an actionable
      // message. Browsers use consistent DOMException names here.
      const name =
        err instanceof Error
          ? (err as Error & { name?: string }).name ?? ""
          : "";
      let cls: SttError;
      if (name === "NotAllowedError" || name === "SecurityError") {
        cls = "permission_denied";
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        cls = "no_device";
      } else if (name === "NotReadableError" || name === "AbortError") {
        cls = "in_use";
      } else {
        cls = "unknown";
      }
      console.warn(
        "[stt] getUserMedia failed",
        cls,
        err instanceof Error ? err.message : err,
      );
      setError(cls);
      return false;
    }
  }, []);

  const startListening = useCallback(
    async (o?: { mode?: ListeningMode }) => {
      console.log("[stt] startListening called", {
        mode: o?.mode,
        enabled,
        supported,
      });
      if (!enabled || !supported) {
        console.log("[stt] startListening early-return: not enabled/supported");
        if (!supported) setError("unsupported");
        return;
      }
      const ok = await ensureMedia();
      console.log("[stt] ensureMedia result", ok);
      if (!ok) {
        // ensureMedia already set the classified error state. Ensure
        // we don't leave a stale "listening" flag hanging around.
        setState("idle");
        return;
      }
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
        // No timeslice: MediaRecorder buffers internally and emits a
        // single well-formed blob at stop() time. Chrome's chunked
        // output (start(250)) can produce structurally partial webm/
        // opus that upstream parsers (ElevenLabs Scribe) reject as
        // "File is corrupted". The single-blob pattern is the safe
        // path for buffered STT: one ondataavailable event, one
        // complete, valid container.
        rec.start();
        console.log("[stt] MediaRecorder started", { mode: modeRef.current });
      } catch (err) {
        console.warn(
          "[stt] MediaRecorder.start failed",
          err instanceof Error ? err.message : err,
        );
        setError("unknown");
        setState("idle");
        recorderRef.current = null;
        return;
      }
      setState("listening");
      startVadLoop();
    },
    [enabled, supported, ensureMedia, stopRecorder, startVadLoop],
  );

  const setListeningMode = useCallback((mode: ListeningMode) => {
    const prev = modeRef.current;
    console.log("[stt] setListeningMode", { from: prev, to: mode });
    modeRef.current = mode;
    // Reset speech-onset tracking so the mode switch doesn't
    // false-commit against stale timers.
    speechStartedAtRef.current = null;
    lastSoundAtRef.current = null;
    hasSpokeRef.current = false;
    // On background→active (persona finished, now user's turn), do
    // TWO things:
    //   1. Force threshold back to FALLBACK. Any prior calibration
    //      may have sampled TTS wind-down and inflated the bar.
    //   2. Restart the MediaRecorder from scratch so the recording
    //      contains ONLY the user's turn — not the persona-TTS bleed
    //      that was flowing into the mic during background mode. A
    //      recording that spans a mode change can have structurally
    //      malformed webm/opus that upstream Scribe rejects; keeping
    //      each recording single-phase is the safer path.
    if (prev === "background" && mode === "active") {
      adaptiveThresholdRef.current = FALLBACK_THRESHOLD;
      calibrationStartRef.current = null;
      calibrationSamplesRef.current = [];
      // Restart the recorder in place — same stream, fresh chunks.
      const stream = streamRef.current;
      const mime = mimeRef.current;
      if (stream && mime) {
        stopRecorder(true);
        chunksRef.current = [];
        try {
          const rec = new MediaRecorder(stream, { mimeType: mime });
          rec.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
          };
          rec.start();
          recorderRef.current = rec;
          console.log("[stt] recorder restarted for active turn");
        } catch (err) {
          console.warn(
            "[stt] recorder restart on mode flip failed",
            err instanceof Error ? err.message : err,
          );
        }
      }
    }
  }, [stopRecorder]);

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

  return {
    supported,
    state,
    error,
    startListening,
    setListeningMode,
    stopListening,
  };
}
