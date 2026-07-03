// Speech Delivery metrics for the Roleplay Results page.
//
// Pure functions over the transcript + session duration — no DB hits,
// no AI calls. All numbers describe the LEARNER only (the persona is
// Claude playing a character; their pace/fillers aren't useful to grade).

import type { TranscriptTurn } from "@/lib/ai/roleplay";

export type SpeechDeliveryStats = {
  /** Estimated words-per-minute for the learner. null when session is too short to trust. */
  paceWpm: number | null;
  /** Human-readable bucket for paceWpm. */
  paceLabel: "slow" | "comfortable" | "fast" | "rushed" | "unknown";
  /** Total filler tokens ("um", "uh", "like", "basically", ...). */
  fillerWordCount: number;
  /** Fillers per 100 learner words (2dp). Handy for classification. */
  fillerRatioPer100: number;
  /** Sentences the learner spoke, split on [.!?]. */
  sentenceCount: number;
  /** Mean words per learner sentence, rounded. */
  avgSentenceWords: number;
};

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}']*/gu;

// Kept in sync with FILLER_PHRASES in conversation-stats.ts. Duplicated
// on purpose so this module has no cross-dependency.
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

function tokenize(text: string): string[] {
  return text.toLowerCase().match(WORD_RE) ?? [];
}

function countPhraseOccurrences(haystack: string, phrases: string[]): number {
  let total = 0;
  for (const phrase of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$1");
    const re = new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${escaped}(?:[^\\p{L}\\p{N}]|$)`,
      "giu",
    );
    const matches = haystack.match(re);
    if (matches) total += matches.length;
  }
  return total;
}

function classifyPace(wpm: number): SpeechDeliveryStats["paceLabel"] {
  if (wpm < 110) return "slow";
  if (wpm <= 160) return "comfortable";
  if (wpm <= 190) return "fast";
  return "rushed";
}

export function computeSpeechDelivery(
  transcript: TranscriptTurn[],
  durationSec: number | null,
): SpeechDeliveryStats {
  const learnerText = transcript
    .filter((t) => t.role === "learner")
    .map((t) => t.content)
    .join(" ");
  const learnerLower = learnerText.toLowerCase();
  const learnerWords = tokenize(learnerText);

  // Split on sentence terminators. Runs like "!!!" collapse to one break.
  // Drop tokens with no word chars (stray whitespace / punctuation).
  const sentences = learnerText
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => WORD_RE.test(s));
  const sentenceCount = sentences.length;
  const avgSentenceWords =
    sentenceCount === 0
      ? 0
      : Math.round(
          sentences.reduce((acc, s) => acc + tokenize(s).length, 0) /
            sentenceCount,
        );

  const fillerWordCount = countPhraseOccurrences(learnerLower, FILLER_PHRASES);
  const fillerRatioPer100 =
    learnerWords.length === 0
      ? 0
      : Math.round((fillerWordCount / learnerWords.length) * 100 * 100) / 100;

  // Pace: we don't track per-speaker speaking time, so estimate the
  // learner's share of speaking seconds from their share of turns.
  // Skip when the session is under 30s or has no learner turns — the
  // ratio is too unstable to report.
  const learnerTurns = transcript.filter((t) => t.role === "learner").length;
  const totalTurns = transcript.length || 1;
  let paceWpm: number | null = null;
  let paceLabel: SpeechDeliveryStats["paceLabel"] = "unknown";
  if (durationSec && durationSec >= 30 && learnerTurns > 0) {
    const estLearnerSec = Math.max(
      1,
      Math.round(durationSec * (learnerTurns / totalTurns)),
    );
    paceWpm = Math.round(learnerWords.length / (estLearnerSec / 60));
    paceLabel = classifyPace(paceWpm);
  }

  return {
    paceWpm,
    paceLabel,
    fillerWordCount,
    fillerRatioPer100,
    sentenceCount,
    avgSentenceWords,
  };
}
