// useVoiceMode — wraps the browser's WebSpeech APIs (SpeechSynthesis
// + SpeechRecognition) so the Roleplay player can do mic-in / voice-out
// without any backend cost.
//
// Conversational behavior (Phase J update):
//   • SpeechRecognition runs in continuous + interimResults mode so
//     short thinking pauses don't cut the user off.
//   • Two listening modes:
//       - "active"     → silence-timer commit. If the user goes quiet
//                         for `silenceThresholdMs`, we hand the
//                         accumulated transcript to onTranscript.
//       - "background" → mic stays open during persona TTS for
//                         interruption detection. The moment we see
//                         interim text, we fire `onInterruption`
//                         (player cancels TTS) and flip to "active"
//                         so the silence timer takes over.
//   • The browser's own no-speech end is auto-restarted while the
//     player wants the mic open, so the listening session feels
//     continuous even when SpeechRecognition's session timer expires.
//
// Browser support snapshot (Apr 2026):
//   * SpeechSynthesis (TTS) — Chrome, Edge, Safari, Firefox ✅
//   * SpeechRecognition (STT) — Chrome, Edge, Safari ✅
//     Firefox does NOT implement it. The hook's `sttSupported` flag
//     surfaces that so the UI can fall back to text input.
//
// Why not Whisper / Deepgram? Adds API-key + cost surface. WebSpeech
// works offline-ish (Chrome streams to Google's STT under the hood,
// but no user-visible API key + no per-minute billing).

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useElevenLabsTTS, type PreparedSpeech } from "./useElevenLabsTTS";
import { useElevenLabsSTT, type SttError } from "./useElevenLabsSTT";

export type { SttError };

// Threshold of silence after the user has spoken before we commit
// the transcript. Long enough to survive a "uhh… let me think" pause,
// short enough that the AI doesn't sit idle after a clean stop.
const DEFAULT_SILENCE_MS = 1800;

// Min interim length before we count it as a real interruption. Filters
// out one-syllable noise / breath that browser STT sometimes emits.
const INTERRUPTION_MIN_CHARS = 3;

type RecognitionResultEntry = {
  isFinal: boolean;
  0: { transcript: string };
};

type RecognitionResultEvent = {
  results: ArrayLike<RecognitionResultEntry>;
  resultIndex: number;
};

type RecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => RecognitionInstance;

type WindowWithRecognition = Window & {
  SpeechRecognition?: RecognitionCtor;
  webkitSpeechRecognition?: RecognitionCtor;
};

export type VoiceState = "idle" | "listening" | "speaking";
export type ListeningMode = "active" | "background";
export type VoiceGender = "female" | "male" | null;

export type VoiceOption = {
  uri: string;
  name: string;
  lang: string;
  gender: "female" | "male" | "unknown";
  localService: boolean;
};

