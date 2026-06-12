"use server";

// Server actions for the trainee module-detail page. Records completion
// of non-roleplay modules (video / quiz / document). Roleplay completion
// is still derived from RoleplaySession.endedAt — those modules use the
// roleplay player at /play and never call this action.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

const Schema = z.object({
  moduleId: z.string().uuid(),
  scorePct: z.number().int().min(0).max(100).optional(),
});

export async function markModuleComplete(
  args: z.infer<typeof Schema>,
): Promise<void> {
  const user = await getSessionUser();
  if (!user || user.role !== "trainee") throw new Error("forbidden");

  const { moduleId, scorePct } = Schema.parse(args);

  // Verify the module belongs to a published training in this tenant.
  const mod = await prisma.trainingModule.findFirst({
    where: {
      id: moduleId,
      published: true,
      training: { companyId: user.companyId ?? "", status: "published" },
    },
    select: {
      id: true,
      trainingId: true,
      type: true,
    },
  });
  if (!mod) throw new Error("module not found");

  // Roleplays don't write here — their completion is RoleplaySession.endedAt.
  if (mod.type === "roleplay") {
    throw new Error("roleplay completion comes from session end");
  }

  await prisma.moduleCompletion.upsert({
    where: { userId_moduleId: { userId: user.id, moduleId } },
    update: {
      // Refresh timestamp + score on re-completion (e.g. retake a quiz).
      completedAt: new Date(),
      ...(scorePct != null ? { scorePct } : {}),
    },
    create: {
      userId: user.id,
      moduleId,
      scorePct: scorePct ?? null,
    },
  });

  revalidatePath(`/learn/trainings/${mod.trainingId}`);
  revalidatePath("/learn/dashboard");
  redirect(`/learn/trainings/${mod.trainingId}`);
}
