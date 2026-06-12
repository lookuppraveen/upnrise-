// Tenant-scoped query helpers. Always derive companyId from the session,
// never from the URL or client (BUILD_PLAN.md §5).
//
// Phase 2 surfaces: trainings, modules, assignments, roleplay sessions.

import { prisma } from "./client";

export async function listTrainingsForCompany(companyId: string) {
  return prisma.training.findMany({
    where: { companyId, status: "published" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      categories: true,
      houseStyleMatch: true,
      thumbnailUrl: true,
      createdAt: true,
      _count: { select: { modules: true } },
    },
  });
}

export async function getTrainingWithModulesForTenant(
  trainingId: string,
  companyId: string,
) {
  return prisma.training.findFirst({
    where: { id: trainingId, companyId, status: "published" },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: {
          roleplayConfig: {
            select: { mode: true, scenario: true },
          },
        },
      },
    },
  });
}

export async function getAssignmentsForUser(userId: string) {
  return prisma.assignment.findMany({
    where: { userId },
    orderBy: [{ dueAt: "asc" }, { priority: "asc" }],
    include: {
      training: {
        select: {
          id: true,
          title: true,
          categories: true,
          _count: { select: { modules: true } },
        },
      },
    },
  });
}

/**
 * For a given user + module, return:
 *   - their best score across all attempts
 *   - the org's best score (across this module)
 *   - number of attempts
 */
export async function getModuleStatsForUser(userId: string, moduleId: string) {
  const [yourBestAgg, orgBestAgg, attempts] = await Promise.all([
    prisma.roleplaySession.aggregate({
      where: { userId, moduleId, score: { not: null } },
      _max: { score: true },
    }),
    prisma.roleplaySession.aggregate({
      where: { moduleId, score: { not: null } },
      _max: { score: true },
    }),
    prisma.roleplaySession.count({
      where: { userId, moduleId },
    }),
  ]);
  return {
    yourBest: yourBestAgg._max.score,
    orgBest: orgBestAgg._max.score,
    attempts,
  };
}

/**
 * Aggregate progress across a training for a user — % of published modules
 * for which they have at least one *completed* roleplay session, or just any
 * session for video/quiz modules. Cheap heuristic for the list page.
 */
export async function getTrainingProgressForUser(
  userId: string,
  trainingId: string,
) {
  const modules = await prisma.trainingModule.findMany({
    where: { trainingId, published: true },
    select: { id: true, type: true },
  });
  if (modules.length === 0) return 0;

  const roleplayIds = modules.filter((m) => m.type === "roleplay").map((m) => m.id);
  const nonRoleplayIds = modules.filter((m) => m.type !== "roleplay").map((m) => m.id);

  // Roleplay modules: any ended session counts as complete.
  // Non-roleplay modules: any ModuleCompletion row counts as complete.
  const [roleplayDone, nonRoleplayDone] = await Promise.all([
    roleplayIds.length === 0
      ? Promise.resolve([])
      : prisma.roleplaySession.groupBy({
          by: ["moduleId"],
          where: {
            userId,
            moduleId: { in: roleplayIds },
            endedAt: { not: null },
          },
          _count: { _all: true },
        }),
    nonRoleplayIds.length === 0
      ? Promise.resolve([])
      : prisma.moduleCompletion.findMany({
          where: { userId, moduleId: { in: nonRoleplayIds } },
          select: { moduleId: true },
        }),
  ]);

  const completedCount =
    (Array.isArray(roleplayDone) ? roleplayDone.length : 0) +
    (Array.isArray(nonRoleplayDone) ? nonRoleplayDone.length : 0);
  return Math.round((completedCount / modules.length) * 100);
}

// ─────────────────────────── Phase 2.5 helpers ───────────────────────────

/** All ended sessions for a user, newest first, with training + module + delta. */
export async function getHistoryForUser(userId: string) {
  return prisma.roleplaySession.findMany({
    where: { userId, endedAt: { not: null } },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      score: true,
      priorScore: true,
      mode: true,
      durationSec: true,
      strongSkills: true,
      weakSkills: true,
      startedAt: true,
      endedAt: true,
      moduleId: true,
      module: {
        select: {
          name: true,
          type: true,
          training: { select: { id: true, title: true } },
        },
      },
    },
  });
}

