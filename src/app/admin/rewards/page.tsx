// Admin · Reward Points  (01_ADMIN.md §Reward Points)
//
// Two sections: earning rules (action → points) + redemption catalog.
// Runtime point-awarding is live: lib/rewards/award.ts grants points when
// learners hit the configured triggers at /api/roleplay/end. Rule edits
// take effect on the next event.

import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { RewardsConsole } from "@/components/admin/RewardsConsole";

export default async function RewardsPage() {
  const user = (await getSessionUser())!;
  if (!user.companyId) return null;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [rules, items, weekAgg, lifetimeAgg, recentEarners] =
    await Promise.all([
      prisma.rewardRule.findMany({
        where: { companyId: user.companyId },
        select: { action: true, points: true, enabled: true },
      }),
      prisma.rewardItem.findMany({
        where: { companyId: user.companyId },
        orderBy: { pointsCost: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          pointsCost: true,
          available: true,
        },
      }),
      prisma.rewardEarning.aggregate({
        where: {
          companyId: user.companyId,
          awardedAt: { gte: weekAgo },
        },
        _sum: { points: true },
        _count: { _all: true },
      }),
      prisma.rewardEarning.aggregate({
        where: { companyId: user.companyId },
        _sum: { points: true },
      }),
      prisma.rewardEarning.findMany({
        where: {
          companyId: user.companyId,
          awardedAt: { gte: weekAgo },
        },
        select: { userId: true },
        distinct: ["userId"],
      }),
    ]);

  const runtime = {
    pointsThisWeek: weekAgg._sum.points ?? 0,
    eventsThisWeek: weekAgg._count._all,
    lifetimePoints: lifetimeAgg._sum.points ?? 0,
    earnersThisWeek: recentEarners.length,
  };

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1280px]">
      <RewardsConsole rules={rules} items={items} runtime={runtime} />
    </div>
  );
}
