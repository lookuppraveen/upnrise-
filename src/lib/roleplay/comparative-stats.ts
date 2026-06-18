// Tier-3 comparative analytics for the Roleplay Results page.
//
// Pulls peer + personal benchmarks so the trainee can see how their
// score sits in context, not just as a number in isolation. Each
// metric is independently nullable — if there aren't enough peers
// (or attempts) to compute it, we return null and the card hides
// that row rather than showing a misleading "0".
//
// All queries scope to the trainee's own tenant via companyId. Auto-
// failed sessions (score=0 with no rubric scores) are excluded from
// every aggregation so a 12-second junk attempt doesn't drag down
// the module average.

import { prisma } from "@/lib/db/client";

export type TrendDirection = "improving" | "flat" | "declining";

export type ComparativeStats = {
  /** Average overall score across all peers in the same tenant who
   *  completed this module. null when no other completions exist. */
  moduleAvgScore: number | null;
  /** How many distinct peers (including the trainee) have completed
   *  this module. Used to label the average ("avg of 14 learners"). */
  modulePeerCount: number;
  /** Percentile rank of the trainee's current score against peers
   *  who completed the same module. 0–100, null when no peers. */
  modulePercentile: number | null;
  /** Trainee's best score ever on this module (across all of their
   *  attempts, including the current one). null when never scored. */
  personalBest: number | null;
  /** Whether the current attempt IS the new personal best. */
  isPersonalBest: boolean;
  /** Simple slope across the last 5 non-auto-failed attempts.
   *  null when fewer than two scored attempts exist. */
  trend: TrendDirection | null;
  /** The same slope as a signed integer (avg score delta per attempt),
   *  rounded — used to caption the trend chip ("+4 / attempt"). */
  trendSlope: number | null;
};

type HistoryLite = {
  score: number | null;
  startedAt: Date;
  durationSec: number | null;
  rubricScores: unknown;
};

function isAutoFailed(s: HistoryLite, minDurationMin: number): boolean {
  const rubric = (s.rubricScores as Record<string, number> | null) ?? {};
  const minSec = minDurationMin * 60;
  return (
    s.score === 0 &&
    Object.keys(rubric).length === 0 &&
    minSec > 0 &&
    (s.durationSec ?? 0) < minSec
  );
}

/**
 * Linear least-squares slope over the last `take` scored attempts.
 * Returns the average score delta per attempt step. Positive ⇒
 * improving, negative ⇒ declining, ~0 ⇒ flat. null when fewer than
 * two points to fit a line through.
 */
function fitTrendSlope(
  scores: number[],
  take = 5,
): { slope: number; dir: TrendDirection } | null {
  const window = scores.slice(-take);
  if (window.length < 2) return null;
  const n = window.length;
  const xs = window.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = window.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (window[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  // ±2 points/attempt is the noise floor — anything inside reads as flat.
  const dir: TrendDirection =
    slope > 2 ? "improving" : slope < -2 ? "declining" : "flat";
  return { slope, dir };
}

export async function getComparativeStats(opts: {
  companyId: string;
  userId: string;
  moduleId: string;
  /** The score from THIS session. Used for personal-best and percentile
   *  comparisons. null when the session wasn't scored (rare). */
  currentScore: number | null;
  /** Min duration the module enforces — needed to classify auto-fails
   *  in the trainee's own history. Pass 0 when failBelowMinDuration is off. */
  minDurationMin: number;
}): Promise<ComparativeStats> {
  const { companyId, userId, moduleId, currentScore, minDurationMin } = opts;

  // ── Peer pool: every other user in the tenant who's completed this
  // module. We take only their best score per user so an unusually
  // active peer can't dominate the average.
  const peerRows = await prisma.roleplaySession.findMany({
    where: {
      moduleId,
      endedAt: { not: null },
      score: { not: null },
      user: { companyId },
      NOT: { userId },
    },
    select: {
      userId: true,
      score: true,
      durationSec: true,
      rubricScores: true,
      startedAt: true,
    },
  });

  // Collapse to one row per peer = their best non-auto-failed score.
  const bestByPeer = new Map<string, number>();
  for (const r of peerRows) {
    if (isAutoFailed(r, minDurationMin)) continue;
    const s = r.score ?? 0;
    const prev = bestByPeer.get(r.userId) ?? -1;
    if (s > prev) bestByPeer.set(r.userId, s);
  }

  const peerBests = Array.from(bestByPeer.values());
  const moduleAvgScore =
    peerBests.length === 0
      ? null
      : Math.round(
          peerBests.reduce((acc, n) => acc + n, 0) / peerBests.length,
        );

  // Trainee is part of the pool size but their score is compared
  // against peer scores only (their own attempts are noise here).
  const modulePeerCount = peerBests.length + 1;

  let modulePercentile: number | null = null;
  if (currentScore != null && peerBests.length > 0) {
    const below = peerBests.filter((s) => s < currentScore).length;
    const equal = peerBests.filter((s) => s === currentScore).length;
    // Standard "percent of peers you beat or tied half of".
    modulePercentile = Math.round(
      ((below + 0.5 * equal) / peerBests.length) * 100,
    );
  }

  // ── Trainee's own history of this module.
  const myRows = await prisma.roleplaySession.findMany({
    where: { userId, moduleId, endedAt: { not: null } },
    orderBy: { startedAt: "asc" },
    select: {
      score: true,
      startedAt: true,
      durationSec: true,
      rubricScores: true,
    },
  });
  const myScored = myRows
    .filter((r) => !isAutoFailed(r, minDurationMin) && r.score != null)
    .map((r) => r.score as number);

  const personalBest = myScored.length === 0 ? null : Math.max(...myScored);
  const isPersonalBest =
    currentScore != null && personalBest != null && currentScore >= personalBest;

  const trendFit = fitTrendSlope(myScored, 5);

  return {
    moduleAvgScore,
    modulePeerCount,
    modulePercentile,
    personalBest,
    isPersonalBest,
    trend: trendFit?.dir ?? null,
    trendSlope: trendFit ? Math.round(trendFit.slope) : null,
  };
}