/** Aggregate KPIs for the learner dashboard. */
export async function getDashboardStatsForUser(userId: string) {
  const [count, agg, totalDuration, pointsAgg] = await Promise.all([
    prisma.roleplaySession.count({
      where: { userId, endedAt: { not: null } },
    }),
    prisma.roleplaySession.aggregate({
      where: { userId, score: { not: null } },
      _avg: { score: true },
      _max: { score: true },
    }),
    prisma.roleplaySession.aggregate({
      where: { userId, durationSec: { not: null } },
      _sum: { durationSec: true },
    }),
    prisma.rewardEarning.aggregate({
      where: { userId },
      _sum: { points: true },
    }),
  ]);
  const avg = agg._avg.score;
  return {
    sessions: count,
    avgScore: avg != null ? Math.round(avg) : null,
    bestScore: agg._max.score,
    minutesPracticed: Math.round((totalDuration._sum.durationSec ?? 0) / 60),
    points: pointsAgg._sum.points ?? 0,
  };
}

/** Most-recent ended session — drives "Continue learning". */
export async function getLastSessionForUser(userId: string) {
  return prisma.roleplaySession.findFirst({
    where: { userId, endedAt: { not: null } },
    orderBy: { endedAt: "desc" },
    select: {
      id: true,
      score: true,
      moduleId: true,
      module: {
        select: {
          name: true,
          training: { select: { id: true, title: true } },
        },
      },
    },
  });
}

/**
 * Top recurring weak skills across the learner's recent sessions. Cheap
 * frequency count over the `weak_skills` array — exact-match aggregation is
 * fine for dev. Phase 2.6 lets Claude synthesize a richer view.
 */
