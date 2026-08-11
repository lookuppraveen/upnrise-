// RoleplayPlayer — three-panel client player matching prototype.css `.rp-shell`.
//
//   • Left pane: scenario context (persona + scenario + mode)
//   • Center pane: chat transcript + composer
//   • Right pane: rubric criteria as "what we're scoring" coach cards
//
// Behavior unchanged from the Phase 2.3 spike:
//   • Calls POST /api/roleplay/start on mount → renders opening turn
//   • POST /api/roleplay/turn (streamed) on submit, appends chunks
//   • POST /api/roleplay/end → redirects to results
//
// Bubble styling follows prototype.css `.bubble.bot` / `.bubble.me` —
// surface-2 fill for persona, ink fill for learner, with one corner
// squared off (4px) so the bubbles "point" toward the speaker.

"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { useVoiceMode, type SttError } from "@/hooks/useVoiceMode";
import { useStreamingAvatar } from "@/hooks/useStreamingAvatar";
import {
  MODE_DESCRIPTIONS,
  MODE_LABELS,
  type PlayerMode,
} from "@/lib/roleplay/additional-settings";
import { pickDefaultVoice } from "@/lib/voice/voice-catalog";

type Bubble = { role: "persona" | "learner"; content: string };

type CoachHint = { hint: string; tone: "tip" | "warn"; turn: number };

type RubricCriterion = {
  id: string;
  label: string;
  weight: number;
  description: string;
};

type Rubric = {
  pass_score?: number;
  criteria: RubricCriterion[];
};

