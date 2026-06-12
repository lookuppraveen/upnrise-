// Data helpers for the trainee Roleplay Results page.
//
// Three things this page needs that don't fit on the RoleplaySession row:
//   1. The learner's prior attempts of the same module — drives the
//      Progress History chart (overall + per-rubric trends).
//   2. How many of the admin's keywords surfaced in the transcript —
//      drives the Coverage of Keywords card.
//   3. How many times the trainee hit the Hint button — drives the
//      "HINT USED" badge on the page header.
//
// All queries are tenant-scoped through the caller (the page already
// loads the session via loadSessionForUser, which enforces tenant scope).

import { prisma } from "@/lib/db/client";
import type { TranscriptTurn } from "@/lib/ai/roleplay";

export type AttemptHistoryEntry = {
  sessionId: string;
  startedAt: Date;
  durationSec: number | null;
  score: number | null;
  rubricScores: Record<string, number>;
  /** True when the auto-fail "below minimum duration" path fired on this
   *  attempt. Detected client-side as score=0, no rubric scores, and a
   *  duration under whatever minDurationMin the module had at the time.
   *  Used to filter junk runs out of the Progress History trend. */
  autoFailed: boolean;
};

/**
 * Returns ALL completed roleplay attempts the user has made of this
 * module, oldest → newest, including the session the user is currently
 * viewing. Used to draw the Progress History line chart on the results
 * page.
 */
export async function getAttemptHistory(
  userId: string,
  moduleId: string,
  /** Minimum duration in minutes that the module enforces. Used to
   *  classify historical attempts as auto-failed without storing a
   *  separate flag column. Passing 0 disables the classification. */
  minDurationMin = 0,
): Promise<AttemptHistoryEntry[]> {
  const rows = await prisma.roleplaySession.findMany({
    where: { userId, moduleId, endedAt: { not: null } },
    orderBy: { startedAt: "asc" },
    select: {
      id: true,
      startedAt: true,
      durationSec: true,
      score: true,
      rubricScores: true,
    },
  });
  const minSec = minDurationMin * 60;
  return rows.map((r) => {
    const rubric = (r.rubricScores as Record<string, number> | null) ?? {};
    const autoFailed =
      r.score === 0 &&
      Object.keys(rubric).length === 0 &&
      minSec > 0 &&
      (r.durationSec ?? 0) < minSec;
    return {
      sessionId: r.id,
      startedAt: r.startedAt,
      durationSec: r.durationSec,
      score: r.score,
      rubricScores: rubric,
      autoFailed,
    };
  });
}

export type KeywordCoverageEntry = {
  keyword: string;
  hit: boolean;
};

export type KeywordCoverage = {
  entries: KeywordCoverageEntry[];
  hitCount: number;
  total: number;
  /** 0–100. 0 when there are no keywords configured. */
  percent: number;
};

/**
 * Tally which admin-configured keywords appear in the LEARNER's turns
 * of the transcript. Match is case-insensitive substring — the same
 * loose match the admin would expect when they type "discovery" and
 * the trainee says "discovery call".
 *
 * We only scan learner turns: a keyword the AI persona uses doesn't
 * count as the learner "covering" it. If keywords is empty, the
 * coverage card hides itself based on `total === 0`.
 */
export function computeKeywordCoverage(
  transcript: TranscriptTurn[],
  keywords: string[],
): KeywordCoverage {
  const clean = keywords
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  if (clean.length === 0) {
    return { entries: [], hitCount: 0, total: 0, percent: 0 };
  }
  const haystack = transcript
    .filter((t) => t.role === "learner")
    .map((t) => t.content.toLowerCase())
    .join("\n");
  const entries: KeywordCoverageEntry[] = clean.map((kw) => ({
    keyword: kw,
    hit: haystack.includes(kw.toLowerCase()),
  }));
  const hitCount = entries.filter((e) => e.hit).length;
  return {
    entries,
    hitCount,
    total: clean.length,
    percent: Math.round((hitCount / clean.length) * 100),
  };
}

/**
 * Count Feedback rows tagged source="hint" against this session. The
 * /api/roleplay/hint route writes one row per hint pull. Returns 0
 * if hints were never used (or if the session pre-dates the hint
 * persistence).
 */
export async function countHintsUsed(sessionId: string): Promise<number> {
  return prisma.feedback.count({
    where: { sessionId, source: "hint" },
  });
}

export type AttemptStats = {
  attemptNumber: number;
  improvementPct: number | null;
};

/**
 * Where this attempt sits in the user's history, plus the % delta vs
 * the previous attempt. `improvementPct` is null on the first attempt
 * (no prior to compare against). When `prior === 0` we cap improvement
 * at +100% so the chart doesn't show Infinity.
 */
export function computeAttemptStats(
  history: AttemptHistoryEntry[],
  currentSessionId: string,
): AttemptStats {
  const idx = history.findIndex((h) => h.sessionId === currentSessionId);
  if (idx <= 0) {
    return { attemptNumber: idx + 1 || history.length || 1, improvementPct: null };
  }
  const cur = history[idx].score;
  // Improvement is only meaningful against a real prior attempt. Walk
  // backwards past auto-failed runs so an 18-second junk attempt doesn't
  // make every subsequent run look like a 100% improvement.
  let prev: number | null = null;
  for (let i = idx - 1; i >= 0; i--) {
    if (!history[i].autoFailed && history[i].score != null) {
      prev = history[i].score;
      break;
    }
  }
  if (cur == null || prev == null) {
    return { attemptNumber: idx + 1, improvementPct: null };
  }
  if (prev === 0) {
    return { attemptNumber: idx + 1, improvementPct: cur > 0 ? 100 : 0 };
  }
  return {
    attemptNumber: idx + 1,
    improvementPct: Math.round(((cur - prev) / prev) * 100),
  };
}