export async function getTopWeakSkillsForUser(
  userId: string,
  limit = 3,
): Promise<Array<{ skill: string; count: number }>> {
  const rows = await prisma.roleplaySession.findMany({
    where: { userId, score: { not: null } },
    orderBy: { startedAt: "desc" },
    take: 20, // most recent 20 sessions
    select: { weakSkills: true },
  });
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const s of r.weakSkills) {
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Augment assignments with derived progress + status. status here mirrors what
 * the user expects on the tab filter, regardless of what's stored in the DB.
 */
// ─────────────────────────── Super Admin (Phase 4) ───────────────────────

/**
 * MRR for a single subscription, in cents. Honors per-sub priceOverrideCents
 * (Enterprise customs) when set.
 */
export function subscriptionMrrCents(args: {
  seats: number;
  priceOverrideCents: number | null;
  planPriceCents: number;
}): number {
  const per = args.priceOverrideCents ?? args.planPriceCents;
  return per * args.seats;
}

/** List all companies for the super-admin grid, with sub + plan + user count. */
export async function listAllCompaniesForSuper() {
  const companies = await prisma.company.findMany({
    orderBy: { name: "asc" },
    include: {
      subscription: {
        include: { plan: true },
      },
      _count: { select: { users: true } },
    },
  });
  return companies.map((c) => {
    const mrr =
      c.subscription && c.subscription.plan
        ? subscriptionMrrCents({
            seats: c.subscription.seats,
            priceOverrideCents: c.subscription.priceOverrideCents,
            planPriceCents: c.subscription.plan.priceCents,
          })
        : 0;
    return {
      id: c.id,
      name: c.name,
      logoInitials: c.logoInitials,
      brandColor: c.brandColor,
      industry: c.industry,
      region: c.region,
      seats: c.seats,
      health: c.health,
      since: c.since,
      csm: c.csm,
      churnRisk: c.churnRisk,
      expandScore: c.expandScore,
      growthPct: c.growthPct,
      aiSpendCents: c.aiSpendCents,
      userCount: c._count.users,
      plan: c.subscription?.plan?.name ?? null,
      planColor: c.subscription?.plan?.color ?? null,
      subscriptionStatus: c.subscription?.status ?? null,
      renewalAt: c.subscription?.renewalAt ?? null,
      mrrCents: mrr,
    };
  });
}

/**
 * Platform-wide KPIs for /super/overview. Computed at request time (cheap
 * for the seeded scale; production would denormalize MRR per subscription).
 */
export async function getPlatformStats() {
  const [companies, users, sessions, aiSpendAgg, subscriptions, plans] =
    await Promise.all([
      prisma.company.count(),
      prisma.user.count(),
      prisma.roleplaySession.count({ where: { endedAt: { not: null } } }),
      prisma.company.aggregate({ _sum: { aiSpendCents: true } }),
      prisma.subscription.findMany({
        where: { status: { in: ["active", "trialing"] } },
        include: {
          plan: { select: { priceCents: true } },
        },
      }),
      prisma.plan.count({ where: { active: true } }),
    ]);

  const mrrCents = subscriptions.reduce(
    (acc, s) => acc + (s.priceOverrideCents ?? s.plan.priceCents) * s.seats,
    0,
  );
  return {
    companies,
    users,
    sessions,
    activePlans: plans,
    mrrCents,
    arrCents: mrrCents * 12,
    aiSpendCents: aiSpendAgg._sum.aiSpendCents ?? 0,
  };
}

/** Companies sorted by churn risk desc — drives the "At-risk accounts" list. */
export async function getAtRiskCompaniesForSuper(limit = 6) {
  const rows = await prisma.company.findMany({
    where: { churnRisk: { not: null } },
    orderBy: [{ churnRisk: "desc" }, { name: "asc" }],
    take: limit,
    include: {
      subscription: { include: { plan: true } },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    logoInitials: c.logoInitials,
    brandColor: c.brandColor,
    health: c.health,
    churnRisk: c.churnRisk,
    csm: c.csm,
    plan: c.subscription?.plan?.name ?? null,
    mrrCents:
      c.subscription && c.subscription.plan
        ? (c.subscription.priceOverrideCents ?? c.subscription.plan.priceCents) *
          c.subscription.seats
        : 0,
  }));
}

/**
 * All users platform-wide, with their company + session count. Used by
 * /super/users. Includes both real auth users and seeded "fake trainees"
 * (used for demo realism — they can't actually log in).
 *
 * Counts are computed over ALL users (not search-filtered) so the tab
 * badges always show full role totals, matching the Support & Audit pattern.
 */
export async function listAllUsersForSuper(args: {
  tab?: "all" | "super_admin" | "admin" | "trainee" | "ai_flagged";
  q?: string;
  offset?: number;
  limit?: number;
} = {}) {
  const tab = args.tab ?? "all";
  const q = (args.q ?? "").trim();
  const limit = Math.min(args.limit ?? 50, 200);
  const offset = Math.max(args.offset ?? 0, 0);

  // Filter (tab + search) — applied to the page query AND to `total`.
  const where: Record<string, unknown> = {};
  if (tab === "ai_flagged") where.aiFlagged = true;
  else if (tab !== "all") where.role = tab;
  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" as const } },
      { name: { contains: q, mode: "insensitive" as const } },
      { company: { name: { contains: q, mode: "insensitive" as const } } },
    ];
  }

  const [users, total, grouped, aiFlaggedCount] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ companyId: "asc" }, { email: "asc" }],
      skip: offset,
      take: limit,
      include: {
        company: {
          select: { id: true, name: true, logoInitials: true, brandColor: true },
        },
        _count: { select: { roleplaySessions: true, assignments: true } },
      },
    }),
    prisma.user.count({ where }),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
    prisma.user.count({ where: { aiFlagged: true } }),
  ]);

  const counts = {
    all: grouped.reduce((s, g) => s + g._count._all, 0),
    super_admin:
      grouped.find((g) => g.role === "super_admin")?._count._all ?? 0,
    admin: grouped.find((g) => g.role === "admin")?._count._all ?? 0,
    trainee: grouped.find((g) => g.role === "trainee")?._count._all ?? 0,
    ai_flagged: aiFlaggedCount,
  };

  return {
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      status: u.status,
      lastActive: u.lastActive,
      createdAt: u.createdAt,
      aiFlagged: u.aiFlagged,
      aiFlagReason: u.aiFlagReason,
      company: u.company,
      sessions: u._count.roleplaySessions,
      assignments: u._count.assignments,
    })),
    total,
    counts,
  };
}

/**
 * Companies + subscription + plan for the credits & billing table.
 * Credits totals are derived from the ledger:
 *   creditsGranted = sum of positive entries (setup + topups + positive adjustments)
 *   creditsUsed    = abs(sum of negative entries) (ai_consumption + negative adjustments)
 *   creditsBalance = creditsGranted - creditsUsed
 */
