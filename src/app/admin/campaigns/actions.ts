"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId)
    throw new Error("forbidden");
  return user;
}

const CampaignSchema = z.object({
  name: z.string().min(2).max(120).trim(),
  description: z.string().max(2000).optional().nullable(),
  audience: z.string().max(200).optional().nullable(),
  startsAt: z.string().optional().nullable(), // YYYY-MM-DD or null
  endsAt: z.string().optional().nullable(),
  trainingId: z.string().uuid().optional().nullable(),
  status: z.enum(["draft", "active", "completed", "archived"]).optional(),
});

export async function createCampaign(data: z.infer<typeof CampaignSchema>) {
  const user = await requireAdmin();
  const parsed = CampaignSchema.parse(data);
  await prisma.campaign.create({
    data: {
      companyId: user.companyId!,
      name: parsed.name,
      description: parsed.description ?? null,
      audience: parsed.audience ?? null,
      startsAt: parsed.startsAt ? new Date(parsed.startsAt) : null,
      endsAt: parsed.endsAt ? new Date(parsed.endsAt) : null,
      trainingId: parsed.trainingId ?? null,
      status: parsed.status ?? "draft",
    },
  });
  revalidatePath("/admin/campaigns");
}

export async function updateCampaignStatus(
  id: string,
  status: "draft" | "active" | "completed" | "archived",
) {
  const user = await requireAdmin();
  const existing = await prisma.campaign.findFirst({
    where: { id, companyId: user.companyId! },
    select: { id: true },
  });
  if (!existing) throw new Error("not found");
  await prisma.campaign.update({ where: { id }, data: { status } });
  revalidatePath("/admin/campaigns");
}

export async function deleteCampaign(id: string) {
  const user = await requireAdmin();
  const existing = await prisma.campaign.findFirst({
    where: { id, companyId: user.companyId! },
    select: { id: true },
  });
  if (!existing) throw new Error("not found");
  await prisma.campaign.delete({ where: { id } });
  revalidatePath("/admin/campaigns");
}