export function useVoiceMode(opts: {
  enabled: boolean;
  lang?: string;
  /** Pick a TTS voice matching this gender when the browser exposes one.
   *  null = use whatever the browser defaults to. */
  voiceGender?: VoiceGender;
  /** When set, takes precedence over voiceGender. The trainee picked
   *  this voice manually via the dropdown — honour their choice. */
  voiceUri?: string | null;
  /** ElevenLabs voice id for the persona. When set, `speak()` fetches
   *  from `/api/roleplay/tts` and plays the returned audio; failures
   *  fall back to window.speechSynthesis for the current utterance
   *  AND flip a session-scoped kill switch so we don't hammer the
   *  provider for the rest of the session. */
  elevenLabsVoiceId?: string | null;
  /** RoleplaySession id — forwarded on every TTS call so voice usage
   *  is attributed to the session and enforces the per-session cap. */
  sessionId?: string | null;
  /** Prefer ElevenLabs Scribe for speech-to-text. On Firefox this is
   *  the ONLY way to get mic input (browser SpeechRecognition doesn't
   *  exist). Defaults to true — the hook internally falls back to
   *  browser SR when MediaRecorder/getUserMedia aren't available.
   *  Pass `false` to force browser SR (e.g. for local debugging). */
  elevenLabsSttEnabled?: boolean;
  onTranscript: (text: string) => void;
  /** Fired when interim speech is detected while listening in
   *  "background" mode (mic-open-during-TTS). The player typically
   *  cancels persona TTS here; the hook auto-flips to "active" so the
   *  silence-timer commit takes over from this point. */
  onInterruption?: () => void;
  /** ms of consecutive silence before pending transcript is committed
   *  in active mode. Default 1800. */
  silenceThresholdMs?: number;
  /** Enable per-user adaptive silence tuning inside the STT hook.
   *  Defaults to true; pass `false` for deterministic tests. */
  adaptive?: boolean;
  /** localStorage key the adaptive delta is persisted under. When
   *  omitted the delta is memory-only and resets on reload. Include
   *  the trainee's userId so different users on the same device don't
   *  overwrite each other. */
  adaptiveStorageKey?: string;
}): {
  state: VoiceState;
  ttsSupported: boolean;
  sttSupported: boolean;
  speak: (text: string, opts?: { voiceUri?: string | null }) => Promise<void>;
  /**
   * Pipelined variant of speak: fires the TTS fetch NOW and returns a
   * handle whose play() consumes the response later. Callers chaining
   * multiple sentences should prepare(N+1) while N is still playing so
   * the network round-trips parallelize and there's no audible gap
   * between chunks. On the browser-TTS fallback path prepare defers
   * everything to play() since browser SpeechSynthesis can't pre-fetch.
   */
  prepare: (
    text: string,
    opts?: { voiceUri?: string | null },
  ) => Promise<{ play: () => Promise<void>; cancel: () => void }>;
  /** Open the mic. `mode: "background"` listens for interruption only
   *  (no silence commit); `mode: "active"` (default) commits on silence. */
  startListening: (opts?: { mode?: ListeningMode }) => void;
  /** Switch an already-open mic from background → active (or vice
   *  versa) without restarting the recognition session. */
  setListeningMode: (mode: ListeningMode) => void;
  stopListening: () => void;
  /** Force-commit the current voice utterance immediately (skip the
   *  silence-based auto-commit). Used by the "Send now" button so the
   *  trainee can override the timer when they know they're done. No-op
   *  on the browser SpeechRecognition path (it commits on final result
   *  events, not a silence timer). */
  commitNow: () => void;
  cancelSpeech: () => void;
  /** The voice URI the hook is currently using, or null if default. */
  selectedVoiceUri: string | null;
  /** Voices the browser exposes for the current lang family, ranked
   *  by quality. UI can render a dropdown directly from this list. */
  availableVoices: VoiceOption[];
  /** Last mic-open failure. `null` when the mic is healthy or hasn't
   *  been tried. Consumers render this to explain why speech isn't
   *  being captured (denied permission, no device, etc.). */
  sttError: SttError | null;
} {
  const {
    enabled,
    lang = "en-US",
    voiceGender = null,
    voiceUri = null,
    elevenLabsVoiceId = null,
    elevenLabsSttEnabled = true,
    sessionId = null,
    onTranscript,
    onInterruption,
    silenceThresholdMs = DEFAULT_SILENCE_MS,
    adaptive = true,
    adaptiveStorageKey,
  } = opts;
  const [state, setState] = useState<VoiceState>("idle");

  // ElevenLabs STT — server-proxied Scribe. Preferred over browser
  // SpeechRecognition because it (a) works on Firefox, (b) handles more
  // languages, (c) has higher accuracy on noisy audio. Falls through to
  // browser SR when the browser doesn't support MediaRecorder /
  // getUserMedia, or when the caller opts out.
  const elevenLabsStt = useElevenLabsSTT({
    enabled: enabled && elevenLabsSttEnabled,
    languageCode: normalizeLangForScribe(lang),
    silenceThresholdMs,
    sessionId,
    adaptive,
    adaptiveStorageKey,
    onTranscript,
    onInterruption,
  });
  const useElevenLabsSttPath = elevenLabsSttEnabled && elevenLabsStt.supported;

  // ElevenLabs TTS driver — always instantiated so the hook shape
  // stays stable. `speak()` below decides whether to call it based on
  // elevenLabsVoiceId + the session kill switch.
  const elevenLabs = useElevenLabsTTS();
  // Session-scoped kill switch: once ElevenLabs fails once, we skip
  // it for the rest of this player instance. Avoids retry-storming a
  // dead provider and keeps the trainee's session usable on browser TTS.
  const elevenLabsFailedRef = useRef(false);
  const recognitionRef = useRef<RecognitionInstance | null>(null);
  // Stash the latest callbacks so we don't have to recreate the
  // recognition instance every time the parent re-renders.
  const onTranscriptRef = useRef(onTranscript);
  const onInterruptionRef = useRef(onInterruption);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);
  useEffect(() => {
    onInterruptionRef.current = onInterruption;
  }, [onInterruption]);

  // Live values the recognition handlers read without needing to be
  // recreated on every parent render.
  const listeningModeRef = useRef<ListeningMode>("active");
  // The player's intent — true means "keep restarting recognition
  // if the browser auto-ends it; we still want the mic open."
  const wantsListeningRef = useRef(false);
  const accumulatedFinalRef = useRef("");
  const interimRef = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceThresholdRef = useRef(silenceThresholdMs);
  useEffect(() => {
    silenceThresholdRef.current = silenceThresholdMs;
  }, [silenceThresholdMs]);

  // Browser-API detection has to happen *after* hydration — checking
  // `typeof window` inside render lies during SSR (returns false) but
  // tells the truth on the client's first render (returns true). That
  // makes the conditional voice-strip render server-vs-client mismatch
  // and React throws a hydration error. Detect once in an effect so
  // SSR and first client render agree (both false), then flip on mount.
  const [ttsSupported, setTtsSupported] = useState(false);
  const [sttSupported, setSttSupported] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as WindowWithRecognition;
    setTtsSupported("speechSynthesis" in window);
    setSttSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // Commit accumulated transcript and stop the recognition session.
  // The player decides whether to re-open the mic after AI replies.
  const commitPending = useCallback(() => {
    clearSilenceTimer();
    const text = (accumulatedFinalRef.current + " " + interimRef.current)
      .replace(/\s+/g, " ")
      .trim();
    accumulatedFinalRef.current = "";
    interimRef.current = "";
    wantsListeningRef.current = false;
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        /* ignore — already stopped */
      }
    }
    if (text) {
      onTranscriptRef.current(text);
    }
  }, [clearSilenceTimer]);

  // Build the SpeechRecognition instance once per (sttSupported, lang)
  // pair. continuous: true keeps it alive through pauses; interimResults
  // lets us light up the silence timer mid-utterance.
  useEffect(() => {
    if (!sttSupported || typeof window === "undefined") return;
    const w = window as WindowWithRecognition;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      // Rebuild the full transcript state from event.results — interim
      // results grow incrementally so a stateful index is brittle.
      let allFinal = "";
      let interim = "";
      const results = e.results;
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const t = r[0]?.transcript ?? "";
        if (r.isFinal) allFinal += t;
        else interim += t;
      }
      accumulatedFinalRef.current = allFinal;
      interimRef.current = interim;

      const combined = (allFinal + " " + interim).trim();
      const hasContent = combined.length >= INTERRUPTION_MIN_CHARS;

      if (listeningModeRef.current === "background") {
        // Interruption: a real chunk of speech arrived while persona
        // TTS was playing. Fire the callback (player cancels TTS) and
        // flip into active mode so the silence timer takes over from
        // here.
        if (hasContent) {
          listeningModeRef.current = "active";
          onInterruptionRef.current?.();
          // Start the silence countdown immediately — the user has
          // started speaking; we now wait for them to finish.
          clearSilenceTimer();
          silenceTimerRef.current = setTimeout(() => {
            commitPending();
          }, silenceThresholdRef.current);
        }
        return;
      }

      // Active mode: any new speech postpones the commit.
      if (combined.length > 0) {
        clearSilenceTimer();
        silenceTimerRef.current = setTimeout(() => {
          commitPending();
        }, silenceThresholdRef.current);
      }
    };

    rec.onerror = (e) => {
      // `no-speech` and `aborted` are normal — user paused or cancelled.
      // Network / not-allowed are the ones worth surfacing.
      if (e.error !== "no-speech" && e.error !== "aborted") {
        console.warn("[voice] recognition error:", e.error);
      }
    };

    rec.onend = () => {
      // Browsers will auto-end continuous sessions after ~10-60s of
      // silence. If the player still wants the mic open, restart so
      // listening feels uninterrupted to the user.
      if (wantsListeningRef.current && enabled) {
        try {
          rec.start();
          return;
        } catch {
          // already starting or transient error — fall through to idle
        }
      }
      setState((s) => (s === "listening" ? "idle" : s));
    };
    recognitionRef.current = rec;
    return () => {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    };
    // commitPending + clearSilenceTimer are stable (useCallback). enabled
    // is read off the live closure inside onend so a toggle doesn't
    // recreate the recognizer mid-conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sttSupported, lang]);

  // Stop any pending speech / mic when the feature flips off so the
  // browser doesn't keep mic-recording in a disabled tab.
  useEffect(() => {
    if (enabled) return;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    elevenLabs.cancel();
    wantsListeningRef.current = false;
    clearSilenceTimer();
    recognitionRef.current?.abort();
    setState("idle");
  }, [enabled, clearSilenceTimer, elevenLabs]);

  // Pick a TTS voice. Manual override (`voiceUri`) wins; otherwise we
  // auto-pick by lang + persona gender. Browsers expose voices
  // asynchronously (Chrome fires `voiceschanged` once they're loaded)
  // so we resolve on mount + on every voiceschanged event. The
  // selection is held in a ref so `speak` always reads the freshest
  // match without recreating the callback.
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  // Raw browser voice list — `speak({ voiceUri })` resolves per-call
  // voice overrides against this so a single utterance can use a
  // different voice (e.g. the "learner" voice in auto-flow mode)
  // without disturbing the persona's default selection.
  const allVoicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;

    const resolve = () => {
      const all = synth.getVoices();
      if (all.length === 0) return;
      allVoicesRef.current = all;
      const filtered = filterAndRank(all, lang);
      setAvailableVoices(
        filtered.map((v) => ({
          uri: v.voiceURI,
          name: v.name,
          lang: v.lang,
          gender: classifyVoiceGender(v.name),
          localService: v.localService,
        })),
      );
      const manual = voiceUri
        ? all.find((v) => v.voiceURI === voiceUri) ?? null
        : null;
      const chosen = manual ?? pickVoice(all, lang, voiceGender);
      selectedVoiceRef.current = chosen;
      setSelectedVoiceUri(chosen?.voiceURI ?? null);
    };
    resolve();
    synth.addEventListener?.("voiceschanged", resolve);
    return () => {
      synth.removeEventListener?.("voiceschanged", resolve);
    };
  }, [lang, voiceGender, voiceUri]);

  // Browser TTS (SpeechSynthesis) — the always-available fallback.
  // Extracted so the ElevenLabs path can call into it on error without
  // duplicating the utterance-lifecycle wiring.
  const speakWithBrowser = useCallback(
    (text: string, opts?: { voiceUri?: string | null }) =>
      new Promise<void>((resolve) => {
        if (!enabled || !ttsSupported || !text.trim()) {
          resolve();
          return;
        }
        const synth = window.speechSynthesis;
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        u.rate = 1.0;
        u.pitch = 1.0;
        const override = opts?.voiceUri
          ? allVoicesRef.current.find((v) => v.voiceURI === opts.voiceUri) ??
            null
          : null;
        const chosen = override ?? selectedVoiceRef.current;
        if (chosen) {
          u.voice = chosen;
          u.lang = chosen.lang || lang;
        }
        u.onstart = () => setState("speaking");
        u.onend = () => {
          setState((s) => {
            if (s !== "speaking") return s;
            return wantsListeningRef.current ? "listening" : "idle";
          });
          resolve();
        };
        u.onerror = () => {
          setState((s) => {
            if (s !== "speaking") return s;
            return wantsListeningRef.current ? "listening" : "idle";
          });
          resolve();
        };
        synth.speak(u);
      }),
    [enabled, ttsSupported, lang],
  );

  const speak = useCallback(
    async (text: string, opts?: { voiceUri?: string | null }): Promise<void> => {
      if (!enabled || !text.trim()) return;

      // Route to browser TTS when:
      //   • ElevenLabs isn't configured for this session
      //   • The auto-flow "learner" voice is speaking (opts.voiceUri set)
      //     — that path needs the browser's voice roster to pick a
      //     distinct-sounding voice, not the persona's ElevenLabs voice
      //   • ElevenLabs already failed this session (kill switch)
      const useEleven =
        !!elevenLabsVoiceId && !opts?.voiceUri && !elevenLabsFailedRef.current;

      if (!useEleven) {
        return speakWithBrowser(text, opts);
      }

      // Cancel any browser TTS from a prior turn so we don't overlap.
      if (ttsSupported) window.speechSynthesis?.cancel();
      setState("speaking");
      try {
        await elevenLabs.speak(text, {
          voiceId: elevenLabsVoiceId!,
          sessionId,
        });
        setState((s) => {
          if (s !== "speaking") return s;
          return wantsListeningRef.current ? "listening" : "idle";
        });
      } catch (err) {
        // Log once and fall back to browser TTS for the current utterance
        // AND every subsequent one this session. Trainees never see a
        // silent persona because of a provider outage.
        console.warn(
          "[voice] ElevenLabs speak failed, falling back to browser TTS:",
          err instanceof Error ? err.message : err,
        );
        elevenLabsFailedRef.current = true;
        await speakWithBrowser(text, opts);
      }
    },
    [
      enabled,
      ttsSupported,
      elevenLabsVoiceId,
      elevenLabs,
      speakWithBrowser,
      sessionId,
    ],
  );

  const prepare = useCallback(
    async (
      text: string,
      opts?: { voiceUri?: string | null },
    ): Promise<{ play: () => Promise<void>; cancel: () => void }> => {
      const trimmed = text.trim();
      if (!enabled || !trimmed) {
        return { play: async () => {}, cancel: () => {} };
      }
      const useEleven =
        !!elevenLabsVoiceId && !opts?.voiceUri && !elevenLabsFailedRef.current;
      if (!useEleven) {
        // Browser SpeechSynthesis can't pre-fetch — everything happens
        // inside play(). Hand back a lazy handle so callers can chain
        // both paths uniformly.
        return {
          play: () => speakWithBrowser(text, opts),
          cancel: () => {
            if (ttsSupported) window.speechSynthesis?.cancel();
          },
        };
      }
      // Kick the EL fetch NOW so it races the previous chunk's audio.
      let elHandle: PreparedSpeech | null = null;
      try {
        elHandle = await elevenLabs.prepare(text, {
          voiceId: elevenLabsVoiceId!,
          sessionId,
        });
      } catch (err) {
        console.warn(
          "[voice] ElevenLabs prepare failed, falling back to browser TTS:",
          err instanceof Error ? err.message : err,
        );
        elevenLabsFailedRef.current = true;
        return {
          play: () => speakWithBrowser(text, opts),
          cancel: () => {
            if (ttsSupported) window.speechSynthesis?.cancel();
          },
        };
      }
      return {
        play: async () => {
          if (ttsSupported) window.speechSynthesis?.cancel();
          setState("speaking");
          try {
            await elHandle!.play();
            setState((s) => {
              if (s !== "speaking") return s;
              return wantsListeningRef.current ? "listening" : "idle";
            });
          } catch (err) {
            console.warn(
              "[voice] ElevenLabs play failed, falling back to browser TTS:",
              err instanceof Error ? err.message : err,
            );
            elevenLabsFailedRef.current = true;
            await speakWithBrowser(text, opts);
          }
        },
        cancel: () => elHandle!.cancel(),
      };
    },
    [
      enabled,
      ttsSupported,
      elevenLabsVoiceId,
      elevenLabs,
      speakWithBrowser,
      sessionId,
    ],
  );

  const startListening = useCallback(
    (opts?: { mode?: ListeningMode }) => {
      if (!enabled) return;

      // ElevenLabs STT path — MediaRecorder + Scribe. Preferred because
      // it's the only mic path that works on Firefox and gives us
      // multilingual transcripts everywhere else.
      if (useElevenLabsSttPath) {
        // In active mode, cancel any dangling browser TTS so the mic
        // doesn't record the persona's own voice. Background mode
        // keeps TTS running for interruption detection.
        if ((opts?.mode ?? "active") === "active") {
          window.speechSynthesis?.cancel();
        }
        // Optimistically flip to "listening" so the UI doesn't lag by
        // a frame. If the mic fails to open (denied / no device / in
        // use), the effect below that mirrors elevenLabsStt.state
        // pulls us back to "idle" and the hook exposes `sttError` so
        // the player can render a real message. Prior behavior was
        // fire-and-forget with no recovery — the UI stayed "listening"
        // forever while nothing was captured.
        void elevenLabsStt.startListening({ mode: opts?.mode });
        setState((s) => (s === "speaking" ? s : "listening"));
        return;
      }

      // Fallback: browser SpeechRecognition (Chrome/Edge/Safari).
      if (!sttSupported) return;
      const rec = recognitionRef.current;
      if (!rec) return;
      listeningModeRef.current = opts?.mode ?? "active";
      accumulatedFinalRef.current = "";
      interimRef.current = "";
      clearSilenceTimer();
      wantsListeningRef.current = true;
      try {
        if (listeningModeRef.current === "active") {
          window.speechSynthesis?.cancel();
        }
        rec.start();
        setState((s) => (s === "speaking" ? s : "listening"));
      } catch (e) {
        console.warn("[voice] start() failed:", e);
      }
    },
    [enabled, useElevenLabsSttPath, elevenLabsStt, sttSupported, clearSilenceTimer],
  );

  const setListeningMode = useCallback(
    (mode: ListeningMode) => {
      if (useElevenLabsSttPath) {
        elevenLabsStt.setListeningMode(mode);
        return;
      }
      listeningModeRef.current = mode;
      if (mode === "active") {
        const combined = (
          accumulatedFinalRef.current +
          " " +
          interimRef.current
        ).trim();
        if (combined.length > 0) {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            commitPending();
          }, silenceThresholdRef.current);
        }
      } else if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    },
    [useElevenLabsSttPath, elevenLabsStt, commitPending],
  );

  const stopListening = useCallback(() => {
    if (useElevenLabsSttPath) {
      elevenLabsStt.stopListening();
      setState((s) => (s === "listening" ? "idle" : s));
      return;
    }
    wantsListeningRef.current = false;
    clearSilenceTimer();
    accumulatedFinalRef.current = "";
    interimRef.current = "";
    recognitionRef.current?.abort();
    setState((s) => (s === "listening" ? "idle" : s));
  }, [useElevenLabsSttPath, elevenLabsStt, clearSilenceTimer]);

  const commitNow = useCallback(() => {
    // Only the ElevenLabs Scribe path has an explicit force-commit.
    // The browser SpeechRecognition backend commits on its own final
    // result events, so there's nothing meaningful to override there
    // — no-op keeps the caller code branch-free.
    if (useElevenLabsSttPath) {
      elevenLabsStt.commitNow();
    }
  }, [useElevenLabsSttPath, elevenLabsStt]);

  const cancelSpeech = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    // ElevenLabs audio needs an explicit pause + fetch abort — the
    // browser synth cancel above doesn't touch <audio> elements.
    elevenLabs.cancel();
    setState((s) => (s === "speaking" ? "idle" : s));
  }, [elevenLabs]);

  // sttSupported to the outside world means "the mic can accept input
  // via *some* backend". ElevenLabs STT satisfies that on every
  // browser with MediaRecorder + getUserMedia (Firefox included);
  // browser SpeechRecognition satisfies it on Chrome/Edge/Safari.
  const combinedSttSupported =
    (useElevenLabsSttPath && elevenLabsStt.supported) || sttSupported;

  // If the STT hook reports a real mic-open error (getUserMedia denied,
  // no device, in use), reconcile our own state so the UI mic indicator
  // doesn't lie about being "listening". Only fires on an actual error —
  // NOT on a plain idle state, because idle is also the STT hook's
  // steady state before startListening resolves. Watching state=idle
  // here caused a race that dragged us back to idle before the async
  // MediaRecorder startup finished.
  useEffect(() => {
    if (!useElevenLabsSttPath) return;
    if (elevenLabsStt.error === null) return;
    setState((s) => (s === "listening" ? "idle" : s));
  }, [useElevenLabsSttPath, elevenLabsStt.error]);

  return {
    state,
    ttsSupported,
    sttSupported: combinedSttSupported,
    speak,
    prepare,
    startListening,
    setListeningMode,
    stopListening,
    commitNow,
    cancelSpeech,
    selectedVoiceUri,
    availableVoices,
    sttError: useElevenLabsSttPath ? elevenLabsStt.error : null,
  };
}