export async function listBillingForSuper() {
  const companies = await prisma.company.findMany({
    orderBy: { name: "asc" },
    include: {
      subscription: { include: { plan: true } },
      _count: { select: { users: true } },
    },
  });

  const companyIds = companies.map((c) => c.id);
  const ledger = companyIds.length
    ? await prisma.creditLedgerEntry.findMany({
        where: { companyId: { in: companyIds } },
        select: { companyId: true, amount: true },
      })
    : [];

  const granted = new Map<string, number>();
  const used = new Map<string, number>();
  for (const e of ledger) {
    if (e.amount >= 0) {
      granted.set(e.companyId, (granted.get(e.companyId) ?? 0) + e.amount);
    } else {
      used.set(e.companyId, (used.get(e.companyId) ?? 0) + Math.abs(e.amount));
    }
  }

  return companies.map((c) => {
    const plan = c.subscription?.plan;
    const sub = c.subscription;
    const per = sub?.priceOverrideCents ?? plan?.priceCents ?? 0;
    const mrrCents = sub ? per * sub.seats : 0;
    return {
      id: c.id,
      name: c.name,
      logoInitials: c.logoInitials,
      brandColor: c.brandColor,
      planName: plan?.name ?? null,
      planColor: plan?.color ?? null,
      seats: sub?.seats ?? 0,
      users: c._count.users,
      mrrCents,
      subscriptionStatus: sub?.status ?? null,
      renewalAt: sub?.renewalAt ?? null,
      creditsTotal: granted.get(c.id) ?? 0,
      creditsUsed: used.get(c.id) ?? 0,
      aiSpendCents: c.aiSpendCents,
    };
  });
}

/**
 * Aggregate credits for a single tenant — granted/used/balance, plus the
 * last few ledger entries for a mini-history surface on Company Detail.
 */
export async function getCompanyCreditsForSuper(companyId: string) {
  const [agg, recent] = await Promise.all([
    prisma.creditLedgerEntry.findMany({
      where: { companyId },
      select: { amount: true },
    }),
    prisma.creditLedgerEntry.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        kind: true,
        amount: true,
        reason: true,
        createdAt: true,
      },
    }),
  ]);
  let granted = 0;
  let used = 0;
  for (const e of agg) {
    if (e.amount >= 0) granted += e.amount;
    else used += Math.abs(e.amount);
  }
  return {
    granted,
    used,
    balance: granted - used,
    recent,
  };
}

/** Cross-tenant aggregates by region/industry for /super/analytics. */
export async function getAnalyticsBreakdownsForSuper() {
  const companies = await listAllCompaniesForSuper();

  const byRegion = new Map<
    string,
    { count: number; seats: number; mrrCents: number; aiSpendCents: number }
  >();
  const byIndustry = new Map<
    string,
    { count: number; seats: number; mrrCents: number; aiSpendCents: number }
  >();

  for (const c of companies) {
    const region = c.region ?? "Unknown";
    const industry = c.industry ?? "Unknown";
    const ra = byRegion.get(region) ?? {
      count: 0,
      seats: 0,
      mrrCents: 0,
      aiSpendCents: 0,
    };
    ra.count++;
    ra.seats += c.seats;
    ra.mrrCents += c.mrrCents;
    ra.aiSpendCents += c.aiSpendCents;
    byRegion.set(region, ra);

    const ia = byIndustry.get(industry) ?? {
      count: 0,
      seats: 0,
      mrrCents: 0,
      aiSpendCents: 0,
    };
    ia.count++;
    ia.seats += c.seats;
    ia.mrrCents += c.mrrCents;
    ia.aiSpendCents += c.aiSpendCents;
    byIndustry.set(industry, ia);
  }

  const sortDesc = <K extends string>(m: Map<K, { mrrCents: number }>) =>
    Array.from(m.entries())
      .map(([key, val]) => ({ key, ...val }))
      .sort((a, b) => b.mrrCents - a.mrrCents);

  const topAiSpend = [...companies]
    .sort((a, b) => b.aiSpendCents - a.aiSpendCents)
    .slice(0, 6)
    .map((c) => ({
      id: c.id,
      name: c.name,
      brandColor: c.brandColor,
      logoInitials: c.logoInitials,
      plan: c.plan,
      aiSpendCents: c.aiSpendCents,
      mrrCents: c.mrrCents,
    }));

  return {
    byRegion: sortDesc(byRegion) as Array<{
      key: string;
      count: number;
      seats: number;
      mrrCents: number;
      aiSpendCents: number;
    }>,
    byIndustry: sortDesc(byIndustry) as Array<{
      key: string;
      count: number;
      seats: number;
      mrrCents: number;
      aiSpendCents: number;
    }>,
    topAiSpend,
  };
}

