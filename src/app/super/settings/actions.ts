"use server";

// Master Settings server action — singleton table, super-admin only.

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

const Schema = z.object({
  productName: z.string().min(1).max(80),
  signupEnabled: z.boolean(),
  defaultRegion: z.string().min(2).max(40),
  regions: z.array(z.string().min(2).max(40)).min(1).max(20),
  featureFlags: z.record(z.string(), z.union([z.boolean(), z.string(), z.number()])),
});

export async function saveMasterSettings(data: z.infer<typeof Schema>) {
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
    action: "platform.settings.update",
    target: `platform_settings:${SINGLETON_ID}`,
    metadata: {
      productName: parsed.productName,
      signupEnabled: parsed.signupEnabled,
    },
  });
  revalidatePath("/super/settings");
}
