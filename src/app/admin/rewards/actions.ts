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

const RewardAction = z.enum([
  "complete_training",
  "complete_module",
  "score_above_80",
  "score_above_90",
  "streak_5_days",
  "first_session",
]);

const RuleSchema = z.object({
  action: RewardAction,
  points: z.number().int().min(0).max(100000),
  enabled: z.boolean(),
});

export async function upsertRewardRule(data: z.infer<typeof RuleSchema>) {
  const user = await requireAdmin();
  const parsed = RuleSchema.parse(data);
  await prisma.rewardRule.upsert({
    where: {
      companyId_action: {
        companyId: user.companyId!,
        action: parsed.action,
      },
    },
    update: { points: parsed.points, enabled: parsed.enabled },
    create: { ...parsed, companyId: user.companyId! },
  });
  revalidatePath("/admin/rewards");
}

const ItemSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120).trim(),
  description: z.string().max(2000).optional().nullable(),
  pointsCost: z.number().int().min(0).max(1000000),
  available: z.boolean(),
});

export async function upsertRewardItem(data: z.infer<typeof ItemSchema>) {
  const user = await requireAdmin();
  const parsed = ItemSchema.parse(data);
  if (parsed.id) {
    const existing = await prisma.rewardItem.findFirst({
      where: { id: parsed.id, companyId: user.companyId! },
      select: { id: true },
    });
    if (!existing) throw new Error("not found");
    await prisma.rewardItem.update({
      where: { id: parsed.id },
      data: {
        name: parsed.name,
        description: parsed.description ?? null,
        pointsCost: parsed.pointsCost,
        available: parsed.available,
      },
    });
  } else {
    await prisma.rewardItem.create({
      data: {
        companyId: user.companyId!,
        name: parsed.name,
        description: parsed.description ?? null,
        pointsCost: parsed.pointsCost,
        available: parsed.available,
      },
    });
  }
  revalidatePath("/admin/rewards");
}

export async function deleteRewardItem(id: string) {
  const user = await requireAdmin();
  const existing = await prisma.rewardItem.findFirst({
    where: { id, companyId: user.companyId! },
    select: { id: true },
  });
  if (!existing) throw new Error("not found");
  await prisma.rewardItem.delete({ where: { id } });
  revalidatePath("/admin/rewards");
}