/**
 * Global audit log (cross-tenant) for /super/support. Supports filter by
 * action substring + offset pagination.
 */
export async function listGlobalAuditLog(args: {
  action?: string;
  offset?: number;
  limit?: number;
}) {
  const limit = Math.min(args.limit ?? 50, 200);
  const offset = Math.max(args.offset ?? 0, 0);
  const where = args.action
    ? { action: { contains: args.action, mode: "insensitive" as const } }
    : {};

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        actor: { select: { email: true, name: true } },
        company: {
          select: {
            id: true,
            name: true,
            logoInitials: true,
            brandColor: true,
          },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { entries, total, offset, limit };
}

/** Cross-tenant audit-log stream for the Platform Overview. */
export async function getRecentPlatformActivity(limit = 8) {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      actor: { select: { email: true, name: true } },
      company: { select: { id: true, name: true, logoInitials: true, brandColor: true } },
    },
  });
}

/** Plans with sub counts + total MRR contribution. */
export async function listPlansForSuper() {
  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      subscriptions: {
        where: { status: { in: ["active", "trialing"] } },
        select: { seats: true, priceOverrideCents: true },
      },
    },
  });
  return plans.map((p) => {
    const companies = p.subscriptions.length;
    const mrrCents = p.subscriptions.reduce(
      (acc, s) => acc + (s.priceOverrideCents ?? p.priceCents) * s.seats,
      0,
    );
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      priceCents: p.priceCents,
      cycle: (p.cycle === "annual" ? "annual" : "monthly") as
        | "monthly"
        | "annual",
      setupCredits: p.setupCredits,
      seatsMin: p.seatsMin,
      seatsMax: p.seatsMax,
      trialDays: p.trialDays,
      features: p.features,
      limits: (p.limits ?? {}) as {
        aiMinutesPerUser?: number;
        voice?: boolean;
        video?: boolean;
        customPersonas?: number;
        integrations?: string[];
      },
      badge: p.badge,
      active: p.active,
      sortOrder: p.sortOrder,
      companies,
      mrrCents,
    };
  });
}

/** Single company detail for /super/companies/[id], with usage stats. */
export async function getCompanyDetailForSuper(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      subscription: { include: { plan: true } },
      _count: {
        select: {
          users: true,
          trainings: true,
        },
      },
    },
  });
  if (!company) return null;

  const [sessionsCount, scoreAgg] = await Promise.all([
    prisma.roleplaySession.count({
      where: { user: { companyId }, endedAt: { not: null } },
    }),
    prisma.roleplaySession.aggregate({
      where: { user: { companyId }, score: { not: null } },
      _avg: { score: true },
    }),
  ]);

  const mrr =
    company.subscription && company.subscription.plan
      ? subscriptionMrrCents({
          seats: company.subscription.seats,
          priceOverrideCents: company.subscription.priceOverrideCents,
          planPriceCents: company.subscription.plan.priceCents,
        })
      : 0;

  return {
    ...company,
    userCount: company._count.users,
    trainingCount: company._count.trainings,
    sessionsCount,
    avgScore:
      scoreAgg._avg.score != null ? Math.round(scoreAgg._avg.score) : null,
    mrrCents: mrr,
  };
}

// ─────────────────────────── Admin (Phase 3.0) ───────────────────────────

/**
 * Admin Dashboard KPIs for the current tenant.
 *   - learners       count of trainee users
 *   - activeTrainings count of published trainings
 *   - avgScore       avg of all scored sessions in this tenant
 *   - completion     % of assignments completed (across all assignments)
 */
/**
 * Per-zone roll-up for the admin Reports page. Every trainee whose team
 * sits under an HQ that has a zone contributes to that zone's row.
 * Unzoned trainees are aggregated as "Unassigned" so admins can see the
 * gap without it being hidden.
 */