// Scribe wants ISO 639-1 (like "en", "hi"). BCP-47 tags (like "en-US",
// "hi-IN") work if we trim to the primary subtag.
function normalizeLangForScribe(lang: string): string | undefined {
  const trimmed = lang.trim();
  if (!trimmed) return undefined;
  return trimmed.split(/[-_]/)[0].toLowerCase();
}

// Trim the full voice list down to the requested lang family and
// rank by quality so the dropdown shows reasonable choices first.
function filterAndRank(
  voices: SpeechSynthesisVoice[],
  lang: string,
): SpeechSynthesisVoice[] {
  const langPrefix = lang.split(/[-_]/)[0]?.toLowerCase() ?? "en";
  const matched = voices.filter((v) =>
    (v.lang ?? "").toLowerCase().startsWith(langPrefix),
  );
  // Fall back to the full list if nothing matches the lang family so
  // the user still gets a picker (better than an empty dropdown).
  const pool = matched.length > 0 ? matched : voices;
  return [...pool].sort((a, b) => {
    const score = (v: SpeechSynthesisVoice) => {
      let s = 0;
      const n = v.name.toLowerCase();
      if (n.includes("natural") || n.includes("neural")) s += 20;
      if (n.includes("online")) s += 10;
      if (v.localService) s += 5;
      return s;
    };
    return score(b) - score(a);
  });
}

