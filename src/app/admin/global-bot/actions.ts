"use server";

// Server action for the Global Bot config. Admin-only, tenant-scoped.
// Updates flow into the Trainee Coach system prompt on the next request
// (no caching).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

const Schema = z.object({
  botPersona: z
    .string()
    .max(1500)
    .transform((s) => s.trim() || null)
    .nullable(),
  botGuardrails: z
    .string()
    .max(1500)
    .transform((s) => s.trim() || null)
    .nullable(),
  botTagline: z
    .string()
    .max(200)
    .transform((s) => s.trim() || null)
    .nullable(),
});

export async function saveGlobalBot(data: z.infer<typeof Schema>) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    throw new Error("forbidden");
  }
  const parsed = Schema.parse(data);
  await prisma.company.update({
    where: { id: user.companyId },
    data: parsed,
  });
  revalidatePath("/admin/global-bot");
}