export async function getZoneBreakdownForCompany(companyId: string) {
  const trainees = await prisma.user.findMany({
    where: { companyId, role: "trainee" },
    select: {
      id: true,
      team: {
        select: {
          hq: { select: { zone: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  type ZoneAgg = {
    id: string | null;
    name: string;
    learnerIds: string[];
  };
  const buckets = new Map<string, ZoneAgg>();
  for (const t of trainees) {
    const zone = t.team?.hq?.zone ?? null;
    const key = zone?.id ?? "__unassigned__";
    const bucket =
      buckets.get(key) ??
      ({
        id: zone?.id ?? null,
        name: zone?.name ?? "Unassigned",
        learnerIds: [],
      } as ZoneAgg);
    bucket.learnerIds.push(t.id);
    buckets.set(key, bucket);
  }
  if (buckets.size === 0) return [];

  const rows = await Promise.all(
    [...buckets.values()].map(async (b) => {
      const [sessions, scored] = await Promise.all([
        prisma.roleplaySession.count({
          where: {
            userId: { in: b.learnerIds },
            endedAt: { not: null },
          },
        }),
        prisma.roleplaySession.aggregate({
          where: {
            userId: { in: b.learnerIds },
            score: { not: null },
          },
          _avg: { score: true },
        }),
      ]);
      return {
        zoneId: b.id,
        zoneName: b.name,
        learners: b.learnerIds.length,
        sessions,
        avgScore:
          scored._avg.score != null ? Math.round(scored._avg.score) : null,
      };
    }),
  );

  // Sort: real zones (with id) first by sessions desc, then unassigned.
  return rows.sort((a, b) => {
    if (a.zoneId && !b.zoneId) return -1;
    if (!a.zoneId && b.zoneId) return 1;
    return b.sessions - a.sessions;
  });
}

export async function getAdminDashboardStats(companyId: string) {
  const [learners, activeTrainings, avgAgg, allAssignments] = await Promise.all([
    prisma.user.count({
      where: { companyId, role: "trainee" },
    }),
    prisma.training.count({
      where: { companyId, status: "published" },
    }),
    prisma.roleplaySession.aggregate({
      where: {
        score: { not: null },
        user: { companyId },
      },
      _avg: { score: true },
      _count: { _all: true },
    }),
    prisma.assignment.findMany({
      where: { training: { companyId } },
      select: { id: true, trainingId: true, userId: true },
    }),
  ]);

  // Compute completion across assignments using the same progress heuristic
  // we use for trainees. Cheap: at-most-N trainings × at-most-N assignments.
  let completed = 0;
  for (const a of allAssignments) {
    const p = await getTrainingProgressForUser(a.userId, a.trainingId);
    if (p >= 100) completed++;
  }

  return {
    learners,
    activeTrainings,
    avgScore:
      avgAgg._avg.score != null ? Math.round(avgAgg._avg.score) : null,
    sessions: avgAgg._count._all,
    assignmentsTotal: allAssignments.length,
    assignmentsCompleted: completed,
    completionPct:
      allAssignments.length === 0
        ? null
        : Math.round((completed / allAssignments.length) * 100),
  };
}

/** All trainings for admin — includes drafts/archived, not just published. */
export async function listTrainingsForAdmin(companyId: string) {
  const trainings = await prisma.training.findMany({
    where: { companyId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      categories: true,
      status: true,
      houseStyleMatch: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { modules: true, assignments: true } },
    },
  });

  // Aggregate completion across all assignments per training (for the card).
  return Promise.all(
    trainings.map(async (t) => {
      const assignments = await prisma.assignment.findMany({
        where: { trainingId: t.id },
        select: { userId: true },
      });
      let done = 0;
      for (const a of assignments) {
        const p = await getTrainingProgressForUser(a.userId, t.id);
        if (p >= 100) done++;
      }
      return {
        ...t,
        learnerCount: assignments.length,
        completionPct:
          assignments.length === 0
            ? null
            : Math.round((done / assignments.length) * 100),
      };
    }),
  );
}

/** Employee/learner roster for admin. Per-user activity stats. */
export async function listEmployeesForCompany(companyId: string) {
  const users = await prisma.user.findMany({
    where: { companyId, role: { in: ["admin", "trainee"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      lastActive: true,
      createdAt: true,
      team: {
        select: {
          id: true,
          name: true,
          hq: {
            select: {
              id: true,
              name: true,
              city: true,
              zone: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  // Per-user stats in parallel.
  return Promise.all(
    users.map(async (u) => {
      const [sessions, scored, assignments] = await Promise.all([
        prisma.roleplaySession.count({
          where: { userId: u.id, endedAt: { not: null } },
        }),
        prisma.roleplaySession.aggregate({
          where: { userId: u.id, score: { not: null } },
          _avg: { score: true },
        }),
        prisma.assignment.count({ where: { userId: u.id } }),
      ]);
      return {
        ...u,
        sessions,
        avgScore:
          scored._avg.score != null ? Math.round(scored._avg.score) : null,
        assignments,
      };
    }),
  );
}

/**
 * Tenant feed posts, newest first. Includes author name when present
 * (null author = AI-generated).
 */
export async function listFeedPostsForCompany(companyId: string, take = 40) {
  return prisma.feedPost.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      kind: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, name: true, email: true } },
    },
  });
}

/**
 * Leaderboard rows for a tenant: trainees ranked by avg session score.
 * Tie-breaker: more sessions. Includes recent activity (sessions in last 7d)
 * as a "trend" signal.
 */
export async function getLeaderboardForCompany(companyId: string) {
  const trainees = await prisma.user.findMany({
    where: { companyId, role: "trainee" },
    select: { id: true, email: true, name: true },
  });

  // Batch one points lookup for all trainees instead of N + 1.
  const pointsRows = await prisma.rewardEarning.groupBy({
    by: ["userId"],
    where: { companyId },
    _sum: { points: true },
  });
  const pointsByUser = new Map<string, number>();
  for (const r of pointsRows) pointsByUser.set(r.userId, r._sum.points ?? 0);

  const stats = await Promise.all(
    trainees.map(async (t) => {
      const [agg, sessions, last7d] = await Promise.all([
        prisma.roleplaySession.aggregate({
          where: { userId: t.id, score: { not: null } },
          _avg: { score: true },
          _max: { score: true },
        }),
        prisma.roleplaySession.count({
          where: { userId: t.id, endedAt: { not: null } },
        }),
        prisma.roleplaySession.count({
          where: {
            userId: t.id,
            endedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        }),
      ]);
      return {
        ...t,
        avgScore: agg._avg.score != null ? Math.round(agg._avg.score) : null,
        bestScore: agg._max.score,
        sessions,
        last7d,
        points: pointsByUser.get(t.id) ?? 0,
      };
    }),
  );

  // Rank: descending by points (real reward), tiebreak by avgScore, then
  // sessions. Points-first matches what the leaderboard surface shows.
  return stats
    .sort((a, b) => {
      if (a.points !== b.points) return b.points - a.points;
      const av = a.avgScore ?? -1;
      const bv = b.avgScore ?? -1;
      if (av !== bv) return bv - av;
      return b.sessions - a.sessions;
    })
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

/**
 * All assignments across the tenant — admin view. Each row carries the
 * learner, the training, computed progress + status, and overdue flag.
 *
 * O(N) progress lookups (one per assignment). Fine for dev tenants;
 * production would either denormalize progress or batch with a single
 * groupBy + module count subquery.
 */
export async function listAssignmentsForCompany(companyId: string) {
  const rows = await prisma.assignment.findMany({
    where: { training: { companyId } },
    orderBy: [{ priority: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    include: {
      user: { select: { id: true, email: true, name: true } },
      training: { select: { id: true, title: true, categories: true } },
    },
  });
  return Promise.all(
    rows.map(async (a) => {
      const progress = await getTrainingProgressForUser(a.userId, a.trainingId);
      const computedStatus: ComputedAssignmentStatus =
        progress >= 100
          ? "completed"
          : progress > 0
            ? "in_progress"
            : "not_started";
      const overdue =
        a.dueAt != null && a.dueAt < new Date() && computedStatus !== "completed";
      return { ...a, computedProgress: progress, computedStatus, overdue };
    }),
  );
}

// ────────────────────────────────────────────────────────────────────────

export type ComputedAssignmentStatus =
  | "not_started"
  | "in_progress"
  | "completed";

export async function getAssignmentsWithProgressForUser(userId: string) {
  const assignments = await getAssignmentsForUser(userId);
  return Promise.all(
    assignments.map(async (a) => {
      const progress = await getTrainingProgressForUser(userId, a.trainingId);
      const status: ComputedAssignmentStatus =
        progress >= 100
          ? "completed"
          : progress > 0
            ? "in_progress"
            : "not_started";
      const overdue =
        a.dueAt != null && a.dueAt < new Date() && status !== "completed";
      return {
        ...a,
        computedProgress: progress,
        computedStatus: status,
        overdue,
      };
    }),
  );
}
