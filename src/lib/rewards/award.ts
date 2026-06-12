// Rewards runtime — awards points to a trainee when a real event matches
// an enabled RewardRule for their tenant. The (userId, action, sourceKind,
// sourceId) unique index on RewardEarning makes every call idempotent:
// invoking award() twice for the same trigger no-ops on the second call.
//
// Triggers wired today (called from /api/roleplay/end):
//   - first_session     once, on the user's very first scored session
//   - score_above_80    once per session that scored 80–89
//   - score_above_90    once per session that scored 90+
//   - complete_module   once per module, on first session in that module
//   - complete_training once per training, when every module has at least
//                       one completed session for the user
//   - streak_5_days     once per "streak window" of 5 consecutive calendar
//                       days with at least one completed session
//
// award() returns the number of points granted (0 if no rule, rule
// disabled, or already awarded). awardForSession() is a convenience that
// runs every roleplay-related trigger in one go.

import { Prisma, type RewardAction } from "@prisma/client";
import { prisma } from "@/lib/db/client";

export type SourceKind = "session" | "module" | "training" | "streak";

export type AwardArgs = {
  userId: string;
  companyId: string;
  action: RewardAction;
  sourceKind: SourceKind;
  sourceId: string;
};

/** Returns points awarded (0 if no rule / disabled / already awarded). */
export async function award(args: AwardArgs): Promise<number> {
  const rule = await prisma.rewardRule.findUnique({
    where: {
      companyId_action: {
        companyId: args.companyId,
        action: args.action,
      },
    },
  });
  if (!rule || !rule.enabled || rule.points <= 0) return 0;

  try {
    await prisma.rewardEarning.create({
      data: {
        userId: args.userId,
        companyId: args.companyId,
        action: args.action,
        points: rule.points,
        sourceKind: args.sourceKind,
        sourceId: args.sourceId,
      },
    });
    return rule.points;
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      // Unique constraint hit → already awarded → no-op.
      return 0;
    }
    throw e;
  }
}

/**
 * Run every roleplay-end-time trigger for a freshly scored session.
 * Caller passes `score` so we don't re-query it. Returns the total points
 * granted across all triggers (useful for UI flash messaging).
 */
export async function awardForSession(input: {
  userId: string;
  companyId: string;
  sessionId: string;
  moduleId: string;
  trainingId: string;
  score: number;
}): Promise<number> {
  let total = 0;

  // 1. Score-band rules — both 80 and 90 can fire on a 90+ session.
  if (input.score >= 80) {
    total += await award({
      userId: input.userId,
      companyId: input.companyId,
      action: "score_above_80",
      sourceKind: "session",
      sourceId: input.sessionId,
    });
  }
  if (input.score >= 90) {
    total += await award({
      userId: input.userId,
      companyId: input.companyId,
      action: "score_above_90",
      sourceKind: "session",
      sourceId: input.sessionId,
    });
  }

  // 2. first_session — only fires if this is the user's first completed
  //    session ever. We use the session row itself as the source so the
  //    award is naturally one-shot.
  const completedCount = await prisma.roleplaySession.count({
    where: { userId: input.userId, endedAt: { not: null } },
  });
  if (completedCount === 1) {
    total += await award({
      userId: input.userId,
      companyId: input.companyId,
      action: "first_session",
      sourceKind: "session",
      sourceId: input.sessionId,
    });
  }

  // 3. complete_module — first completed session in this module.
  const modCompletedCount = await prisma.roleplaySession.count({
    where: {
      userId: input.userId,
      moduleId: input.moduleId,
      endedAt: { not: null },
    },
  });
  if (modCompletedCount === 1) {
    total += await award({
      userId: input.userId,
      companyId: input.companyId,
      action: "complete_module",
      sourceKind: "module",
      sourceId: input.moduleId,
    });
  }

  // 4. complete_training — every published module in the training has at
  //    least one completed session by this user.
  total += await maybeAwardTrainingComplete({
    userId: input.userId,
    companyId: input.companyId,
    trainingId: input.trainingId,
  });

  // 5. streak_5_days — 5 consecutive calendar days with ≥1 session.
  total += await maybeAwardStreak({
    userId: input.userId,
    companyId: input.companyId,
  });

  return total;
}

/** Check training completion and award once. Public so other paths
 *  (e.g. quiz/video completion when those land) can also trigger it. */
export async function maybeAwardTrainingComplete(input: {
  userId: string;
  companyId: string;
  trainingId: string;
}): Promise<number> {
  const modules = await prisma.trainingModule.findMany({
    where: { trainingId: input.trainingId, published: true },
    select: { id: true },
  });
  if (modules.length === 0) return 0;

  const completedModuleCount = await prisma.roleplaySession.findMany({
    where: {
      userId: input.userId,
      moduleId: { in: modules.map((m) => m.id) },
      endedAt: { not: null },
    },
    distinct: ["moduleId"],
    select: { moduleId: true },
  });
  if (completedModuleCount.length < modules.length) return 0;

  return award({
    userId: input.userId,
    companyId: input.companyId,
    action: "complete_training",
    sourceKind: "training",
    sourceId: input.trainingId,
  });
}

/**
 * Award `streak_5_days` if the user has just closed a 5-consecutive-day
 * window today. The sourceId is the ISO date of the last day in the
 * window (yyyy-mm-dd), so each completed streak earns once.
 */
export async function maybeAwardStreak(input: {
  userId: string;
  companyId: string;
}): Promise<number> {
  const dayMs = 24 * 60 * 60 * 1000;
  const since = new Date(Date.now() - 5 * dayMs);
  const rows = await prisma.roleplaySession.findMany({
    where: {
      userId: input.userId,
      endedAt: { not: null, gte: since },
    },
    select: { endedAt: true },
  });
  if (rows.length === 0) return 0;

  // Bucket sessions by local YYYY-MM-DD and see whether the last 5 days
  // (ending today) are all represented.
  const days = new Set<string>();
  for (const r of rows) {
    if (r.endedAt) days.add(localDayKey(r.endedAt));
  }
  const today = new Date();
  const required: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    required.push(localDayKey(d));
  }
  if (!required.every((k) => days.has(k))) return 0;

  return award({
    userId: input.userId,
    companyId: input.companyId,
    action: "streak_5_days",
    sourceKind: "streak",
    sourceId: required[0], // last (= today) is the natural window key
  });
}

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Sum of points earned by a user. */
export async function getUserPoints(userId: string): Promise<number> {
  const agg = await prisma.rewardEarning.aggregate({
    where: { userId },
    _sum: { points: true },
  });
  return agg._sum.points ?? 0;
}

/** Bulk points lookup for a list of users (e.g. leaderboard render). */
export async function getPointsForUsers(
  userIds: string[],
): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const grouped = await prisma.rewardEarning.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds } },
    _sum: { points: true },
  });
  const map = new Map<string, number>();
  for (const g of grouped) map.set(g.userId, g._sum.points ?? 0);
  for (const id of userIds) if (!map.has(id)) map.set(id, 0);
  return map;
}
