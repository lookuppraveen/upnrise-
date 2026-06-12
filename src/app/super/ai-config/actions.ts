"use server";

// Server action for the platform-wide AI Configuration singleton.
// Super-admin only.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { audit } from "@/lib/audit";

const SINGLETON_ID = "singleton";

async function requireSuper() {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") throw new Error("forbidden");
  return user;
}

export async function loadPlatformSettings() {
  return prisma.platformSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
}

const Schema = z.object({
  defaultModel: z.string().min(3).max(80),
  fastModel: z.string().min(3).max(80),
  defaultCoachPersona: z
    .string()
    .max(2000)
    .transform((s) => s.trim() || null)
    .nullable(),
  defaultCoachGuardrails: z
    .string()
    .max(2000)
    .transform((s) => s.trim() || null)
    .nullable(),
  maxTokensPerTurn: z.number().int().min(100).max(8000),
  monthlySpendCapCents: z.number().int().min(0).max(100_000_000),
  notes: z
    .string()
    .max(2000)
    .transform((s) => s.trim() || null)
    .nullable(),
});

export async function savePlatformSettings(data: z.infer<typeof Schema>) {
  const user = await requireSuper();
  const parsed = Schema.parse(data);
  await prisma.platformSettings.upsert({
    where: { id: SINGLETON_ID },
    update: parsed,
    create: { id: SINGLETON_ID, ...parsed },
  });
  await audit({
    actorId: user.id,
    companyId: null,
    action: "platform.ai_config.update",
    target: `platform_settings:${SINGLETON_ID}`,
    metadata: {
      defaultModel: parsed.defaultModel,
      fastModel: parsed.fastModel,
      maxTokensPerTurn: parsed.maxTokensPerTurn,
    },
  });
  revalidatePath("/super/ai-config");
  revalidatePath("/super/overview");
}
