// Tier-1 conversation analytics for the Roleplay Results page.
//
// Pure functions over a transcript array — no DB hits, no AI calls.
// Everything in this file is derived from what's already persisted
// in roleplay_sessions.transcript jsonb, so adding these to the page
// costs nothing at runtime.
//
// All counts only consider the LEARNER's turns (the persona is Claude
// playing a character; grading their vocabulary or filler-word use is
// not useful). Talk-time is the only ratio that needs both sides.

import type { TranscriptTurn } from "@/lib/ai/roleplay";

export type ConversationStats = {
  /** Total turns the learner contributed. */
  learnerTurns: number;
  /** Total turns the persona contributed. */
  personaTurns: number;
  /** Learner words ÷ total words, 0–100. Healthy sales range ≈ 40–60. */
  talkTimePct: number;
  /** Total learner words across all of their turns. */
  learnerWordCount: number;
  /** Average words per learner turn (rounded). */
  avgLearnerTurnWords: number;
  /** Average seconds the learner took to reply after a persona turn.
   *  null when we can't compute (fewer than two valid timestamps). */
  avgResponseSec: number | null;
  /** Open-ended questions the learner asked (rough heuristic). */
  questionCount: number;
  /** Filler tokens like "um", "uh", "like", "you know". */
  fillerWordCount: number;
  /** Empathy / politeness markers ("thank you", "I understand", "please"). */
  empathyMarkerCount: number;
  /** Unique words ÷ total words, 0–100. Higher = richer vocabulary. */
  vocabularyRichnessPct: number;
};

// Match a sequence of word chars + apostrophes (so "don't" stays one token).
const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}']*/gu;

const FILLER_PHRASES = [
  "um",
  "uh",
  "uhh",
  "err",
  "hmm",
  "like",
  "you know",
  "i mean",
  "basically",
  "literally",
  "actually",
  "sort of",
  "kind of",
];

const EMPATHY_MARKERS = [
  "thank you",
  "thanks",
  "please",
  "i understand",
  "i hear you",
  "that makes sense",
  "i appreciate",
  "i see",
  "got it",
  "absolutely",
  "of course",
  "no problem",
  "happy to help",
  "i'm sorry",
  "sorry to hear",
];

function tokenize(text: string): string[] {
  return text.toLowerCase().match(WORD_RE) ?? [];
}

function countPhraseOccurrences(haystack: string, phrases: string[]): number {
  let total = 0;
  for (const phrase of phrases) {
    // Word-bounded so "like" doesn't match "likely".
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$1");
    const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:[^\\p{L}\\p{N}]|$)`, "giu");
    const matches = haystack.match(re);
    if (matches) total += matches.length;
  }
  return total;
}

function countQuestions(text: string): number {
  // One question per "?" — collapses runs ("???") into a single ask.
  const matches = text.match(/\?+/g);
  return matches ? matches.length : 0;
}

export function computeConversationStats(
  transcript: TranscriptTurn[],
): ConversationStats {
  const learnerTurns = transcript.filter((t) => t.role === "learner");
  const personaTurns = transcript.filter((t) => t.role === "persona");

  const learnerText = learnerTurns.map((t) => t.content).join("\n");
  const personaText = personaTurns.map((t) => t.content).join("\n");
  const learnerLower = learnerText.toLowerCase();

  const learnerWords = tokenize(learnerText);
  const personaWords = tokenize(personaText);

  const totalWords = learnerWords.length + personaWords.length;
  const talkTimePct =
    totalWords === 0
      ? 0
      : Math.round((learnerWords.length / totalWords) * 100);

  const avgLearnerTurnWords =
    learnerTurns.length === 0
      ? 0
      : Math.round(learnerWords.length / learnerTurns.length);

  // Response latency: for each learner turn that follows a persona turn,
  // measure the gap between their timestamps. Falls back to null when we
  // don't have enough valid timestamps to average.
  const latencies: number[] = [];
  for (let i = 1; i < transcript.length; i++) {
    const prev = transcript[i - 1];
    const curr = transcript[i];
    if (prev.role !== "persona" || curr.role !== "learner") continue;
    const a = Date.parse(prev.ts);
    const b = Date.parse(curr.ts);
    if (Number.isNaN(a) || Number.isNaN(b) || b < a) continue;
    const gapSec = (b - a) / 1000;
    // Drop unrealistic outliers — anything beyond 10 minutes is almost
    // certainly the learner walking away, not a genuine "thinking" gap.
    if (gapSec > 600) continue;
    latencies.push(gapSec);
  }
  const avgResponseSec =
    latencies.length === 0
      ? null
      : Math.round(
          (latencies.reduce((acc, n) => acc + n, 0) / latencies.length) * 10,
        ) / 10;

  const uniqueLearnerWords = new Set(learnerWords).size;
  const vocabularyRichnessPct =
    learnerWords.length === 0
      ? 0
      : Math.round((uniqueLearnerWords / learnerWords.length) * 100);

  return {
    learnerTurns: learnerTurns.length,
    personaTurns: personaTurns.length,
    talkTimePct,
    learnerWordCount: learnerWords.length,
    avgLearnerTurnWords,
    avgResponseSec,
    questionCount: countQuestions(learnerText),
    fillerWordCount: countPhraseOccurrences(learnerLower, FILLER_PHRASES),
    empathyMarkerCount: countPhraseOccurrences(learnerLower, EMPATHY_MARKERS),
    vocabularyRichnessPct,
  };
}
