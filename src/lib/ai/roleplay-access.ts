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
      include: { roleplayConfig: true, training: { select: { id: true, title: true, startAt: true, dueAt: true, visibility: true, prerequisiteIds: true, rewardPoints: true, adaptiveDifficulty: true } } },
    });
  }
  const row = await prisma.trainingModule.findFirst({
    where: {
      id: moduleId,
      type: "roleplay",
      published: true,
      training: { companyId: user.companyId, status: "published" },
    },
    include: { roleplayConfig: true, training: { select: { id: true, title: true, startAt: true, dueAt: true, visibility: true, prerequisiteIds: true, rewardPoints: true, adaptiveDifficulty: true } } },
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
            select: { id: true, companyId: true, title: true, passingScore: true, feedbackTone: true, adaptiveDifficulty: true },
          },
        },
      },
    },
  });
}

/**
 * Admin-side counterpart to loadSessionForUser. An admin can open any
 * session belonging to a user in their own company — not just their own
 * (admins don't take roleplay sessions). Tenant scope is enforced via
 * the joined user.companyId match; no admin can ever peek across
 * companies even with a guessed session id.
 *
 * The session owner is included so the admin page can show "whose
 * session is this" in the header without a second query.
 */
export async function loadSessionForAdmin(user: SessionUser, sessionId: string) {
  if (!user.companyId || user.role !== "admin") return null;
  return prisma.roleplaySession.findFirst({
    where: {
      id: sessionId,
      user: { companyId: user.companyId },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          team: { select: { name: true } },
          manager: { select: { name: true, email: true } },
        },
      },
      module: {
        include: {
          roleplayConfig: true,
          training: {
            select: { id: true, companyId: true, title: true, passingScore: true, feedbackTone: true, adaptiveDifficulty: true },
          },
        },
      },
    },
  });
}
