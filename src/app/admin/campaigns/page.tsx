// Admin · Campaigns  (01_ADMIN.md §Campaigns)
//
// Server fetches the tenant's campaigns + the published/draft training pool
// for the "link a training" picker, then hands off to the client console.

import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { CampaignsConsole } from "@/components/admin/CampaignsConsole";

export default async function CampaignsPage() {
  const user = (await getSessionUser())!;
  if (!user.companyId) return null;

  const [campaigns, trainings] = await Promise.all([
    prisma.campaign.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "desc" },
      include: {
        training: { select: { id: true, title: true } },
      },
    }),
    prisma.training.findMany({
      where: {
        companyId: user.companyId,
        status: { in: ["published", "draft"] },
      },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1100px]">
      <CampaignsConsole campaigns={campaigns} trainings={trainings} />
    </div>
  );
}