export function RoleplayPlayer({
  moduleId,
  moduleName,
  trainingTitle = "",
  personaName,
  personaBlurb,
  scenario,
  mode,
  rubric,
  availableModes = [],
  userChoiceMode = false,
  scenarioIntroGif = null,
  attemptInfo = null,
  duration,
  flow,
  hints,
  recordAv = false,
  availableLanguages = [],
  personaPortraitUrl = null,
  personaElevenLabsVoiceId = null,
}: {
  moduleId: string;
  moduleName: string;
  trainingTitle?: string;
  personaName: string;
  personaBlurb: string;
  scenario: string;
  mode: "text" | "voice" | "video";
  rubric: Rubric;
  availableModes?: PlayerMode[];
  userChoiceMode?: boolean;
  scenarioIntroGif?: { name: string; dataUrl: string } | null;
  attemptInfo?: { used: number; limit: number } | null;
  duration?: {
    minMin: number;
    maxMin: number;
    autoDisconnect: boolean;
    disconnectOnInactivity: boolean;
    failBelowMin: boolean;
  };
  flow?: {
    startBy: "ai" | "user" | "either";
    endBy: "ai" | "user" | "either";
  };
  hints?: {
    kind: "yes" | "no" | "limited";
    limit: number;
    type: "complete" | "bullet";
  };
  recordAv?: boolean;
  /** Public https URL of the persona portrait. Resolved by the play
   *  page (persona override > tenant default). When provided, the
   *  audio-only roleplay surface renders it instead of initials. */
  personaPortraitUrl?: string | null;
  /** Languages the admin enabled on this persona. The trainee picks
   *  one at the pre-session gate (only shown when 2+). Stored on the
   *  RoleplaySession so the results page reads the actual choice. */
  availableLanguages?: string[];
  /** Admin-picked ElevenLabs voice id for the persona (Phase 3).
   *  When null, the player falls back to the gender-based default
   *  from `voice-catalog.ts`. */
  personaElevenLabsVoiceId?: string | null;
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [ending, startEnd] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [coachHint, setCoachHint] = useState<CoachHint | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  // Pre-session gating: when the admin attached a Scenario Intro GIF
  // or asked the trainee to pick a mode, we render an overlay first
  // and only fire /api/roleplay/start after the trainee proceeds.
  const initialMode: PlayerMode | null = useMemo(() => {
    if (userChoiceMode) return null;
    if (availableModes.length > 0) return availableModes[0];
    return null;
  }, [availableModes, userChoiceMode]);
  const [chosenMode, setChosenMode] = useState<PlayerMode | null>(initialMode);
  const needsModePick = userChoiceMode && chosenMode === null;
  // Language: when the persona only allows one language, auto-pick it
  // silently. When multiple are configured, prompt at the gate.
  const initialLanguage: string | null = useMemo(() => {
    if (availableLanguages.length === 1) return availableLanguages[0];
    return null;
  }, [availableLanguages]);
  const [chosenLanguage, setChosenLanguage] = useState<string | null>(
    initialLanguage,
  );
  const needsLanguagePick =
    availableLanguages.length > 1 && chosenLanguage === null;
  const [introDismissed, setIntroDismissed] = useState(!scenarioIntroGif);
  const sessionGated = needsModePick || needsLanguagePick || !introDismissed;

  // "3 · 2 · 1 · Go" countdown overlay after the pre-session gate
  // clears. Runs in parallel with the /api/roleplay/start fetch (which
  // takes 2-4s to generate the persona's opening greeting), so it
  // doubles as latency-hiding — by the time the countdown hits Go,
  // the greeting is usually already back and can play instantly.
  // Anything the /start response would have set (sessionId, opening
  // bubble) is buffered in refs until the countdown ends so the
  // trainee doesn't hear audio playing behind the overlay.
  const COUNTDOWN_SECONDS = 3;
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownValue, setCountdownValue] = useState(COUNTDOWN_SECONDS);
  const countdownDoneRef = useRef(false);
  const pendingStartRef = useRef<{
    sessionId: string;
    opening: string | null;
  } | null>(null);

  // Resolve the chosen player mode (or admin fallback) into the
  // voice / avatar / webcam flags the existing player flow consumes.
  const resolved = resolvePlayerFlags(chosenMode, mode);

  // Voice mode is opt-in via the mic button. We default it on when the
  // module was configured as voice/video so the admin's intent is
  // honoured, but the trainee can always flip it.
  const [voiceMode, setVoiceMode] = useState(resolved.voiceMode);
  // Streaming avatar is opt-in via "Avatar" toggle; only meaningful
  // when voice mode is on (the avatar IS the audio output). Default
  // on for video mode, off for voice/text — the trainee can flip it.
  const [avatarMode, setAvatarMode] = useState(resolved.avatarMode);
  // Webcam preview tile — shown when the admin picked a mode that
  // includes the user's video. Off for AI-only / audio.
  const [userVideoOn, setUserVideoOn] = useState(resolved.userVideo);

  // When the trainee picks a mode in the pre-session screen, commit
  // it AND mirror the resolved flags into the three player-side
  // toggles in one shot. Doing this in the event handler avoids the
  // cascading-render lint rule that fires when we sync via useEffect.
  function handlePickMode(m: PlayerMode) {
    const next = resolvePlayerFlags(m, mode);
    setChosenMode(m);
    setVoiceMode(next.voiceMode);
    setAvatarMode(next.avatarMode);
    setUserVideoOn(next.userVideo);
  }

  // ───────── Duration & inactivity tracking ─────────
  // Wall-clock start anchor for the session timer. Captured the first
  // tick after the gate clears so the timer doesn't run while the
  // intro / mode-picker is still up.
  const sessionStartRef = useRef<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const lastActivityRef = useRef<number | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    if (sessionStartRef.current === null) {
      sessionStartRef.current = Date.now();
    }
    if (lastActivityRef.current === null) {
      lastActivityRef.current = Date.now();
    }
    const t = setInterval(() => {
      if (sessionStartRef.current !== null) {
        setElapsedSec(
          Math.round((Date.now() - sessionStartRef.current) / 1000),
        );
      }
    }, 1000);
    return () => clearInterval(t);
  }, [sessionId]);

  const minSec = duration ? duration.minMin * 60 : 0;
  const maxSec = duration ? duration.maxMin * 60 : 0;
  const minReached = duration ? elapsedSec >= minSec : true;
  const maxReached = duration ? elapsedSec >= maxSec : false;
  // Derive a TTS gender hint from the persona blurb so a "Priya, CFO…"
  // persona gets a female voice instead of Windows' default Microsoft
  // David. Falls back to null (browser default) when nothing matches.
  const personaGender = useMemo(
    () => derivePersonaGender(personaName, personaBlurb),
    [personaName, personaBlurb],
  );
  // NOTE: The manual voice picker used to live here (a dropdown next
  // to the mic that let the trainee override the auto-picked TTS
  // voice). It was removed with Phase 1 of the ElevenLabs cutover —
  // the persona voice is now an admin decision (part of the persona
  // identity) driven by module config, not a trainee preference.
  // The learner-voice-for-auto-flow logic below still uses the
  // browser voice list; that's an intentional feature (two distinct
  // voices in the demo conversation) so we keep the hook wiring.
  // Voice resolution — Phase 3 semantics:
  //   1. If the admin picked a specific voice in the persona editor
  //      (`personaElevenLabsVoiceId`), use it.
  //   2. Otherwise fall back to the gender-based default from the
  //      curated catalog — the same behaviour we shipped in Phase 1.
  // The trainee player forwards this to /api/roleplay/tts; useVoiceMode
  // handles the graceful fallback to browser TTS on error.
  const elevenLabsVoiceId = useMemo(
    () => personaElevenLabsVoiceId ?? pickDefaultVoice(personaGender).id,
    [personaElevenLabsVoiceId, personaGender],
  );

  const voice = useVoiceMode({
    enabled: voiceMode,
    voiceGender: personaGender,
    elevenLabsVoiceId,
    // Attribute every TTS call to the roleplay session so cost lands
    // on the right row + counts toward the per-session cap. Null until
    // /api/roleplay/start returns; before then no TTS fires anyway.
    sessionId,
    // 1500ms of silence → commit. Prior 1000ms cut trainees off
    // mid-sentence on natural thinking pauses ("um… let me…").
    // 1500ms matches how consumer voice bots (ChatGPT Voice, Grok
    // Voice) tune this — tolerates real pauses without feeling dead.
    // Trade-off: 500ms extra latency on clean turn-ends is worth
    // never cutting off the trainee.
    // 2200ms silence-after-speech before auto-commit. 1500ms was too
    // aggressive — normal intra-sentence pauses (thinking, breath,
    // "um…") frequently exceeded it, causing the persona to start
    // replying while the trainee was still forming their thought.
    // 2200ms is a compromise: still responsive when the trainee is
    // actually done, tolerant of mid-sentence pauses common in
    // Indian-English and other cadences with longer natural gaps.
    silenceThresholdMs: 2200,
    onTranscript: (text) => {
      // The hook calls this when STT commits a chunk (silence timer or
      // final result). Stick it straight into the composer and
      // auto-submit so the loop closes — learner speaks → we send →
      // AI streams → we TTS → loop.
      setInput(text);
      void sendText(text);
    },
    // Barge-in (Phase 5): the STT hook fires this when it detects
    // sustained speech while the mic is open in "background" mode
    // during persona TTS. We route through a ref (`bargeInRef`)
    // populated below so this callback doesn't reference `voice` /
    // `avatarRef` before they're bound. Behavior locked in there.
    onInterruption: () => {
      bargeInRef.current();
    },
  });
  // Populated after `voice` + `avatarRef` exist so the callback above
  // can reach the latest cancel handlers. Initialized to a no-op so a
  // very-early interruption event (unlikely — VAD needs 250ms of
  // sustained speech first) can't crash.
  const bargeInRef = useRef<() => void>(() => {});

  // Auto-flow ("demo conversation") — when on, the player runs the
  // entire roleplay hands-off: persona speaks → a short beat → hint
  // is fetched → hint is spoken back in a DIFFERENT voice (the
  // learner voice) → hint is auto-submitted as the trainee's turn
  // → persona responds → loop. Lets the trainee watch and listen to
  // a model conversation instead of having to drive every turn.
  const [autoFlow, setAutoFlow] = useState(false);
  const autoFlowRef = useRef(autoFlow);
  autoFlowRef.current = autoFlow;
  // Pick a "learner" voice that's distinct from the persona's so the
  // two sides of the conversation sound like different people. Falls
  // through to null (the picker's selected voice) when nothing matches.
  const learnerVoiceUri = useMemo(() => {
    if (voice.availableVoices.length === 0) return null;
    const want =
      personaGender === "female"
        ? "male"
        : personaGender === "male"
          ? "female"
          : null;
    if (!want) return null;
    const match = voice.availableVoices.find(
      (v) => v.gender === want && v.uri !== voice.selectedVoiceUri,
    );
    return match?.uri ?? null;
  }, [voice.availableVoices, voice.selectedVoiceUri, personaGender]);
  const learnerVoiceUriRef = useRef<string | null>(null);
  learnerVoiceUriRef.current = learnerVoiceUri;
  const avatar = useStreamingAvatar({
    enabled: voiceMode && avatarMode,
    moduleId,
  });
  // Refs so the bubble-effect can read live values without re-running.
  const avatarRef = useRef(avatar);
  avatarRef.current = avatar;
  // Assemble the barge-in handler on every render so cancelSpeech +
  // avatar.stop pick up the latest instances. Fires the moment the STT
  // VAD sees sustained speech during persona TTS (see onInterruption
  // above).
  bargeInRef.current = () => {
    voice.cancelSpeech();
    const av = avatarRef.current;
    // Streaming avatar (D-ID / HeyGen) has its own TTS; stop it too so
    // the avatar doesn't keep talking after we've handed the floor
    // over to the trainee. Some drivers don't expose stop(); ignore.
    if (av && "stop" in av && typeof (av as { stop?: unknown }).stop === "function") {
      try {
        (av as { stop: () => void }).stop();
      } catch {
        /* ignore */
      }
    }
  };
  // Track which bubbles we've already spoken so a re-render doesn't
  // make the avatar repeat itself.
  const spokenIdxRef = useRef<Set<number>>(new Set());
  // Live cursor into the streaming persona bubble — how many chars have
  // already been pushed to avatar.speak(). Lets us flush completed
  // sentences as they arrive instead of waiting for the whole message.
  const streamingPersonaIdxRef = useRef<number>(-1);
  const streamingContentRef = useRef<string>("");
  const incrementalSpokenLenRef = useRef<Map<number, number>>(new Map());
  // Pause the auto-listen loop while ending so we don't trigger a mic
  // session after the player has already navigated away.
  const stoppingRef = useRef(false);

  // Serialize every avatar.speak() call — pushIncrementalSpeak fires
  // per completed sentence as chunks stream in, and some driver
  // implementations aren't queue-safe (calls can interleave, causing
  // two voices at once). We chain each speak onto the tail of a
  // per-render promise so sentence N always finishes before N+1
  // begins. Reset per bubble so a fresh persona reply starts clean.
  const avatarSpeakChainRef = useRef<Promise<void>>(Promise.resolve());
  // Same chaining discipline for the plain-voice (no-avatar) path so
  // pushIncrementalVoiceSpeak can fire per-sentence during streaming
  // without overlapping calls. Cuts perceived latency: the first
  // sentence of a persona reply becomes audible ~1-2s after the model
  // emits it, instead of waiting for the whole reply to finish
  // streaming before speak() fires.
  const voiceSpeakChainRef = useRef<Promise<void>>(Promise.resolve());
  // Tracks bubbles whose incremental voice-speak already covered the
  // full reply. The post-stream voice-loop effect checks this before
  // firing voice.speak(last.content) — skipping avoids double-
  // speaking on top of the incremental chain. NOT the same as
  // spokenIdxRef: that one skips the entire effect (including mic
  // re-open), we want to skip only the speak call.
  const incrementallySpokenRef = useRef<Set<number>>(new Set());
  // Global "something is currently vocalizing" guard. Prevents the
  // post-stream voice-loop effect from firing voice.speak() while
  // incremental sentences are still being spoken by the avatar path
  // (double-speak race). Cleared when the chain drains.
  const isSpeakingRef = useRef(false);

  // Countdown driver — kicks off the moment the pre-session gate
  // clears. Independent of the /start fetch below, but the /start
  // handler waits for `countdownDoneRef` before applying its result.
  useEffect(() => {
    if (sessionGated) return;
    if (countdownDoneRef.current) return; // already ran this session
    setShowCountdown(true);
    setCountdownValue(COUNTDOWN_SECONDS);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < COUNTDOWN_SECONDS; i++) {
      timers.push(
        setTimeout(
          () => setCountdownValue(COUNTDOWN_SECONDS - i),
          i * 1000,
        ),
      );
    }
    timers.push(
      setTimeout(() => {
        setShowCountdown(false);
        countdownDoneRef.current = true;
        // Apply any /start response that landed during the countdown.
        const pending = pendingStartRef.current;
        if (pending) {
          setSessionId(pending.sessionId);
          if (pending.opening) {
            setBubbles([{ role: "persona", content: pending.opening }]);
          } else {
            setBubbles([]);
          }
          pendingStartRef.current = null;
        }
      }, COUNTDOWN_SECONDS * 1000),
    );
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [sessionGated]);

  useEffect(() => {
    if (startedRef.current) return;
    if (sessionGated) return;
    startedRef.current = true;
    (async () => {
      try {
        const res = await fetch("/api/roleplay/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            moduleId,
            // Persist the language the trainee picked at the gate so
            // the results page can show what was actually selected
            // rather than the persona's first configured option.
            language: chosenLanguage ?? undefined,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            used?: number;
            limit?: number;
          };
          if (data.error === "attempt_limit_reached") {
            throw new Error(
              `Attempt limit reached — you've used ${data.used} of ${data.limit}.`,
            );
          }
          if (data.error === "not_assigned") {
            throw new Error(
              "This training is private and hasn't been assigned to you. Ask your admin for access.",
            );
          }
          if (data.error === "prereq_not_met") {
            throw new Error(
              "Finish the prerequisite trainings before starting this one.",
            );
          }
          if (data.error === "not_open_yet") {
            throw new Error("This training hasn't opened yet.");
          }
          if (data.error === "past_due") {
            throw new Error("This training's due date has passed.");
          }
          throw new Error(data.error ?? `start failed: ${res.status}`);
        }
        const data: { sessionId: string; opening: string | null } =
          await res.json();
        // If the countdown is still running, buffer the response —
        // the countdown effect applies it when it hits Go. Avoids the
        // greeting audio starting behind the overlay.
        if (!countdownDoneRef.current) {
          pendingStartRef.current = data;
          return;
        }
        setSessionId(data.sessionId);
        // When the admin set "Start Roleplay By" = User, the start
        // route returns opening=null and the trainee speaks first.
        if (data.opening) {
          setBubbles([{ role: "persona", content: data.opening }]);
        } else {
          setBubbles([]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start");
      }
    })();
  }, [moduleId, sessionGated]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [bubbles]);

  // When the admin set "Start Roleplay By" = User the start route
  // returns opening=null, so the speak-then-listen effect below never
  // fires (no persona bubble to speak). Open the mic once on session
  // start so the trainee's first line gets captured automatically
  // instead of waiting for them to click the mic icon.
  const userStartListenedRef = useRef(false);
  useEffect(() => {
    if (userStartListenedRef.current) return;
    if (!sessionId) return;
    if (bubbles.length !== 0) return;
    if (!voiceMode || !voice.sttSupported) return;
    userStartListenedRef.current = true;
    voice.startListening();
  }, [sessionId, bubbles.length, voiceMode, voice]);

  async function send() {
    if (!input.trim()) return;
    await sendText(input.trim());
  }

  // Push every complete sentence in the current streaming bubble that
  // hasn't been spoken yet to the avatar. Cheap to call after every
  // network chunk — it walks the new tail, slices off sentences with
  // terminal punctuation, and advances the per-bubble cursor.
  // Only fires when the live D-ID avatar is the target — browser TTS
  // (voice.speak) still runs in the post-stream effect because it
  // can't lip-sync mid-stream the way D-ID can.
  function pushIncrementalSpeak(bubbleIdx: number) {
    if (!voiceMode || !avatarMode) return;
    const av = avatarRef.current;
    const offset = incrementalSpokenLenRef.current.get(bubbleIdx) ?? 0;
    const full = streamingContentRef.current;
    const tail = full.slice(offset);
    const sentences = splitCompleteSentences(tail);
    if (sentences.length === 0) return;
    const consumed = sentences.reduce((sum, s) => sum + s.length, 0);
    incrementalSpokenLenRef.current.set(bubbleIdx, offset + consumed);
    // Chain onto the running speech tail so sentence N always
    // completes before N+1 begins. Some avatar drivers accept parallel
    // speak() calls and interleave them, producing two voices at once.
    for (const s of sentences) {
      isSpeakingRef.current = true;
      avatarSpeakChainRef.current = avatarSpeakChainRef.current
        .then(() => av.speak(s))
        .catch(() => {
          /* single-sentence errors don't break the chain */
        });
    }
  }

  // End-of-stream flush. Sends any final un-terminated text (e.g. the
  // model dropped the last sentence without a period) and marks the
  // bubble as fully spoken so the post-stream voice-loop effect skips
  // it instead of double-speaking the whole thing.
  function flushFinalSpeak(bubbleIdx: number) {
    if (!voiceMode || !avatarMode) return;
    const av = avatarRef.current;
    const offset = incrementalSpokenLenRef.current.get(bubbleIdx) ?? 0;
    const remainder = streamingContentRef.current.slice(offset).trim();
    if (remainder) {
      isSpeakingRef.current = true;
      avatarSpeakChainRef.current = avatarSpeakChainRef.current
        .then(() => av.speak(remainder))
        .catch(() => {
          /* ignore */
        });
    }
    // When the whole chain has drained, drop the "speaking in flight"
    // flag so the post-stream mic-reopen loop can proceed.
    avatarSpeakChainRef.current = avatarSpeakChainRef.current.finally(() => {
      isSpeakingRef.current = false;
    });
    spokenIdxRef.current.add(bubbleIdx);
  }

  // Voice-only counterpart of pushIncrementalSpeak. Fires per completed
  // sentence during streaming, using `voice.speak` (ElevenLabs or
  // browser fallback) chained through voiceSpeakChainRef so calls
  // don't overlap. Runs in the NO-AVATAR voice-mode branch that
  // previously waited for the full reply before speaking — the whole
  // reason this exists is to shave 1-3s off the "user done → AI
  // audible" latency by playing the first sentence while later ones
  // are still being generated upstream.
  function pushIncrementalVoiceSpeak(bubbleIdx: number) {
    if (!voiceMode || avatarMode) return;
    const offset = incrementalSpokenLenRef.current.get(bubbleIdx) ?? 0;
    const full = streamingContentRef.current;
    const tail = full.slice(offset);
    const sentences = splitCompleteSentences(tail);
    if (sentences.length === 0) return;
    const consumed = sentences.reduce((sum, s) => sum + s.length, 0);
    incrementalSpokenLenRef.current.set(bubbleIdx, offset + consumed);
    for (const s of sentences) {
      isSpeakingRef.current = true;
      voiceSpeakChainRef.current = voiceSpeakChainRef.current
        .then(() => voice.speak(s))
        .catch(() => {
          /* per-sentence failure never breaks the chain */
        });
    }
  }

  function flushFinalVoiceSpeak(bubbleIdx: number) {
    if (!voiceMode || avatarMode) return;
    const offset = incrementalSpokenLenRef.current.get(bubbleIdx) ?? 0;
    const remainder = streamingContentRef.current.slice(offset).trim();
    if (remainder) {
      isSpeakingRef.current = true;
      voiceSpeakChainRef.current = voiceSpeakChainRef.current
        .then(() => voice.speak(remainder))
        .catch(() => {
          /* ignore */
        });
    }
    voiceSpeakChainRef.current = voiceSpeakChainRef.current.finally(() => {
      isSpeakingRef.current = false;
    });
    // Mark that incremental speech covered this bubble. The post-
    // stream voice-loop effect uses this to skip the redundant
    // voice.speak(last.content) call while still running the mic
    // re-open / auto-flow handoff logic downstream.
    incrementallySpokenRef.current.add(bubbleIdx);
  }

  async function sendText(userMessage: string) {
    if (!sessionId || streaming || !userMessage.trim()) return;
    setInput("");
    setError(null);

    // Track the persona bubble idx so we can push completed sentences
    // to the avatar as they stream — index = current length + 1
    // (we're about to append [learner, persona]).
    const personaIdx = bubbles.length + 1;
    streamingPersonaIdxRef.current = personaIdx;
    streamingContentRef.current = "";
    incrementalSpokenLenRef.current.set(personaIdx, 0);

    setBubbles((b) => [
      ...b,
      { role: "learner", content: userMessage },
      { role: "persona", content: "" },
    ]);
    setStreaming(true);

    // Streaming turn: use an idle watchdog rather than a fixed cap.
    // Rearmed on every chunk; if no data arrives for 20s we assume the
    // upstream (Anthropic or the /turn route) has wedged and abort so
    // the UI can recover instead of freezing on a dead stream.
    const turnAbort = new AbortController();
    const IDLE_MS = 20_000;
    let idleTimer: ReturnType<typeof setTimeout> = setTimeout(
      () => turnAbort.abort(),
      IDLE_MS,
    );
    const rearmIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => turnAbort.abort(), IDLE_MS);
    };

    try {
      const res = await fetch("/api/roleplay/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, userMessage }),
        signal: turnAbort.signal,
      });
      if (!res.ok || !res.body) throw new Error(`turn failed: ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        rearmIdle();
        const chunk = decoder.decode(value, { stream: true });
        streamingContentRef.current += chunk;
        setBubbles((b) => {
          const next = [...b];
          const last = next[next.length - 1];
          if (last && last.role === "persona") {
            next[next.length - 1] = {
              role: "persona",
              content: last.content + chunk,
            };
          }
          return next;
        });
        pushIncrementalSpeak(personaIdx);
        pushIncrementalVoiceSpeak(personaIdx);
      }
      flushFinalSpeak(personaIdx);
      flushFinalVoiceSpeak(personaIdx);
    } catch (e) {
      const aborted =
        e instanceof DOMException && e.name === "AbortError";
      setError(
        aborted
          ? "Reply timed out — the server didn't respond. Try again."
          : e instanceof Error
            ? e.message
            : "Failed to send",
      );
      setBubbles((b) =>
        b[b.length - 1]?.role === "persona" && b[b.length - 1]?.content === ""
          ? b.slice(0, -1)
          : b,
      );
    } finally {
      clearTimeout(idleTimer);
      setStreaming(false);
      // Live coach: poll the fast model after every *other* learner turn.
      // Fire-and-forget — coach failures never block the player.
      const learnerTurns =
        bubbles.filter((b) => b.role === "learner").length + 1;
      if (learnerTurns >= 2 && learnerTurns % 2 === 0) {
        void pollCoach(learnerTurns);
      }
    }
  }

  // Voice loop: when a persona bubble finishes streaming, speak it,
  // then either (a) hand the mic to the trainee or (b) trigger the
  // auto-flow step that speaks the suggested reply and submits it.
  //
  // Phase 5 cadence: open the mic in "background" mode BEFORE persona
  // TTS starts so the STT hook can detect barge-in (sustained speech
  // from the trainee = "I want to interrupt"). Adaptive VAD in the
  // STT hook keeps false triggers rare even on speakers. When the
  // persona finishes cleanly, we just flip the mic to "active" mode —
  // no new getUserMedia prompt, no perceptible seam.
  useEffect(() => {
    if (!voiceMode || streaming || stoppingRef.current) return;
    const lastIdx = bubbles.length - 1;
    if (lastIdx < 0) return;
    const last = bubbles[lastIdx];
    if (last.role !== "persona") return;
    if (last.content.trim().length === 0) return;
    if (spokenIdxRef.current.has(lastIdx)) return;
    spokenIdxRef.current.add(lastIdx);
    (async () => {
      // Open the mic in background mode before the persona speaks.
      // Skipped for auto-flow (the trainee isn't in the loop) and for
      // browsers without STT (nothing to detect anyway).
      const bargeInAllowed =
        !autoFlowRef.current &&
        voice.sttSupported &&
        !stoppingRef.current;
      if (bargeInAllowed) {
        voice.startListening({ mode: "background" });
      }

      // If the streaming avatar is connected, push text to HeyGen so
      // the avatar speaks it (and we don't double-up with browser TTS).
      // Otherwise fall back to the browser SpeechSynthesis.
      //
      // Turn-integrity guard: if incremental sentences from mid-stream
      // are still draining through avatarSpeakChainRef, wait for them
      // to complete before firing any additional speak. Prevents the
      // classic "two voices at once" race where mid-stream chunks and
      // the post-stream fallback both hit the audio device.
      const av = avatarRef.current;
      // Hard cap on any single TTS pass. 12s covers even a very long
      // persona reply on a slow network; past that, we assume the
      // upstream is stuck and hand the mic back so the trainee
      // isn't frozen waiting for a dead audio stream.
      const TTS_TIMEOUT_MS = 12_000;
      if (av.state === "ready" || av.state === "speaking") {
        // Wait for any in-flight incremental sentences to drain first.
        await withTimeout(avatarSpeakChainRef.current, TTS_TIMEOUT_MS).catch(
          () => {},
        );
        const sentences = splitCompleteSentences(last.content);
        isSpeakingRef.current = true;
        try {
          if (sentences.length === 0) {
            await withTimeout(av.speak(last.content), TTS_TIMEOUT_MS);
          } else {
            for (const s of sentences) {
              await withTimeout(av.speak(s), TTS_TIMEOUT_MS);
            }
            const consumed = sentences.reduce((sum, s) => sum + s.length, 0);
            const tail = last.content.slice(consumed).trim();
            if (tail) await withTimeout(av.speak(tail), TTS_TIMEOUT_MS);
          }
        } finally {
          isSpeakingRef.current = false;
        }
      } else {
        // Wait for both the avatar chain (defensive; usually empty in
        // voice-only mode) AND the incremental voice chain to drain.
        // The voice chain holds any in-flight per-sentence speak calls
        // fired during streaming by pushIncrementalVoiceSpeak.
        await withTimeout(avatarSpeakChainRef.current, TTS_TIMEOUT_MS).catch(
          () => {},
        );
        await withTimeout(voiceSpeakChainRef.current, TTS_TIMEOUT_MS).catch(
          () => {},
        );
        if (incrementallySpokenRef.current.has(lastIdx)) {
          // Incremental TTS already covered this bubble — skip the
          // redundant full-reply speak. Mic re-open logic below still
          // fires normally.
          incrementallySpokenRef.current.delete(lastIdx);
        } else {
          // Fallback: incremental path didn't fire (e.g., an all-in-
          // one-chunk reply with no terminal punctuation until the
          // very end and flushFinalVoiceSpeak was a no-op path). Speak
          // the whole thing so audio doesn't silently drop.
          isSpeakingRef.current = true;
          try {
            await withTimeout(voice.speak(last.content), TTS_TIMEOUT_MS);
          } finally {
            isSpeakingRef.current = false;
          }
        }
      }

      // Turn-gap before the user's mic opens. 300ms serves two
      // purposes: (1) natural pause between speakers so the exchange
      // feels human, not walkie-talkie, (2) audio drain for the
      // browser's echo canceller — persona TTS wind-down keeps
      // bleeding into the mic for ~200ms after `end`, and if we open
      // the mic during that window the leaked audio gets sampled as
      // ambient sound. 300ms is enough to clear it without stalling
      // the exchange. Anything under ~200ms triggered the "stuck mic
      // because threshold locked in during bleed" pathology.
      await new Promise((r) => setTimeout(r, 300));
      if (stoppingRef.current) return;

      // Branch: auto-flow takes over the trainee's turn; manual mode
      // hands the mic over for the user's reply.
      if (autoFlowRef.current) {
        void runAutoFlowAfterPersona();
        return;
      }
      // Flip the mic to active mode. If the trainee already interrupted
      // during TTS, the STT hook self-flipped to active from within
      // its VAD tick — this call is idempotent in that case. If no
      // barge-in fired, we just switch the same open mic from listen-
      // for-interruption to listen-for-commit-on-silence.
      if (
        voiceMode &&
        !stoppingRef.current &&
        voice.sttSupported &&
        !streaming
      ) {
        if (bargeInAllowed) {
          voice.setListeningMode("active");
        } else {
          voice.startListening({ mode: "active" });
        }

        // Watchdog: verify the mic actually opened. setListeningMode()
        // is a no-op if the underlying MediaRecorder died; startListening
        // can silently fail if getUserMedia raced with a track cleanup.
        // Either way, if state hasn't flipped to "listening" within
        // 1.5s, force a fresh startListening as a recovery. Without
        // this the trainee stares at a dead mic forever.
        setTimeout(() => {
          if (stoppingRef.current || streaming) return;
          if (voiceStateRef.current === "listening") return;
          if (voice.sttError !== null) return; // real error — banner handles it
          try {
            voice.startListening({ mode: "active" });
          } catch {
            /* best effort — a second failure will surface via sttError */
          }
        }, 1500);
      }
    })();
    // runAutoFlowAfterPersona is read via ref-stable closures (autoFlowRef,
    // learnerVoiceUriRef) so it doesn't need to be in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbles, voiceMode, streaming, voice]);

  async function pollCoach(currentTurn: number) {
    if (!sessionId) return;
    setCoachLoading(true);
    try {
      const res = await fetch("/api/roleplay/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return;
      const data: { hint: string | null; tone: "tip" | "warn" } =
        await res.json();
      if (data.hint) {
        setCoachHint({ hint: data.hint, tone: data.tone, turn: currentTurn });
      }
    } catch {
      // silent — coach is optional UX
    } finally {
      setCoachLoading(false);
    }
  }

  // ───────── Audio recording (recordAv) ─────────
  // Captures the trainee-side microphone for the duration of the
  // session and uploads the blob right before /api/roleplay/end fires.
  // Uses MediaRecorder + getUserMedia({audio:true}) — a fresh stream
  // independent of the voice-mode STT pipeline so the two don't fight
  // over track ownership. Declared above end() so end() can call
  // flushRecording() in source order (function hoisting works at
  // runtime, but the linter prefers explicit ordering).
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordingStartedRef = useRef(false);
  const [recordingStatus, setRecordingStatus] = useState<
    "idle" | "recording" | "uploading" | "saved" | "failed"
  >("idle");

  useEffect(() => {
    if (!recordAv || !sessionId || recordingStartedRef.current) return;
    if (typeof window === "undefined") return;
    if (typeof MediaRecorder === "undefined") {
      // Older browser — recording silently disabled. Don't block the
      // session; the admin can adjust the setting if needed.
      return;
    }
    recordingStartedRef.current = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        recordStreamRef.current = stream;
        const mime = pickRecorderMime();
        const recorder = mime
          ? new MediaRecorder(stream, { mimeType: mime })
          : new MediaRecorder(stream);
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordChunksRef.current.push(e.data);
        };
        // 1-second timeslices so a sudden tab close still leaves the
        // first few seconds in memory for the next upload attempt.
        recorder.start(1000);
        recorderRef.current = recorder;
        setRecordingStatus("recording");
      } catch (e) {
        // Mic denied or unavailable — keep the session going. The
        // recording feature degrades gracefully; admins should not
        // tie completion logic to its presence.
        console.warn("[recording] start failed:", e);
        setRecordingStatus("failed");
      }
    })();
    return () => {
      const r = recorderRef.current;
      if (r && r.state !== "inactive") {
        try {
          r.stop();
        } catch {
          /* ignore — already stopped */
        }
      }
      const s = recordStreamRef.current;
      if (s) s.getTracks().forEach((t) => t.stop());
    };
  }, [recordAv, sessionId]);

  async function flushRecording(): Promise<void> {
    if (!sessionId) return;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    setRecordingStatus("uploading");
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      try {
        recorder.stop();
      } catch {
        resolve();
      }
    });
    const stream = recordStreamRef.current;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    const chunks = recordChunksRef.current;
    if (chunks.length === 0) {
      setRecordingStatus("failed");
      return;
    }
    const blob = new Blob(chunks, { type: chunks[0].type || "audio/webm" });
    recordChunksRef.current = [];
    // Skip upload for tiny blobs — a webm container with no audio
    // frames is ~few hundred bytes and the server can't do anything
    // useful with it. Sending it also trips the multipart parser on
    // some browser+dev-server combos and produces the confusing
    // "bad form data" 400.
    const MIN_UPLOAD_BYTES = 2048;
    if (blob.size < MIN_UPLOAD_BYTES) {
      console.warn(
        `[recording] skipping upload — blob is only ${blob.size} bytes (min ${MIN_UPLOAD_BYTES}). No audio was captured.`,
      );
      setRecordingStatus("failed");
      return;
    }
    const ext = blob.type.includes("webm")
      ? "webm"
      : blob.type.includes("ogg")
        ? "ogg"
        : blob.type.includes("mp4")
          ? "m4a"
          : "webm";
    const fd = new FormData();
    fd.set("sessionId", sessionId);
    fd.set("file", blob, `roleplay-${sessionId}.${ext}`);
    try {
      console.info(
        `[recording] uploading blob size=${blob.size} type=${blob.type || "(none)"}`,
      );
      const res = await fetch("/api/roleplay/recording", {
        method: "POST",
        body: fd,
        // 60s cap accommodates a full-length session recording on
        // moderate connections; larger blobs would need chunked upload.
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `upload failed: ${res.status}`);
      }
      setRecordingStatus("saved");
    } catch (e) {
      console.warn("[recording] upload failed:", e);
      setRecordingStatus("failed");
    }
  }

  function end() {
    if (!sessionId || ending) return;
    // Pause the voice loop so a queued TTS-then-listen cycle doesn't
    // fire after the player has already navigated away.
    stoppingRef.current = true;
    voice.cancelSpeech();
    voice.stopListening();
    startEnd(async () => {
      try {
        // Recording upload runs in the BACKGROUND — a 3-5MB blob on
        // weak Wi-Fi used to add a 20s spinner between "End" and the
        // results page. The upload continues after client-side
        // navigation (fetch is not tied to component lifecycle) and
        // is best-effort — failures only lose the playback affordance.
        if (recordAv) {
          void flushRecording().catch((e) =>
            console.warn("[end] background recording upload failed:", e),
          );
        }
        const res = await fetch("/api/roleplay/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) throw new Error(`end failed: ${res.status}`);
        const data: { redirect: string } = await res.json();
        router.push(data.redirect);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to end");
        stoppingRef.current = false;
      }
    });
  }

  // Auto-disconnect when the duration cap is hit. The max duration is
  // treated as a HARD cap — regardless of the admin's
  // `autoDisconnectOnLimit` toggle, when the timer runs out we end the
  // session and route to results. Prior behavior gated on that admin
  // toggle (defaulting off), which surprised trainees: the timer
  // would just keep ticking past the "cap" with no closure. The
  // natural expectation for a training session is "time's up → session
  // ends → I see my score."
  //
  // Turn-integrity gate: never cut off a persona reply that's still
  // being generated (`streaming`) or still being spoken by TTS
  // (`voice.state === "speaking"`). If the max duration lands mid-
  // turn we simply defer — the effect re-runs the moment the AI
  // finishes, then fires end() cleanly. This preserves natural turn-
  // taking: the trainee always hears the full persona reply before
  // the session closes.
  const endedFiredRef = useRef(false);
  // Grace-period override. If either flag (streaming or TTS speaking)
  // gets stuck true past the max duration — e.g., a hung /turn stream
  // that timed out server-side but didn't cleanly flip the client
  // state, or a wedged ElevenLabs TTS — the session would sit past
  // its cap forever waiting on a turn that will never finish. After
  // this many seconds past maxSec, force-end regardless of guards.
  // The trainee may lose a partial persona reply mid-generation,
  // which is strictly better than a session that ignores its cap.
  const AUTO_END_GRACE_SEC = 60;
  useEffect(() => {
    if (!sessionId || ending || endedFiredRef.current) return;
    if (!maxReached) return;
    const overtimeSec = elapsedSec - maxSec;
    const forceEnd = overtimeSec >= AUTO_END_GRACE_SEC;
    if (!forceEnd && (streaming || voice.state === "speaking")) return;
    if (forceEnd) {
      console.warn(
        `[roleplay] force-ending: ${overtimeSec}s past cap, streaming=${streaming}, voiceState=${voice.state}`,
      );
    }
    endedFiredRef.current = true;
    end();
    // end() is stable for the duration of the session; ESLint can't see
    // that, so we deliberately scope deps to the trigger inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxReached, sessionId, ending, streaming, voice.state, elapsedSec, maxSec]);

  // Bump the activity ref every time a turn lands — either side counts.
  useEffect(() => {
    lastActivityRef.current = Date.now();
  }, [bubbles.length]);

  // Inactivity watchdog. 30s idle in a non-streaming state ends the
  // session. Only active when the admin enabled it AND the session has
  // started AND we're not already mid-end.
  //
  // Turn-integrity gate: as long as the AI is streaming a reply or the
  // persona is still being spoken, we treat that as ongoing activity —
  // reset the idle clock and skip this tick. This prevents the
  // watchdog from ending the session mid-generation on long persona
  // replies where TTS + streaming exceed 30s of "no user activity".
  useEffect(() => {
    if (!duration?.disconnectOnInactivity) return;
    if (!sessionId || ending || endedFiredRef.current) return;
    const t = setInterval(() => {
      if (
        streaming ||
        voice.state === "speaking" ||
        lastActivityRef.current === null
      ) {
        lastActivityRef.current = Date.now();
        return;
      }
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= 30_000) {
        endedFiredRef.current = true;
        end();
      }
    }, 5_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sessionId,
    ending,
    streaming,
    voice.state,
    duration?.disconnectOnInactivity,
  ]);

  // ───────── Hints ─────────
  // Track the count of trainee-requested hints used in this attempt
  // (separate from the auto-coach hints, which always populate
  // coachHint regardless of the admin's hint setting). The current
  // hint string is rendered in its own card so a trainee can always
  // re-read it while typing their next reply.
  const [hintsUsed, setHintsUsed] = useState(0);
  const [currentHint, setCurrentHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  // hintRefreshing = an auto-suggestion is being fetched in the
  // background while a stale one is still visible. Keeps the previous
  // hint readable so the trainee isn't stranded mid-conversation.
  const [hintRefreshing, setHintRefreshing] = useState(false);
  const [hintError, setHintError] = useState<string | null>(null);

  const hintsAllowed = hints && hints.kind !== "no";
  const hintsLimited = hints?.kind === "limited";
  const hintsRemaining = hintsLimited ? hints.limit - hintsUsed : Infinity;
  const hintsExhausted = hintsLimited && hintsRemaining <= 0;

  async function requestHint() {
    if (!sessionId || hintLoading || !hintsAllowed || hintsExhausted) return;
    setHintError(null);
    setHintLoading(true);
    try {
      const res = await fetch("/api/roleplay/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          type: hints?.type ?? "complete",
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `hint failed: ${res.status}`);
      }
      const data = (await res.json()) as { hint: string };
      setCurrentHint(data.hint);
      setHintsUsed((n) => n + 1);
      // Drop any deferred auto-hint so a stale background suggestion
      // doesn't overwrite the manual "Try another" the user just
      // explicitly asked for.
      pendingAutoHintRef.current = null;
    } catch (e) {
      setHintError(e instanceof Error ? e.message : "Failed");
    } finally {
      setHintLoading(false);
    }
  }

  // Auto-suggest a reply after EVERY new persona turn so the
  // teleprompter line always reflects what the customer just said.
  // Uses the auto=true mode of /api/roleplay/hint, which skips the
  // Feedback persist and doesn't count toward the trainee's hint cap —
  // these are background suggestions, not user-requested help.
  //
  // Display is DEFERRED while persona TTS is still playing: the fetch
  // runs in parallel with TTS (so it's ready in time), but the visible
  // hint only changes after the persona has finished speaking. This
  // keeps the right panel from visibly updating mid-sentence, which
  // breaks the illusion of a natural conversation.
  const lastAutoSuggestedAtRef = useRef(-1);
  const pendingAutoHintRef = useRef<string | null>(null);
  // voiceStateRef mirrors voice.state for callback closures that need
  // a fresh read without re-binding on every render.
  const voiceStateRef = useRef(voice.state);
  useEffect(() => {
    voiceStateRef.current = voice.state;
  }, [voice.state]);

  async function fetchAutoSuggestion() {
    if (!sessionId || !hintsAllowed) return;
    setHintError(null);
    setHintRefreshing(true);
    try {
      const res = await fetch("/api/roleplay/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          type: hints?.type ?? "complete",
          auto: true,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `hint failed: ${res.status}`);
      }
      const data = (await res.json()) as { hint: string };
      // If persona TTS is still playing, stash the new hint and let
      // the voice-state effect promote it to currentHint once the
      // line finishes. The "updating" badge stays visible in the
      // meantime so the user has feedback.
      if (voiceStateRef.current === "speaking") {
        pendingAutoHintRef.current = data.hint;
      } else {
        setCurrentHint(data.hint);
        setHintRefreshing(false);
      }
    } catch (e) {
      setHintError(e instanceof Error ? e.message : "Failed");
      setHintRefreshing(false);
    }
  }

  // Promote a deferred hint to the visible state as soon as the
  // persona stops speaking (state transitions away from "speaking").
  useEffect(() => {
    if (voice.state === "speaking") return;
    if (pendingAutoHintRef.current === null) return;
    setCurrentHint(pendingAutoHintRef.current);
    pendingAutoHintRef.current = null;
    setHintRefreshing(false);
  }, [voice.state]);

  // Auto-suggest the next hint, but debounced: give the trainee a
  // window to start typing/speaking themselves before we spend an LLM
  // call on a suggestion they don't need. If the composer picks up
  // any input during the wait, we cancel and don't fire at all.
  //
  // Previously this fired synchronously as soon as `bubbles` grew,
  // meaning every single persona turn triggered a /api/roleplay/hint
  // request that competed with the main streaming reply and the
  // periodic coach poll for tokens/rate limits.
  const AUTO_HINT_DELAY_MS = 2500;
  useEffect(() => {
    if (!sessionId) return;
    if (!hintsAllowed) return;
    if (streaming || hintLoading || hintRefreshing) return;
    if (lastAutoSuggestedAtRef.current === bubbles.length) return;
    const last = bubbles[bubbles.length - 1];
    const personaReady =
      last && last.role === "persona" && last.content.trim().length > 0;
    const userStartsEmpty =
      flow?.startBy === "user" && bubbles.length === 0;
    if (!personaReady && !userStartsEmpty) return;
    // If the trainee is already composing a reply, don't suggest.
    if (input.trim().length > 0) return;
    const bubblesAtSchedule = bubbles.length;
    const t = setTimeout(() => {
      // The effect's cleanup runs the moment any dep changes (new
      // bubble arrives, user starts typing, streaming flips), so if
      // the timer fires the situation is still the one we scheduled
      // against — just record the fire so we don't ask again for the
      // same conversational state.
      lastAutoSuggestedAtRef.current = bubblesAtSchedule;
      void fetchAutoSuggestion();
    }, AUTO_HINT_DELAY_MS);
    return () => clearTimeout(t);
    // fetchAutoSuggestion reads live state via setters/refs; safe to
    // omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sessionId,
    bubbles,
    streaming,
    hintsAllowed,
    hintLoading,
    hintRefreshing,
    flow?.startBy,
    input,
  ]);

  // ───────── Auto-flow orchestrator ─────────
  // Drives the hands-off conversation: after the persona finishes
  // speaking we wait a beat, pull a fresh hint, speak it back in the
  // learner voice, and submit it as the trainee's turn. Each call is
  // gated by a running-ref so a re-trigger mid-step doesn't fork.
  const autoFlowRunningRef = useRef(false);

  async function fetchHintNow(): Promise<string | null> {
    if (!sessionId || !hintsAllowed || hintsExhausted) return null;
    setHintError(null);
    setHintLoading(true);
    try {
      const res = await fetch("/api/roleplay/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          type: hints?.type ?? "complete",
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `hint failed: ${res.status}`);
      }
      const data = (await res.json()) as { hint: string };
      setCurrentHint(data.hint);
      setHintsUsed((n) => n + 1);
      return data.hint;
    } catch (e) {
      setHintError(e instanceof Error ? e.message : "Failed");
      return null;
    } finally {
      setHintLoading(false);
    }
  }

  async function runAutoFlowAfterPersona() {
    if (autoFlowRunningRef.current) return;
    if (!autoFlowRef.current || stoppingRef.current) return;
    autoFlowRunningRef.current = true;
    let bailed = false;
    try {
      // Make sure the mic isn't capturing the AI voice while we drive
      // the conversation.
      voice.stopListening();

      // Kick the hint fetch immediately so it overlaps with the 700ms
      // cosmetic pause. Previously we awaited the pause and THEN the
      // fetch sequentially, so a 2s LLM call added a visible 2s silence
      // between persona and learner voice. Now the pause is guaranteed
      // to run in parallel with the network round-trip.
      const hintPromise: Promise<string | null> =
        hintsAllowed && !hintsExhausted
          ? fetchHintNow()
          : Promise.resolve(null);

      // Pause briefly so the conversation doesn't feel robotic.
      await new Promise((r) => setTimeout(r, 700));
      if (!autoFlowRef.current || stoppingRef.current) {
        bailed = true;
        // Still consume the in-flight hint promise so hintsUsed state
        // and any error handling settle rather than dangling.
        void hintPromise.catch(() => {});
        return;
      }

      // Need a hint to speak as the learner's reply. Hints disabled or
      // exhausted? Fall back to opening the mic so the trainee can
      // continue manually instead of stalling.
      if (!hintsAllowed || hintsExhausted) {
        if (voice.sttSupported && !stoppingRef.current) {
          voice.startListening();
        }
        return;
      }
      const hint = await hintPromise;
      if (!hint || !autoFlowRef.current || stoppingRef.current) {
        bailed = true;
        return;
      }

      // Speak the hint in the learner voice so the two sides sound
      // like different people. Falls back to the default voice when
      // the browser doesn't have a contrasting voice available.
      await voice.speak(hint, { voiceUri: learnerVoiceUriRef.current });
      if (!autoFlowRef.current || stoppingRef.current) {
        bailed = true;
        return;
      }

      // Tiny beat before submitting so the persona's reply doesn't
      // clobber the tail of the spoken hint.
      await new Promise((r) => setTimeout(r, 400));
      if (!autoFlowRef.current || stoppingRef.current) {
        bailed = true;
        return;
      }

      await sendText(hint);
    } finally {
      autoFlowRunningRef.current = false;
      // If we bailed because the trainee turned auto-flow off mid-step,
      // hand the mic back so they can speak immediately instead of
      // sitting on a dead screen waiting to click.
      if (
        bailed &&
        !autoFlowRef.current &&
        !stoppingRef.current &&
        voiceMode &&
        voice.sttSupported
      ) {
        voice.startListening();
      }
    }
  }

  // User-starts flow + auto-flow: there's no persona bubble to trigger
  // off, so kick the first auto-flow step the moment the session is
  // live. The persona-TTS effect handles all subsequent turns.
  const autoFlowKickedRef = useRef(false);
  useEffect(() => {
    if (!autoFlow) {
      autoFlowKickedRef.current = false;
      return;
    }
    if (autoFlowKickedRef.current) return;
    if (!sessionId || streaming) return;
    if (flow?.startBy !== "user") return;
    if (bubbles.length !== 0) return;
    autoFlowKickedRef.current = true;
    void runAutoFlowAfterPersona();
    // runAutoFlowAfterPersona reads live values via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFlow, sessionId, streaming, bubbles.length, flow?.startBy]);

  // Toggle-transition handler — covers the modes the persona-TTS effect
  // can't see (it only fires on bubble change). When the trainee flips
  // OFF→ON between turns, kick the orchestrator now so the next reply
  // doesn't sit waiting for the next bubble. When they flip ON→OFF,
  // make sure TTS is silenced and the mic opens if the persona has
  // already spoken.
  const prevAutoFlowRef = useRef(false);
  useEffect(() => {
    const prev = prevAutoFlowRef.current;
    if (prev === autoFlow) return;
    prevAutoFlowRef.current = autoFlow;

    if (autoFlow) {
      // OFF → ON: silence any open mic and, if the persona has already
      // finished its last line, drive the next learner turn now.
      voice.stopListening();
      if (
        !autoFlowRunningRef.current &&
        sessionId &&
        !streaming &&
        !stoppingRef.current
      ) {
        const last = bubbles[bubbles.length - 1];
        if (last?.role === "persona" && last.content.trim().length > 0) {
          void runAutoFlowAfterPersona();
        }
      }
    } else {
      // ON → OFF: stop any in-flight TTS, then hand the mic back if
      // we're between turns. If the orchestrator is mid-step, its
      // `finally` bail-out opens the mic — don't double-fire here.
      voice.cancelSpeech();
      if (
        !autoFlowRunningRef.current &&
        sessionId &&
        !streaming &&
        !stoppingRef.current &&
        voiceMode &&
        voice.sttSupported
      ) {
        const last = bubbles[bubbles.length - 1];
        if (last?.role === "persona") {
          voice.startListening();
        }
      }
    }
    // runAutoFlowAfterPersona reads live values via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFlow, sessionId, streaming, voiceMode, bubbles]);

  function handleToggleAutoFlow() {
    const next = !autoFlow;
    setAutoFlow(next);
    // Auto-flow needs TTS to run; flip voice mode on if it's off so the
    // first persona line speaks aloud instead of just rendering as text.
    // The transition effect above handles silencing / mic hand-off so
    // we don't duplicate that logic here.
    if (next && !voiceMode) {
      setVoiceMode(true);
    }
  }

  function handleEndClick() {
    if (
      duration?.failBelowMin &&
      duration.minMin > 0 &&
      !minReached &&
      sessionId
    ) {
      const remaining = Math.max(0, minSec - elapsedSec);
      const mm = Math.floor(remaining / 60);
      const ss = remaining % 60;
      const ok = window.confirm(
        `You're below the ${duration.minMin}-minute minimum (${mm}:${ss
          .toString()
          .padStart(2, "0")} left). Ending now will mark this attempt as failed. Continue anyway?`,
      );
      if (!ok) return;
    }
    end();
  }

  const turnsTaken = Math.floor(
    bubbles.filter((b) => b.role === "learner").length,
  );

  if (sessionGated) {
    return (
      <PreSessionGate
        moduleName={moduleName}
        introGif={scenarioIntroGif}
        introDismissed={introDismissed}
        onDismissIntro={() => setIntroDismissed(true)}
        needsModePick={needsModePick}
        availableModes={availableModes}
        chosenMode={chosenMode}
        onPickMode={handlePickMode}
        needsLanguagePick={needsLanguagePick}
        availableLanguages={availableLanguages}
        chosenLanguage={chosenLanguage}
        onPickLanguage={setChosenLanguage}
      />
    );
  }

  // Latest persona bubble drives the Caption panel — the trainee
  // always sees what the AI just said (or is currently streaming).
  const lastPersonaBubble = [...bubbles]
    .reverse()
    .find((b) => b.role === "persona");
  const captionText = lastPersonaBubble?.content ?? "";
  const captionThinking =
    streaming &&
    bubbles[bubbles.length - 1]?.role === "persona" &&
    bubbles[bubbles.length - 1]?.content === "";

  const personaShort = personaName.split(",")[0];
  const personaRole = derivePersonaRole(personaName);
  const showMicListening =
    voiceMode && voice.sttSupported && voice.state === "listening";

  return (
    <div className="space-y-4 pb-24">
      {showCountdown ? <StartingCountdown value={countdownValue} /> : null}
      {/* V2 opt-in — small unobtrusive pill above the header */}
      <div className="flex justify-end">
        <a
          href="?ui=v2"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent hover:text-accent-strong underline underline-offset-2"
        >
          <Icon name="ai-sparkle" size={10} />
          Try the new design
        </a>
      </div>

      {/* Header — Role Play title + timer (left), module/scenario tags (right) */}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <h1
            className="font-display text-[22px] leading-none -tracking-[0.01em]"
            style={{ color: "#5b2eea" }}
          >
            Role Play
          </h1>
          {duration ? (
            <TimerPill
              elapsedSec={elapsedSec}
              maxSec={maxSec}
              maxReached={maxReached}
            />
          ) : null}
          {attemptInfo ? (
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.08em] px-2 py-[3px] rounded-sm border bg-surface-2 text-ink-2 border-border"
              title="Attempts used of the trainer's cap"
            >
              Attempt {attemptInfo.used + 1} / {attemptInfo.limit}
            </span>
          ) : null}
          {recordAv ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] px-2 py-[3px] rounded-sm border",
                recordingStatus === "recording"
                  ? "bg-bad-pale text-bad border-bad/20"
                  : recordingStatus === "uploading"
                    ? "bg-warn-pale text-warn border-warn/20"
                    : recordingStatus === "saved"
                      ? "bg-good-pale text-good border-good/20"
                      : "bg-surface-2 text-ink-3 border-border",
              )}
              title={
                recordingStatus === "recording"
                  ? "Audio is being recorded — uploaded when the session ends."
                  : recordingStatus === "uploading"
                    ? "Uploading the recording…"
                    : recordingStatus === "saved"
                      ? "Recording saved to your results page."
                      : recordingStatus === "failed"
                        ? "Recording unavailable (mic denied or upload failed)."
                        : "Recording…"
              }
            >
              <span
                className={cn(
                  "inline-block w-1.5 h-1.5 rounded-full",
                  recordingStatus === "recording"
                    ? "bg-bad animate-pulse"
                    : "bg-current",
                )}
                aria-hidden
              />
              {/* Wrapped span + suppressHydrationWarning: the bare text
                  "REC" gets rewritten by trader browser extensions
                  (Upstox, Groww) that recognize it as an NSE ticker
                  symbol (REC LIMITED) before React hydrates. */}
              <span suppressHydrationWarning>REC</span>
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {trainingTitle ? (
            <TopicPill icon="training" label={trainingTitle} />
          ) : null}
          <TopicPill icon="layers" label={moduleName} />
        </div>
      </header>

      {/* Body — left video tiles + right Caption/Hint panels */}
      <div
        className="grid gap-4 items-start"
        style={{ gridTemplateColumns: "360px minmax(0, 1fr)" }}
      >
        {/* Left column — stacked video tiles */}
        <div className="space-y-4">
          <VideoTile
            label={personaRole || personaShort}
            // Persona tile is the current speaker whenever it's mid-stream
            // OR has a settled caption on screen. Previously this was
            // `!streaming && …`, so the avatar visibly *deactivated*
            // exactly when the AI was talking — the ring vanished the
            // moment tokens started flowing back.
            isActive={streaming || captionText.length > 0}
            cornerAction={
              avatarMode ? (
                <button
                  type="button"
                  onClick={() => setAvatarMode(false)}
                  suppressHydrationWarning
                  className="px-2.5 py-[5px] rounded-md text-[10.5px] font-semibold text-white"
                  style={{ background: "#5b2eea" }}
                >
                  Show Audio Only
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setAvatarMode(true)}
                  suppressHydrationWarning
                  className="px-2.5 py-[5px] rounded-md text-[10.5px] font-semibold text-white"
                  style={{ background: "#5b2eea" }}
                >
                  Show Video
                </button>
              )
            }
          >
            {avatarMode ? (
              <PersonaVideoSurface
                attach={avatar.attach}
                state={avatar.state}
                error={avatar.error}
                fallbackName={personaShort}
              />
            ) : (
              <PersonaAudioSurface
                speaking={voice.state === "speaking" || streaming}
                name={personaShort}
                portraitUrl={personaPortraitUrl}
              />
            )}
          </VideoTile>

          <VideoTile label="You" isActive={showMicListening}>
            {userVideoOn ? (
              <UserVideoSurface />
            ) : (
              <UserAvatarSurface
                listening={showMicListening}
                name="You"
              />
            )}
          </VideoTile>
        </div>

        {/* Right column — Caption (tabs) + Hint */}
        <div className="space-y-4">
          <CaptionPanel
            captionText={captionText}
            captionThinking={captionThinking}
            personaName={personaName}
            personaBlurb={personaBlurb}
            personaShort={personaShort}
            scenario={scenario}
            sessionWaiting={!sessionId}
            flowStartByUser={flow?.startBy === "user"}
          />

          {hintsAllowed ? (
            <HintPanel
              hint={currentHint}
              hintType={hints?.type ?? "complete"}
              loading={hintLoading}
              refreshing={hintRefreshing}
              error={hintError}
              exhausted={hintsExhausted}
              onRequest={requestHint}
              disabled={!sessionId || hintLoading || hintsExhausted}
              hintsUsed={hintsUsed}
              hintsLimit={hintsLimited ? hints!.limit : null}
            />
          ) : null}

          {coachHint ? (
            <CoachInline hint={coachHint} loading={coachLoading} />
          ) : null}

          {/* Text composer — voice/avatar modes hide this in favor of the mic */}
          {!voiceMode ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="rounded-[14px] border border-border bg-surface px-4 py-3 flex items-end gap-2"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={
                  sessionId
                    ? `Reply to ${personaShort}… (Enter to send)`
                    : "Waiting for opening…"
                }
                disabled={!sessionId || streaming}
                rows={2}
                className={cn(
                  "flex-1 resize-none bg-surface border border-border-strong rounded-md",
                  "px-3 py-[9px] text-[13px] focus:outline-none focus:border-accent",
                  "disabled:opacity-60",
                )}
                suppressHydrationWarning
              />
              <Button
                variant="accent"
                size="md"
                type="submit"
                disabled={!sessionId || streaming || !input.trim()}
              >
                <Icon name="play" size={12} />
                Send
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      {/* Bottom inline status — turns, rubric link, AI-ends note */}
      <div className="flex items-center justify-center gap-3 text-[11.5px] text-ink-3 font-mono">
        <span>{turnsTaken} {turnsTaken === 1 ? "turn" : "turns"}</span>
        {flow?.endBy === "ai" ? (
          <span title="The persona ends this roleplay — wait for them to wrap up.">
            · AI ends the call
          </span>
        ) : null}
        <ModePill mode={mode} />
      </div>

      {error ? (
        <div className="text-[12px] text-bad font-mono text-center">
          {error}
        </div>
      ) : null}

      {voiceMode && voice.sttError ? (
        <div className="mx-auto max-w-[520px] rounded-md border border-warn/40 bg-warn-pale text-warn px-4 py-3 text-[12.5px] leading-[1.5] text-center">
          <div className="font-semibold mb-0.5">
            Microphone isn&rsquo;t working
          </div>
          <div>{describeSttError(voice.sttError)}</div>
        </div>
      ) : null}

      {/* Time's-almost-up banner. Shown in the last 30s so the trainee
          has visible warning that the session will auto-end at the max
          duration. Suppressed once ending has actually started so it
          doesn't overlap the closing state. */}
      {duration && maxSec > 0 && !ending && !endedFiredRef.current
        ? (() => {
            const remaining = maxSec - elapsedSec;
            if (remaining > 30 || remaining < 0) return null;
            return (
              <div className="mx-auto max-w-[520px] rounded-md border border-warn/50 bg-warn-pale text-warn px-4 py-2.5 text-[12.5px] leading-[1.5] text-center">
                <span className="font-semibold">
                  {remaining <= 0
                    ? "Time's up — wrapping up now…"
                    : `${remaining}s remaining`}
                </span>
                <span className="text-warn/80 ml-2">
                  The session will end automatically and take you to your
                  results.
                </span>
              </div>
            );
          })()
        : null}

      {/* Floating call controls — mic + end-call, centered */}
      <CallControlsBar
        voiceMode={voiceMode}
        voiceState={voice.state}
        voiceSttSupported={voice.sttSupported}
        voiceTtsSupported={voice.ttsSupported}
        streaming={streaming}
        sessionReady={!!sessionId}
        ending={ending}
        autoFlow={autoFlow}
        autoFlowAvailable={Boolean(hintsAllowed) && voice.ttsSupported}
        onToggleAutoFlow={handleToggleAutoFlow}
        onToggleVoice={() => {
          const next = !voiceMode;
          setVoiceMode(next);
          if (!next) {
            voice.cancelSpeech();
            voice.stopListening();
          }
        }}
        onStartListen={voice.startListening}
        onStopListen={voice.stopListening}
        onCommitVoice={voice.commitNow}
        onEnd={handleEndClick}
      />

      {/* Scoring rubric — collapsed under the fold, kept available */}
      {rubric.criteria.length > 0 ? (
        <details className="rounded-[14px] border border-border bg-surface p-4">
          <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3">
            What we&apos;re scoring
          </summary>
          <div className="mt-3 space-y-2">
            {rubric.criteria.map((c, i) => (
              <CoachCard
                key={c.id || c.label || i}
                label={c.label}
                body={c.description}
                weight={c.weight}
                tone={i === 0 ? "tip" : "neutral"}
              />
            ))}
            {rubric.pass_score != null ? (
              <div className="text-[12.5px] text-ink-2 pt-1">
                Aim for{" "}
                <span className="font-semibold text-ink">
                  {rubric.pass_score}+
                </span>{" "}
                across the criteria.
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function derivePersonaRole(persona: string): string {
  const firstSentence = persona.split(/\.\s/)[0] ?? persona;
  const afterComma = firstSentence.split(",").slice(1).join(",").trim();
  if (!afterComma) return "";
  // "CFO at Acme Corp" → "CFO"; "Senior Buyer" → "Senior Buyer"
  const atIdx = afterComma.toLowerCase().indexOf(" at ");
  const role = atIdx >= 0 ? afterComma.slice(0, atIdx) : afterComma;
  return role.length > 40 ? role.slice(0, 40) + "…" : role;
}

// Heuristics for choosing a TTS voice — explicit pronouns win, then
// salutations, then the first name itself (suffix endings are a weak
// signal). Returns null when nothing matches so the hook keeps the
// browser default rather than guessing wrong.
function derivePersonaGender(
  personaName: string,
  personaBlurb: string,
): "female" | "male" | null {
  const blob = `${personaName} ${personaBlurb}`.toLowerCase();

  // Strong signals — explicit pronouns / salutations in the blurb.
  if (
    /\b(she|her|hers|herself|ms\.?|mrs\.?|miss|madam|ma'am)\b/.test(blob)
  ) {
    return "female";
  }
  if (/\b(he|him|his|himself|mr\.?|sir|mister)\b/.test(blob)) {
    return "male";
  }

  // First-name lookup. Lists are intentionally small — only the most
  // common names. Anything we don't recognise falls through to the
  // suffix heuristic and finally to null.
  const firstName = personaName.split(/[\s,]/)[0]?.toLowerCase() ?? "";
  const FEMALE_NAMES = new Set([
    "priya", "neha", "aditi", "ananya", "deepa", "divya", "kavya",
    "lakshmi", "meena", "pooja", "radha", "sneha", "sunita", "swati",
    "veena", "vidya", "anjali", "kiran", "shruti", "rekha", "asha",
    "ritu", "ritika", "sara", "sarah", "emma", "olivia", "sophia",
    "isabella", "ava", "mia", "amelia", "harper", "evelyn", "abigail",
    "emily", "elizabeth", "lily", "grace", "ella", "chloe", "victoria",
    "linda", "susan", "karen", "patricia", "jennifer", "lisa", "nancy",
    "michelle", "amanda", "melissa", "rachel", "jessica", "ashley",
    "stephanie", "rebecca", "laura", "rachel", "anna", "maria", "fatima",
  ]);
  const MALE_NAMES = new Set([
    "ravi", "rohit", "amit", "anil", "arjun", "vikram", "raj", "rajesh",
    "rahul", "rohan", "sanjay", "sandeep", "vinod", "vikash", "deepak",
    "hari", "krishna", "kumar", "manoj", "naveen", "prakash", "ramesh",
    "suresh", "vijay", "abhishek", "marcus", "michael", "david", "john",
    "james", "robert", "william", "thomas", "charles", "joseph", "daniel",
    "matthew", "andrew", "ryan", "kevin", "brian", "scott", "eric",
    "steven", "richard", "anthony", "mark", "paul", "george", "edward",
    "henry", "carlos", "luis", "mohammed", "ahmed", "ali",
  ]);
  if (FEMALE_NAMES.has(firstName)) return "female";
  if (MALE_NAMES.has(firstName)) return "male";

  // Last-resort suffix heuristic — common for Indian female names
  // ("Priya", "Aditi") but very lossy. Only apply when nothing else
  // matched and the name looks long enough to be meaningful.
  if (firstName.length >= 4 && /[aei]$/.test(firstName)) {
    return "female";
  }
  return null;
}

// ─────────────── pane primitives ───────────────

function CoachCard({
  label,
  body,
  weight,
  tone,
}: {
  label: string;
  body: string;
  weight: number;
  tone: "tip" | "alert" | "neutral";
}) {
  const cls =
    tone === "tip"
      ? "bg-good-pale border-[#bfe2cd]"
      : tone === "alert"
        ? "bg-warn-pale border-[#f1d9aa]"
        : "bg-surface border-border";
  const labelCls =
    tone === "tip"
      ? "text-good"
      : tone === "alert"
        ? "text-warn"
        : "text-ink";
  return (
    <div
      className={cn(
        "rounded-sm border p-3",
        cls,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className={cn(
            "flex items-center gap-1.5 text-[12px] font-semibold",
            labelCls,
          )}
        >
          <Icon
            name={tone === "tip" ? "ai-sparkle" : "chart"}
            size={11}
          />
          {label}
        </div>
        {weight > 0 ? (
          <span className="font-mono text-[10.5px] text-ink-3">
            {Math.round(weight * 100)}%
          </span>
        ) : null}
      </div>
      {body ? (
        <div className="text-[12px] text-ink-2 mt-1 leading-[1.45]">
          {body}
        </div>
      ) : null}
    </div>
  );
}

function ModePill({ mode }: { mode: "text" | "voice" | "video" }) {
  const cls =
    mode === "text"
      ? "bg-surface-2 text-ink-2 border-border"
      : mode === "voice"
        ? "bg-accent-pale text-accent-strong border-accent/20"
        : "bg-warn-pale text-warn border-warn/20";
  return (
    <span
      className={cn(
        "text-[10px] font-semibold uppercase tracking-[0.08em] px-[6px] py-[1px] rounded-sm border whitespace-nowrap",
        cls,
      )}
    >
      {mode}
    </span>
  );
}

// ─────────────── Pre-session gate ───────────────
// Renders the Scenario Intro GIF and/or the trainee mode picker before
// we fire /api/roleplay/start. Once the trainee proceeds (and, if
// applicable, picks a mode), the gate dismisses itself and the player
// flows into its normal three-panel layout.

function PreSessionGate({
  moduleName,
  introGif,
  introDismissed,
  onDismissIntro,
  needsModePick,
  availableModes,
  chosenMode,
  onPickMode,
  needsLanguagePick,
  availableLanguages,
  chosenLanguage,
  onPickLanguage,
}: {
  moduleName: string;
  introGif: { name: string; dataUrl: string } | null;
  introDismissed: boolean;
  onDismissIntro: () => void;
  needsModePick: boolean;
  availableModes: PlayerMode[];
  chosenMode: PlayerMode | null;
  onPickMode: (m: PlayerMode) => void;
  needsLanguagePick: boolean;
  availableLanguages: string[];
  chosenLanguage: string | null;
  onPickLanguage: (lang: string) => void;
}) {
  const showIntro = !introDismissed && introGif !== null;
  const showModePick = !showIntro && needsModePick;
  // Language pick comes last so the trainee isn't choosing a language
  // for a mode they haven't picked yet.
  const showLanguagePick = !showIntro && !showModePick && needsLanguagePick;
  return (
    <div className="max-w-[640px] mx-auto py-8">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-3 mb-2">
        Roleplay
      </div>
      <h1 className="font-display text-[26px] leading-tight mb-5 -tracking-[0.01em]">
        {moduleName}
      </h1>

      {showIntro && introGif ? (
        <div className="rounded-[14px] border border-border bg-surface overflow-hidden">
          <div className="px-5 pt-4 pb-2">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
              Scenario brief
            </div>
            <p className="text-[12.5px] text-ink-2 mt-1 leading-[1.5]">
              Watch the scene before you begin — this sets up what you&apos;re
              walking into.
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={introGif.dataUrl}
            alt={introGif.name}
            className="w-full object-cover max-h-[420px] bg-surface-2"
          />
          <div className="flex justify-end px-5 py-3 border-t border-border">
            <Button variant="accent" size="md" onClick={onDismissIntro}>
              {needsModePick || needsLanguagePick ? "Continue" : "Start session"}
              <Icon name="chevron-right" size={12} />
            </Button>
          </div>
        </div>
      ) : null}

      {showModePick ? (
        <div className="rounded-[14px] border border-border bg-surface overflow-hidden">
          <div className="px-5 pt-4 pb-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
              Pick your mode
            </div>
            <p className="text-[12.5px] text-ink-2 mt-1 leading-[1.5]">
              The trainer left this up to you — choose how the conversation
              should run. You can&apos;t change it once the session starts.
            </p>
          </div>
          <div className="px-5 py-3 space-y-2">
            {availableModes.map((m) => {
              const selected = chosenMode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => onPickMode(m)}
                  suppressHydrationWarning
                  className={cn(
                    "w-full text-left rounded-[10px] border p-3 transition-colors",
                    selected
                      ? "border-accent bg-accent-pale/30"
                      : "border-border bg-surface hover:border-accent-pale",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "w-4 h-4 rounded-full border-2 grid place-items-center mt-0.5 shrink-0",
                        selected ? "border-accent" : "border-border-strong",
                      )}
                    >
                      {selected ? (
                        <span className="w-2 h-2 rounded-full bg-accent" />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold text-ink">
                        {MODE_LABELS[m]}
                      </div>
                      <div className="text-[12px] text-ink-3 mt-0.5 leading-[1.5]">
                        {MODE_DESCRIPTIONS[m]}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex justify-end px-5 py-3 border-t border-border">
            <Button
              variant="accent"
              size="md"
              onClick={() => {
                // The "Continue" button is enabled once a mode is chosen;
                // clicking it commits — chosenMode is already in state, so
                // the gate flips closed by re-render.
                if (chosenMode !== null) onPickMode(chosenMode);
              }}
              disabled={chosenMode === null}
            >
              {needsLanguagePick ? "Continue" : "Start session"}
              <Icon name="chevron-right" size={12} />
            </Button>
          </div>
        </div>
      ) : null}

      {showLanguagePick ? (
        <div className="rounded-[14px] border border-border bg-surface overflow-hidden">
          <div className="px-5 pt-4 pb-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
              Pick your language
            </div>
            <p className="text-[12.5px] text-ink-2 mt-1 leading-[1.5]">
              The trainer enabled multiple languages for this scenario. Pick
              the one you want to roleplay in — this is recorded on your
              results.
            </p>
          </div>
          <div className="px-5 py-3 space-y-2">
            {availableLanguages.map((lang) => {
              const selected = chosenLanguage === lang;
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => onPickLanguage(lang)}
                  suppressHydrationWarning
                  className={cn(
                    "w-full text-left rounded-[10px] border p-3 transition-colors flex items-center gap-3",
                    selected
                      ? "border-accent bg-accent-pale/30"
                      : "border-border bg-surface hover:border-accent-pale",
                  )}
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full border-2 grid place-items-center shrink-0",
                      selected ? "border-accent" : "border-border-strong",
                    )}
                  >
                    {selected ? (
                      <span className="w-2 h-2 rounded-full bg-accent" />
                    ) : null}
                  </div>
                  <span className="text-[13.5px] font-semibold text-ink">
                    {lang}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex justify-end px-5 py-3 border-t border-border">
            <Button
              variant="accent"
              size="md"
              onClick={() => {
                if (chosenLanguage !== null) onPickLanguage(chosenLanguage);
              }}
              disabled={chosenLanguage === null}
            >
              Start session
              <Icon name="chevron-right" size={12} />
            </Button>
          </div>
        </div>
      ) : null}

      {!showIntro && !showModePick && !showLanguagePick ? (
        <div className="text-[12.5px] text-ink-3">Loading…</div>
      ) : null}
    </div>
  );
}

// ─────────────── MediaRecorder MIME picker ───────────────
// Chrome / Firefox emit audio/webm; Safari leans on audio/mp4. We
// probe in priority order and fall back to "" (browser default) so
// MediaRecorder doesn't throw on an unsupported mime string.

function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  if (typeof MediaRecorder.isTypeSupported !== "function") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

function fmtMmSs(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

// ─────────────── Mode resolver ───────────────
// Maps the admin's chosen trainee mode to the three flags the existing
// player loop consumes. Falls back to the module-level mode (the
// admin's earlier `roleplayConfig.mode`) when nothing was picked.

function resolvePlayerFlags(
  chosen: PlayerMode | null,
  fallbackMode: "text" | "voice" | "video",
): { voiceMode: boolean; avatarMode: boolean; userVideo: boolean } {
  if (chosen === "video")
    return { voiceMode: true, avatarMode: true, userVideo: true };
  if (chosen === "onlyAiVideo")
    return { voiceMode: true, avatarMode: true, userVideo: false };
  if (chosen === "onlyUserVideo")
    return { voiceMode: true, avatarMode: false, userVideo: true };
  if (chosen === "audio")
    return { voiceMode: true, avatarMode: false, userVideo: false };
  // No mode chosen — preserve the legacy behaviour driven by the
  // module-level mode flag so older modules without additionalSettings
  // keep working.
  return {
    voiceMode: fallbackMode !== "text",
    avatarMode: fallbackMode === "video",
    userVideo: false,
  };
}

// ─────────────── Header bits ───────────────

function TimerPill({
  elapsedSec,
  maxSec,
  maxReached,
}: {
  elapsedSec: number;
  maxSec: number;
  maxReached: boolean;
}) {
  const hasCap = maxSec > 0;
  return (
    <span
      className="inline-flex items-center px-3 py-[5px] rounded-md text-[13px] font-semibold tabular-nums text-white"
      style={{ background: maxReached ? "#c5392f" : "#5b2eea" }}
    >
      {fmtMmSs(elapsedSec)}
      {hasCap ? <span className="opacity-70 mx-1">/</span> : null}
      {hasCap ? <span>{fmtMmSs(maxSec)}</span> : null}
    </span>
  );
}

function TopicPill({
  icon,
  label,
}: {
  icon: "training" | "layers" | "book";
  label: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-[6px] rounded-full border bg-surface text-ink text-[12.5px] font-semibold max-w-[280px]"
      style={{ borderColor: "var(--border-strong)" }}
      title={label}
    >
      <span
        className="w-[18px] h-[18px] rounded-[5px] grid place-items-center shrink-0"
        style={{ background: "#ede7fb", color: "#5b2eea" }}
        aria-hidden
      >
        <Icon name={icon} size={11} />
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}

// ─────────────── Video tile shell ───────────────

function VideoTile({
  label,
  isActive = false,
  cornerAction,
  children,
}: {
  label: string;
  isActive?: boolean;
  cornerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative rounded-[18px] overflow-hidden bg-surface-2",
        "aspect-[4/3]",
        isActive ? "ring-2 ring-offset-0" : "border border-border",
      )}
      style={isActive ? { boxShadow: "0 0 0 2px #5b2eea" } : undefined}
    >
      <div className="absolute inset-0">{children}</div>
      <span
        className="absolute left-3 bottom-3 px-2.5 py-[3px] rounded-md text-[11.5px] font-semibold bg-white/85 text-ink backdrop-blur"
      >
        {label}
      </span>
      {cornerAction ? (
        <div className="absolute right-3 bottom-3">{cornerAction}</div>
      ) : null}
    </div>
  );
}

// ─────────────── Persona / user surfaces ───────────────
// Each tile fills its parent. The persona surface either renders the
// HeyGen avatar <video> or a quiet "audio only" gradient w/ initials
// when the trainee toggles the camera off. The user surface mirrors
// the same shape — getUserMedia preview, or initials placeholder when
// the mode doesn't include the trainee's webcam.

function PersonaVideoSurface({
  attach,
  state,
  error,
  fallbackName,
}: {
  attach: (el: HTMLMediaElement | null) => void;
  state: "idle" | "connecting" | "ready" | "speaking" | "failed";
  error: string | null;
  fallbackName: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playing = state === "ready" || state === "speaking";

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    attach(v);
    return () => attach(null);
  }, [attach]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) v.play().catch(() => {});
  }, [playing]);

  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          "linear-gradient(140deg, #e6e3f9 0%, #d8d4f3 60%, #cdc8ec 100%)",
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={cn(
          "absolute inset-0 w-full h-full object-cover transition-opacity",
          playing ? "opacity-100" : "opacity-0",
        )}
      />
      {!playing ? (
        <div className="absolute inset-0 grid place-items-center text-center px-3">
          {state === "failed" ? (
            <div className="text-[11.5px] text-bad leading-relaxed">
              <div className="font-semibold mb-1">Avatar failed</div>
              <div className="text-[10.5px] font-mono opacity-80">
                {error ?? "Unknown error"}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <PersonaInitialsCircle name={fallbackName} pulse={state === "connecting"} />
              {state === "connecting" || state === "idle" ? (
                <div className="text-[10.5px] font-mono text-ink-3 uppercase tracking-[0.1em]">
                  {state === "connecting"
                    ? "Connecting avatar…"
                    : "Loading…"}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function PersonaAudioSurface({
  speaking,
  name,
  portraitUrl,
}: {
  speaking: boolean;
  name: string;
  portraitUrl?: string | null;
}) {
  // When a real portrait is available, render it as the tile background
  // and overlay a subtle "Speaking…" pill + a glowing ring while the AI
  // is talking. Without lip-sync the ring is what tells the trainee
  // somebody is on the line.
  if (portraitUrl) {
    return (
      <div className="absolute inset-0 overflow-hidden bg-[#1a1f2a]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={portraitUrl}
          alt={name}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div
          className={cn(
            "absolute inset-0 ring-inset ring-4 transition-all duration-300",
            speaking
              ? "ring-[#5b2eea] shadow-[inset_0_0_60px_rgba(91,46,234,0.55)]"
              : "ring-transparent",
          )}
        />
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 pointer-events-none">
          <div className="bg-black/55 text-white text-[10.5px] font-mono uppercase tracking-[0.1em] px-2 py-1 rounded-md backdrop-blur-sm">
            {speaking ? "Speaking…" : "Audio only"}
          </div>
        </div>
      </div>
    );
  }
  // Fallback: original initials gradient. Used when no portrait has
  // been saved for this persona yet, or for non-D-ID providers like
  // HeyGen overrides that don't carry a still image.
  return (
    <div
      className="absolute inset-0 grid place-items-center"
      style={{
        background:
          "linear-gradient(140deg, #efeaff 0%, #ddd5f8 60%, #c8bdef 100%)",
      }}
    >
      <div className="flex flex-col items-center gap-2">
        <PersonaInitialsCircle name={name} pulse={speaking} />
        <div className="text-[11px] font-mono text-ink-2 uppercase tracking-[0.1em]">
          {speaking ? "Speaking…" : "Audio only"}
        </div>
      </div>
    </div>
  );
}

function PersonaInitialsCircle({
  name,
  pulse = false,
}: {
  name: string;
  pulse?: boolean;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      className={cn(
        "w-[88px] h-[88px] rounded-full grid place-items-center text-white font-display text-[28px]",
        pulse ? "animate-pulse" : "",
      )}
      style={{ background: "#5b2eea" }}
    >
      {initials || "P"}
    </div>
  );
}

function UserVideoSurface() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setReady(true);
        }
      } catch (e) {
        setError(
          e instanceof Error && e.name === "NotAllowedError"
            ? "Camera blocked — allow access in your browser."
            : e instanceof Error
              ? e.message
              : "Camera unavailable.",
        );
      }
    })();
    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          "linear-gradient(140deg, #ecebe8 0%, #d8d6d1 60%, #c6c4be 100%)",
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={cn(
          "absolute inset-0 w-full h-full object-cover transition-opacity",
          ready ? "opacity-100" : "opacity-0",
        )}
      />
      {error ? (
        <div className="absolute inset-0 grid place-items-center text-center px-3">
          <div className="text-[11.5px] text-bad leading-relaxed">
            <div className="font-semibold mb-1">Camera off</div>
            <div className="text-[10.5px] font-mono opacity-80">{error}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UserAvatarSurface({
  listening,
  name,
}: {
  listening: boolean;
  name: string;
}) {
  return (
    <div
      className="absolute inset-0 grid place-items-center"
      style={{
        background:
          "linear-gradient(140deg, #f3f2ee 0%, #e4e2dc 60%, #d2cfc7 100%)",
      }}
    >
      <div
        className={cn(
          "w-[88px] h-[88px] rounded-full grid place-items-center text-white font-display text-[28px]",
          listening ? "animate-pulse" : "",
        )}
        style={{ background: "#9a9892" }}
      >
        {name[0]?.toUpperCase() ?? "Y"}
      </div>
    </div>
  );
}

// ─────────────── Caption + Hint panels ───────────────

function CaptionPanel({
  captionText,
  captionThinking,
  personaName,
  personaBlurb,
  personaShort,
  scenario,
  sessionWaiting,
  flowStartByUser,
}: {
  captionText: string;
  captionThinking: boolean;
  personaName: string;
  personaBlurb: string;
  personaShort: string;
  scenario: string;
  sessionWaiting: boolean;
  flowStartByUser: boolean;
}) {
  const [tab, setTab] = useState<"caption" | "scenario">("caption");
  return (
    <div className="rounded-[18px] border border-border bg-surface overflow-hidden">
      <div className="px-5 pt-4">
        <div className="inline-flex p-[3px] rounded-md bg-surface-2">
          <TabBtn active={tab === "caption"} onClick={() => setTab("caption")}>
            Caption
          </TabBtn>
          <TabBtn
            active={tab === "scenario"}
            onClick={() => setTab("scenario")}
          >
            Scenario
          </TabBtn>
        </div>
      </div>
      <div className="px-5 py-4 min-h-[160px]">
        {tab === "caption" ? (
          captionText ? (
            <p className="text-[14.5px] text-ink leading-[1.55] font-medium whitespace-pre-wrap">
              {captionText}
              {captionThinking ? (
                <span className="text-ink-3 font-mono ml-1">…</span>
              ) : null}
            </p>
          ) : (
            <p className="text-[12.5px] text-ink-3 italic">
              {sessionWaiting
                ? `Connecting to ${personaShort}…`
                : flowStartByUser
                  ? `You start — say something to ${personaShort}.`
                  : `Waiting for ${personaShort}…`}
            </p>
          )
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3 mb-1">
                Persona
              </div>
              <div className="text-[13.5px] font-semibold text-ink leading-snug">
                {personaName}
              </div>
              {personaBlurb ? (
                <p className="text-[12.5px] text-ink-2 mt-1 leading-[1.5]">
                  {personaBlurb}
                </p>
              ) : null}
            </div>
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3 mb-1">
                Scenario
              </div>
              <p className="text-[13px] text-ink-2 leading-[1.6] whitespace-pre-wrap">
                {scenario}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      suppressHydrationWarning
      className={cn(
        "px-3.5 py-1.5 rounded-md text-[12.5px] font-semibold transition-colors",
        active ? "text-white" : "text-ink-2 hover:text-ink",
      )}
      style={active ? { background: "#5b2eea" } : undefined}
    >
      {children}
    </button>
  );
}

function HintPanel({
  hint,
  hintType,
  refreshing = false,
  loading,
  error,
  exhausted,
  onRequest,
  disabled,
  hintsUsed,
  hintsLimit,
}: {
  hint: string | null;
  hintType: "complete" | "bullet";
  loading: boolean;
  refreshing?: boolean;
  error: string | null;
  exhausted: boolean;
  onRequest: () => void;
  disabled: boolean;
  hintsUsed: number;
  hintsLimit: number | null;
}) {
  const lines =
    hint && hintType === "bullet"
      ? hint
          .split(/\n+/)
          .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
          .filter(Boolean)
      : null;
  return (
    <div
      className="rounded-[18px] border overflow-hidden"
      style={{
        background: "#fbf3df",
        borderColor: "#f1e2b3",
      }}
    >
      <div className="px-5 pt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-[0.1em] text-white"
            style={{ background: "#5b2eea" }}
          >
            <Icon name="ai-sparkle" size={10} />
            Say this
          </span>
          <span className="text-[11px] text-ink-3">
            Suggested reply you can read aloud
          </span>
          {refreshing && hint ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-ink-3 font-mono uppercase tracking-wider">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#5b2eea] animate-pulse" />
              updating
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {hintsLimit !== null ? (
            <span className="text-[11px] font-mono text-ink-3">
              {hintsUsed} / {hintsLimit}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onRequest}
            disabled={disabled || exhausted}
            suppressHydrationWarning
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-opacity disabled:opacity-60",
              hint
                ? "border border-border bg-surface text-ink-2 hover:text-ink"
                : "text-white",
            )}
            style={hint ? undefined : { background: "#5b2eea" }}
            title={
              exhausted
                ? "You've used all your hints for this attempt."
                : hint
                  ? "Get a fresh suggestion"
                  : "Get the words to say next"
            }
          >
            <Icon name="ai-sparkle" size={11} />
            {loading
              ? "Drafting…"
              : hint
                ? "Try another"
                : "Show me"}
          </button>
        </div>
      </div>
      <div className="px-5 py-4 min-h-[140px]">
        {hint ? (
          lines && lines.length > 0 ? (
            <ul className="space-y-1.5">
              {lines.map((l, i) => (
                <li key={i} className="text-[14px] text-ink leading-[1.55]">
                  <span className="text-[#5b2eea] mr-1.5">•</span>
                  {l}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14.5px] text-ink leading-[1.55] font-medium whitespace-pre-wrap">
              {hint}
            </p>
          )
        ) : (
          <p className="text-[12.5px] text-ink-2 italic">
            {loading
              ? "Drafting the exact words you should say next…"
              : "Your suggested line will appear here in a moment."}
          </p>
        )}
        {error ? (
          <p className="text-[11px] text-bad font-mono break-words mt-2">
            {error}
          </p>
        ) : null}
        {exhausted ? (
          <p className="text-[11px] text-ink-3 italic mt-2">
            You&apos;ve used all your hints for this attempt.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CoachInline({
  hint,
  loading,
}: {
  hint: CoachHint;
  loading: boolean;
}) {
  const isWarn = hint.tone === "warn";
  return (
    <div
      className="rounded-[14px] border px-4 py-3"
      style={{
        background: isWarn
          ? "linear-gradient(135deg, #fef3ec, #fbe7e2)"
          : "linear-gradient(135deg, #f3eafa, #fce8f0)",
        borderColor: isWarn ? "#f1c6b1" : "#e6d2f1",
      }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <div
          className="w-[22px] h-[22px] rounded-[6px] grid place-items-center text-white shrink-0"
          style={{
            background: isWarn
              ? "linear-gradient(135deg, #ea580c, #db2777)"
              : "linear-gradient(135deg, #a855f7, #ec4899)",
          }}
          aria-hidden
        >
          <Icon name="ai-sparkle" size={10} />
        </div>
        <span
          className="text-[10px] font-bold uppercase tracking-[0.1em]"
          style={{ color: isWarn ? "#c2410c" : "#6d4ad9" }}
        >
          {isWarn ? "Heads-up" : "Live coach"}
        </span>
        <span className="ml-auto text-[10px] font-mono text-ink-3">
          turn {hint.turn}
          {loading ? " · refreshing…" : ""}
        </span>
      </div>
      <p className="text-[13px] text-ink leading-[1.5]">{hint.hint}</p>
    </div>
  );
}

// ─────────────── Floating call controls ───────────────
// Bottom-centered round buttons — mic toggle + end-call. Matches the
// "Click to interrupt" treatment in the spec screen. Renders fixed
// so the controls stay reachable while the trainee scrolls through
// the rubric collapsible.

function CallControlsBar({
  voiceMode,
  voiceState,
  voiceSttSupported,
  voiceTtsSupported,
  streaming,
  sessionReady,
  ending,
  autoFlow,
  autoFlowAvailable,
  onToggleAutoFlow,
  onToggleVoice,
  onStartListen,
  onStopListen,
  onCommitVoice,
  onEnd,
}: {
  voiceMode: boolean;
  voiceState: "idle" | "listening" | "speaking";
  voiceSttSupported: boolean;
  voiceTtsSupported: boolean;
  streaming: boolean;
  sessionReady: boolean;
  ending: boolean;
  autoFlow: boolean;
  autoFlowAvailable: boolean;
  onToggleAutoFlow: () => void;
  onToggleVoice: () => void;
  onStartListen: () => void;
  onStopListen: () => void;
  /** Force-commit the current utterance now — overrides the silence
   *  timer so a trainee who knows they're done doesn't have to wait
   *  for auto-detection. */
  onCommitVoice: () => void;
  onEnd: () => void;
}) {
  const voiceAvailable = voiceSttSupported || voiceTtsSupported;
  const listening = voiceMode && voiceState === "listening";
  const tooltip = autoFlow
    ? "Auto-flow on — listening to a model conversation"
    : !voiceMode
      ? "Turn on voice"
      : listening
        ? "Click to interrupt"
        : streaming
          ? "Persona is replying…"
          : "Tap to talk";

  function handleMicClick() {
    if (!voiceAvailable) return;
    if (!voiceMode) {
      onToggleVoice();
      return;
    }
    if (listening) {
      onStopListen();
    } else if (!streaming && sessionReady && voiceSttSupported) {
      onStartListen();
    }
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2">
      <span
        className="px-2.5 py-1 rounded-md text-[11.5px] text-white"
        style={{ background: "#1a1a1a" }}
      >
        {tooltip}
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleAutoFlow}
          disabled={!autoFlowAvailable}
          suppressHydrationWarning
          aria-pressed={autoFlow}
          aria-label={autoFlow ? "Stop auto-flow" : "Start auto-flow"}
          title={
            autoFlowAvailable
              ? autoFlow
                ? "Pause the demo conversation"
                : "Let the AI run a model conversation — both sides spoken aloud"
              : "Auto-flow needs hints enabled and TTS support"
          }
          className="inline-flex items-center gap-1.5 h-[36px] px-3 rounded-full text-[11.5px] font-semibold text-white shadow-md disabled:opacity-60"
          style={{
            background: autoFlow ? "#2a7d4f" : "#1a1a1a",
          }}
        >
          <Icon name="ai-sparkle" size={11} />
          {autoFlow ? "Auto on" : "Auto-flow"}
        </button>
        <button
          type="button"
          onClick={handleMicClick}
          disabled={!voiceAvailable || autoFlow}
          suppressHydrationWarning
          aria-label={listening ? "Mute mic" : "Unmute mic"}
          className="w-[52px] h-[52px] rounded-full grid place-items-center text-white shadow-md disabled:opacity-60"
          style={{
            background: listening ? "#c5392f" : "#5b2eea",
          }}
        >
          <Icon name="mic" size={18} />
        </button>
        {/* "Send now" — appears only while the mic is listening, gives
            the trainee explicit control to commit their utterance
            immediately instead of waiting for the adaptive silence
            timer. Solves the "AI cut me off mid-sentence" problem on
            long thoughts by letting the trainee signal "I'm done"
            when they know they are. Hidden in auto-flow (the mic is
            driven by the orchestrator, not the trainee). */}
        {listening && !autoFlow ? (
          <button
            type="button"
            onClick={onCommitVoice}
            suppressHydrationWarning
            aria-label="Send now"
            title="Send what you've said — skip the silence-detect wait"
            className="inline-flex items-center h-[36px] px-3.5 rounded-full text-[11.5px] font-semibold text-white shadow-md"
            style={{ background: "#2a7d4f" }}
          >
            Send now
          </button>
        ) : null}
        <button
          type="button"
          onClick={onEnd}
          disabled={!sessionReady || ending}
          suppressHydrationWarning
          aria-label="End call"
          className="w-[52px] h-[52px] rounded-full grid place-items-center text-white shadow-md disabled:opacity-60"
          style={{ background: "#c5392f" }}
          title="End the roleplay"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: "rotate(135deg)" }}
            aria-hidden
          >
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2.03z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Full-screen "Get ready · 3 · 2 · 1 · Go" overlay rendered while the
// /api/roleplay/start request is in flight. Gives the trainee a
// visible signal that the session is spinning up and buys the greeting
// generation ~3 seconds of latency-hiding.
function StartingCountdown({ value }: { value: number }) {
  const label = value <= 0 ? "Go" : String(value);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center backdrop-blur-sm"
      style={{ background: "rgba(15, 12, 30, 0.72)" }}
      aria-live="polite"
      aria-label="Roleplay starting"
    >
      <div className="flex flex-col items-center gap-3 text-white">
        <div className="text-[13px] font-semibold uppercase tracking-[0.16em] opacity-80">
          Your roleplay is starting
        </div>
        <div
          key={label}
          className="font-display leading-none tabular-nums animate-pulse"
          style={{ fontSize: "128px" }}
        >
          {label}
        </div>
        <div className="text-[12.5px] opacity-70">Get ready…</div>
      </div>
    </div>
  );
}

// Race a promise against a hard timeout. Used to cap the time any
// single TTS call can wedge the voice loop. If the timeout wins the
// promise settles anyway (fire-and-forget); we just move on so the
// mic reopen doesn't wait forever on a stuck upstream.
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Split a paragraph into discrete sentences ending in .!?…  D-ID
// processes each speak() independently, so pushing one sentence at a
// time lets it start lip-syncing the first one while later sentences
// are still being generated upstream. Sentences without terminal
// punctuation (typically the trailing tail of a still-streaming
// bubble) are not returned — they'll be flushed by flushFinalSpeak.
function splitCompleteSentences(text: string): string[] {
  const matches = text.match(/[^.!?…\n]+[.!?…]+(?=\s|$)/g);
  return matches ? matches.map((s) => s.trim()).filter(Boolean) : [];
}

// Turn the classified STT error into a plain-English tip the trainee
// can act on. Covers the four buckets useElevenLabsSTT emits:
// permission_denied / no_device / in_use / unsupported / unknown.
function describeSttError(err: SttError): string {
  switch (err) {
    case "permission_denied":
      return "Your browser blocked microphone access. Click the mic icon in the address bar, allow this site to use the microphone, then try again — or type your reply below.";
    case "no_device":
      return "No microphone was found. Plug one in (or check your system audio settings), reload the page, and try again — or type your reply below.";
    case "in_use":
      return "Another app is using your microphone. Close it (Zoom, Meet, Teams, etc.), reload the page, and try again — or type your reply below.";
    case "unsupported":
      return "This browser can't capture voice. Try Chrome, Edge, or Safari — or just type your reply below.";
    case "transcribe_failed":
      return "Voice input is temporarily unavailable — the speech service didn't respond. Type your reply below and continue. (If this persists, the ElevenLabs API key on the server may need to be checked.)";
    case "unknown":
    default:
      return "We couldn't open your microphone. Reload the page and try again — or type your reply below.";
  }
}
