// Admin · Global Bot  (01_ADMIN.md §Global Bot)
//
// 4-tab editor + live KPI strip. Conversations + helpful rating come from
// the Conversation / ConversationTurn tables; they sit at 0 until the bot
// has a learner-facing runtime to write into them. The "Live chat" tab
// still renders an honest placeholder until that runtime ships.

import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { GlobalBotEditor } from "@/components/admin/GlobalBotEditor";

export default async function GlobalBotPage() {
  const user = (await getSessionUser())!;
  if (!user.companyId) return null;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [
    company,
    kbCount,
    glossaryCount,
    kbSources,
    conversations7d,
    helpfulAgg,
    flaggedOpen,
  ] = await Promise.all([
    prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        name: true,
        botPersona: true,
        botGuardrails: true,
        botTagline: true,
      },
    }),
    prisma.kbSource.count({
      where: { companyId: user.companyId },
    }),
    prisma.dictionaryTerm.count({
      where: { companyId: user.companyId },
    }),
    prisma.kbSource.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        name: true,
        kind: true,
        status: true,
        size: true,
        createdAt: true,
        training: { select: { id: true, title: true } },
      },
    }),
    prisma.conversation.count({
      where: {
        companyId: user.companyId,
        startedAt: { gte: weekAgo },
      },
    }),
    prisma.conversation.groupBy({
      by: ["helpful"],
      where: {
        companyId: user.companyId,
        helpful: { not: null },
      },
      _count: { _all: true },
    }),
    prisma.conversation.count({
      where: {
        companyId: user.companyId,
        flaggedAt: { not: null },
      },
    }),
  ]);
  if (!company) return null;

  const overrideCount =
    (company.botPersona ? 1 : 0) +
    (company.botGuardrails ? 1 : 0) +
    (company.botTagline ? 1 : 0);

  // helpfulPct = positive / (positive + negative). null when no ratings.
  let positive = 0;
  let negative = 0;
  for (const row of helpfulAgg) {
    if (row.helpful === true) positive = row._count._all;
    else if (row.helpful === false) negative = row._count._all;
  }
  const helpfulPct =
    positive + negative === 0
      ? null
      : Math.round((positive / (positive + negative)) * 100);

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1280px]">
      <GlobalBotEditor
        initial={{
          companyName: company.name,
          botPersona: company.botPersona,
          botGuardrails: company.botGuardrails,
          botTagline: company.botTagline,
        }}
        stats={{
          kbCount,
          glossaryCount,
          overrideCount,
          conversations7d,
          helpfulPct,
          flaggedOpen,
        }}
        kbSources={kbSources.map((k) => ({
          id: k.id,
          name: k.name,
          kind: k.kind,
          status: k.status,
          size: k.size,
          createdAt: k.createdAt,
          training: k.training,
        }))}
      />
    </div>
  );
}
