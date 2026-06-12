"use server";

// Server actions for Plans. Super-admin only.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { audit } from "@/lib/audit";

async function requireSuper() {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") throw new Error("forbidden");
  return user;
}

const Limits = z
  .object({
    aiMinutesPerUser: z.number().int().min(0).max(10000).optional(),
    voice: z.boolean().optional(),
    video: z.boolean().optional(),
    customPersonas: z.number().int().min(-1).max(100000).optional(),
    integrations: z.array(z.string()).max(20).optional(),
  })
  .strict();

const PlanSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(80),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{3,8}$/, "color must be a hex code like #e85d3a"),
  priceCents: z.number().int().min(0).max(10_000_000),
  cycle: z.enum(["monthly", "annual"]),
  setupCredits: z.number().int().min(0).max(10_000_000),
  seatsMin: z.number().int().min(0).max(1_000_000),
  seatsMax: z.number().int().min(0).max(1_000_000).nullable(),
  trialDays: z.number().int().min(0).max(365),
  features: z.array(z.string().min(1).max(120)).max(20),
  limits: Limits,
  badge: z.string().max(40).nullable(),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
});

export async function savePlan(data: z.infer<typeof PlanSchema>) {
  const user = await requireSuper();
  const parsed = PlanSchema.parse(data);

  if (parsed.id) {
    await prisma.plan.update({
      where: { id: parsed.id },
      data: {
        name: parsed.name,
        color: parsed.color,
        priceCents: parsed.priceCents,
        cycle: parsed.cycle,
        setupCredits: parsed.setupCredits,
        seatsMin: parsed.seatsMin,
        seatsMax: parsed.seatsMax,
        trialDays: parsed.trialDays,
        features: parsed.features,
        limits: parsed.limits,
        badge: parsed.badge,
        active: parsed.active,
        sortOrder: parsed.sortOrder,
      },
    });
    await audit({
      actorId: user.id,
      companyId: null,
      action: "plan.update",
      target: `plan:${parsed.id}`,
      metadata: { name: parsed.name },
    });
  } else {
    const created = await prisma.plan.create({
      data: {
        name: parsed.name,
        color: parsed.color,
        priceCents: parsed.priceCents,
        cycle: parsed.cycle,
        setupCredits: parsed.setupCredits,
        seatsMin: parsed.seatsMin,
        seatsMax: parsed.seatsMax,
        trialDays: parsed.trialDays,
        features: parsed.features,
        limits: parsed.limits,
        badge: parsed.badge,
        active: parsed.active,
        sortOrder: parsed.sortOrder,
      },
      select: { id: true },
    });
    await audit({
      actorId: user.id,
      companyId: null,
      action: "plan.create",
      target: `plan:${created.id}`,
      metadata: { name: parsed.name },
    });
  }
  revalidatePath("/super/plans");
  revalidatePath("/super/overview");
}

export async function togglePlanActive(id: string) {
  const user = await requireSuper();
  const plan = await prisma.plan.findUnique({
    where: { id },
    select: { active: true, name: true },
  });
  if (!plan) throw new Error("not found");
  await prisma.plan.update({
    where: { id },
    data: { active: !plan.active },
  });
  await audit({
    actorId: user.id,
    companyId: null,
    action: plan.active ? "plan.disable" : "plan.enable",
    target: `plan:${id}`,
    metadata: { name: plan.name },
  });
  revalidatePath("/super/plans");
}
