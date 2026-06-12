// Tenant-scoped access checks shared by all three roleplay endpoints.
// Never trust a moduleId/sessionId from the client without these checks.

import { prisma } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Authorise a request to interact with a roleplay module. Trainees
 * only see published modules in published trainings. Admins of the
 * same tenant can preview any roleplay module (published or draft) —
 * the "Preview as trainee" path from the admin editor.
 */
export async function loadModuleForUser(user: SessionUser, moduleId: string) {
  if (!user.companyId) return null;
  if (user.role === "admin") {
    return prisma.trainingModule.findFirst({
      where: {
        id: moduleId,
        type: "roleplay",
        training: { companyId: user.companyId },
      },
      include: { roleplayConfig: true, training: { select: { id: true, title: true, startAt: true, dueAt: true } } },
    });
  }
  const row = await prisma.trainingModule.findFirst({
    where: {
      id: moduleId,
      type: "roleplay",
      published: true,
      training: { companyId: user.companyId, status: "published" },
    },
    include: { roleplayConfig: true, training: { select: { id: true, title: true, startAt: true, dueAt: true } } },
  });
  return row;
}

export async function loadSessionForUser(user: SessionUser, sessionId: string) {
  return prisma.roleplaySession.findFirst({
    where: { id: sessionId, userId: user.id },
    include: {
      module: {
        include: {
          roleplayConfig: true,
          training: {
            select: { id: true, companyId: true, title: true, passingScore: true, feedbackTone: true },
          },
        },
      },
    },
  });
}
