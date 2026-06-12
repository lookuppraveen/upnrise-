// useVoiceMode — wraps the browser's WebSpeech APIs (SpeechSynthesis
// + SpeechRecognition) so the Roleplay player can do mic-in / voice-out
// without any backend cost.
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

type RecognitionResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
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
  onTranscript: (text: string) => void;
}): {
  state: VoiceState;
  ttsSupported: boolean;
  sttSupported: boolean;
  speak: (text: string, opts?: { voiceUri?: string | null }) => Promise<void>;
  startListening: () => void;
  stopListening: () => void;
  cancelSpeech: () => void;
  /** The voice URI the hook is currently using, or null if default. */
  selectedVoiceUri: string | null;
  /** Voices the browser exposes for the current lang family, ranked
   *  by quality. UI can render a dropdown directly from this list. */
  availableVoices: VoiceOption[];
} {
  const {
    enabled,
    lang = "en-US",
    voiceGender = null,
    voiceUri = null,
    onTranscript,
  } = opts;
  const [state, setState] = useState<VoiceState>("idle");
  const recognitionRef = useRef<RecognitionInstance | null>(null);
  // Stash the latest onTranscript so we don't have to recreate the
  // recognition instance every time the parent re-renders.
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

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

  // Build the SpeechRecognition instance once. Restart it from event
  // handlers below — `recognition.start()` after a previous run throws
  // if the instance is busy, hence the state machine.
  useEffect(() => {
    if (!sttSupported || typeof window === "undefined") return;
    const w = window as WindowWithRecognition;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? "";
      if (transcript.trim().length > 0) {
        onTranscriptRef.current(transcript.trim());
      }
      setState("idle");
    };
    rec.onerror = (e) => {
      // `no-speech` and `aborted` are normal — user paused or cancelled.
      // Network / not-allowed are the ones worth surfacing.
      if (e.error !== "no-speech" && e.error !== "aborted") {
        console.warn("[voice] recognition error:", e.error);
      }
      setState("idle");
    };
    rec.onend = () => {
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
  }, [sttSupported, lang]);

  // Stop any pending speech / mic when the feature flips off so the
  // browser doesn't keep mic-recording in a disabled tab.
  useEffect(() => {
    if (enabled) return;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    recognitionRef.current?.abort();
    setState("idle");
  }, [enabled]);

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

  const speak = useCallback(
    (text: string, opts?: { voiceUri?: string | null }) =>
      new Promise<void>((resolve) => {
        if (!enabled || !ttsSupported || !text.trim()) {
          resolve();
          return;
        }
        const synth = window.speechSynthesis;
        // Cancel any in-flight utterance so we don't queue up backlogs
        // if the AI streams two chunks back-to-back.
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        u.rate = 1.0;
        u.pitch = 1.0;
        // Per-call override (auto-flow uses this for the learner voice).
        // Falls through to the hook-level selection when not provided.
        const override = opts?.voiceUri
          ? allVoicesRef.current.find((v) => v.voiceURI === opts.voiceUri) ??
            null
          : null;
        const chosen = override ?? selectedVoiceRef.current;
        if (chosen) {
          u.voice = chosen;
          // Some browsers ignore u.lang when a voice is set; align it
          // with the picked voice's lang so the right engine fires.
          u.lang = chosen.lang || lang;
        }
        u.onstart = () => setState("speaking");
        u.onend = () => {
          setState("idle");
          resolve();
        };
        u.onerror = () => {
          setState("idle");
          resolve();
        };
        synth.speak(u);
      }),
    [enabled, ttsSupported, lang],
  );

  const startListening = useCallback(() => {
    if (!enabled || !sttSupported) return;
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      // If TTS is still mid-sentence, cancel it before opening the mic
      // so the avatar doesn't hear itself.
      window.speechSynthesis?.cancel();
      rec.start();
      setState("listening");
    } catch (e) {
      // Calling start() while already started throws. Treat as no-op.
      console.warn("[voice] start() failed:", e);
    }
  }, [enabled, sttSupported]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setState((s) => (s === "listening" ? "idle" : s));
  }, []);

  const cancelSpeech = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setState((s) => (s === "speaking" ? "idle" : s));
  }, []);

  return {
    state,
    ttsSupported,
    sttSupported,
    speak,
    startListening,
    stopListening,
    cancelSpeech,
    selectedVoiceUri,
    availableVoices,
  };
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
