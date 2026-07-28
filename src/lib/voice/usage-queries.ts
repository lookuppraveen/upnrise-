// Read-side helpers for voice_usage_log used by the super-admin
// dashboard tile. Kept separate from lib/voice/usage.ts (which owns
// the write path + cap enforcement) so the concerns stay tidy.

import { prisma } from "@/lib/db/client";

export type VoiceSpendRow = {
  companyId: string;
  companyName: string;
  logoInitials: string;
  brandColor: string;
  costCentsTotal: number;
  ttsChars: number;
};

/**
 * Top tenants by voice spend this calendar month (UTC). Used by the
 * super-admin overview tile. Cheap: one groupBy + one findMany.
 */
export async function getTopVoiceSpendThisMonth(
  limit = 5,
): Promise<VoiceSpendRow[]> {
  const monthStart = startOfMonthUtc(new Date());
  const grouped = await prisma.voiceUsageLog.groupBy({
    by: ["companyId"],
    where: { createdAt: { gte: monthStart } },
    _sum: { costCents: true, charsIn: true },
    orderBy: { _sum: { costCents: "desc" } },
    take: limit,
  });
  if (grouped.length === 0) return [];

  const companies = await prisma.company.findMany({
    where: { id: { in: grouped.map((g) => g.companyId) } },
    select: { id: true, name: true, logoInitials: true, brandColor: true },
  });
  const byId = new Map(companies.map((c) => [c.id, c]));

  return grouped.map((g) => {
    const c = byId.get(g.companyId);
    return {
      companyId: g.companyId,
      companyName: c?.name ?? "Unknown",
      logoInitials: c?.logoInitials ?? "??",
      brandColor: c?.brandColor ?? "#888",
      costCentsTotal: g._sum.costCents ?? 0,
      ttsChars: g._sum.charsIn ?? 0,
    };
  });
}

/**
 * Platform-wide voice spend this month. Returns totals in whole cents.
 */
export async function getPlatformVoiceSpendThisMonth(): Promise<{
  costCents: number;
  callCount: number;
}> {
  const monthStart = startOfMonthUtc(new Date());
  const agg = await prisma.voiceUsageLog.aggregate({
    where: { createdAt: { gte: monthStart } },
    _sum: { costCents: true },
    _count: { _all: true },
  });
  return {
    costCents: agg._sum.costCents ?? 0,
    callCount: agg._count._all ?? 0,
  };
}

function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