// ─────────────── Voice picker ───────────────
// Browsers expose a mixed bag of voices — OS-installed (Microsoft David,
// Zira), bundled (Google US English), and remote (Microsoft Online).
// We score each candidate so the persona's apparent gender wins, then
// the requested language family, then bias toward "natural"-tagged
// voices when available.

const FEMALE_VOICE_KEYWORDS = [
  "female",
  "zira", // MS Windows en-US
  "hazel", // MS Windows en-GB
  "susan",
  "samantha", // macOS
  "karen",
  "moira",
  "tessa",
  "veena", // en-IN
  "heera", // en-IN
  "priya",
  "neerja",
  "salli", // AWS Polly
  "joanna",
  "kendra",
  "ivy",
  "amy",
  "emma",
  "aditi",
  "raveena",
];

const MALE_VOICE_KEYWORDS = [
  "male",
  "david", // MS Windows en-US
  "mark",
  "george",
  "daniel",
  "alex", // macOS
  "tom",
  "brian",
  "hari",
  "ravi",
  "matthew",
  "justin",
  "joey",
];

function classifyVoiceGender(name: string): "female" | "male" | "unknown" {
  const lower = name.toLowerCase();
  for (const kw of FEMALE_VOICE_KEYWORDS) {
    if (lower.includes(kw)) return "female";
  }
  for (const kw of MALE_VOICE_KEYWORDS) {
    if (lower.includes(kw)) return "male";
  }
  return "unknown";
}

function pickVoice(
  voices: SpeechSynthesisVoice[],
  lang: string,
  gender: VoiceGender,
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const langPrefix = lang.split(/[-_]/)[0]?.toLowerCase() ?? "en";

  const scored = voices.map((v) => {
    let score = 0;
    const vLang = (v.lang ?? "").toLowerCase();
    if (vLang === lang.toLowerCase()) score += 50;
    else if (vLang.startsWith(langPrefix)) score += 30;
    const vGender = classifyVoiceGender(v.name);
    if (gender && vGender === gender) score += 100;
    else if (gender && vGender !== "unknown" && vGender !== gender) score -= 60;
    // Slight preference for local voices — they're lower-latency and
    // don't depend on the OS being online.
    if (v.localService) score += 5;
    // Natural / neural voices generally sound much better than legacy
    // SAPI ones. The marker varies by vendor.
    const lowerName = v.name.toLowerCase();
    if (
      lowerName.includes("natural") ||
      lowerName.includes("neural") ||
      lowerName.includes("online")
    ) {
      score += 10;
    }
    return { v, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.v ?? null;
}
