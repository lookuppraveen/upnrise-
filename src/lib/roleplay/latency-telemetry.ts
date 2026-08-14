// Client-side latency telemetry singleton.
//
// Callers anywhere in the roleplay tree push a TimingEntry via pushTiming();
// LatencyDebugPill subscribes and re-renders. This intentionally lives
// outside React state so hooks buried in useVoiceMode / useElevenLabsTTS
// can push without prop-drilling a callback down through every layer.
//
// Kept dev-only in effect: LatencyDebugPill only mounts when
// NEXT_PUBLIC_LATENCY_DEBUG=1 or NODE_ENV=development. In production
// pushTiming still runs but nothing renders — cost is ~1 array push per
// turn, negligible.

export type TimingKind = "start" | "stt" | "turn" | "tts" | "adapt";

export type TimingEntry = {
  turn: number; // 0 for opening, 1+ for user turns
  kind: TimingKind;
  /** Total time this piece added to the perceived latency. */
  totalMs: number;
  /** Server-reported handler time from X-Handler-Ms (if any). */
  serverMs?: number;
  /** Time to first byte from the streaming response (turn / tts). */
  ttfbMs?: number;
  at: number; // epoch ms
};

const MAX_ENTRIES = 30;
const entries: TimingEntry[] = [];
const subscribers = new Set<(entries: TimingEntry[]) => void>();

let currentTurn = 0;

/** Advance the turn counter — call at the top of every user-initiated turn. */
export function bumpTurn(): number {
  currentTurn += 1;
  return currentTurn;
}

/** Read the current turn counter without bumping. */
export function getTurn(): number {
  return currentTurn;
}

/** Reset — used when a new session starts in the same tab. */
export function resetTelemetry() {
  entries.length = 0;
  currentTurn = 0;
  for (const s of subscribers) s(entries.slice());
}

export function pushTiming(e: Omit<TimingEntry, "at">) {
  entries.push({ ...e, at: Date.now() });
  if (entries.length > MAX_ENTRIES) entries.shift();
  for (const s of subscribers) s(entries.slice());
}

export function subscribe(cb: (entries: TimingEntry[]) => void): () => void {
  subscribers.add(cb);
  cb(entries.slice());
  return () => {
    subscribers.delete(cb);
  };
}

export function getEntries(): TimingEntry[] {
  return entries.slice();
}

/** True when the debug pill should render. Called by the mount site. */
export function isDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV === "development") return true;
  return process.env.NEXT_PUBLIC_LATENCY_DEBUG === "1";
}
