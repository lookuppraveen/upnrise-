"use server";

// Server actions for the Employees admin surface.
//
// inviteTrainee creates a User row for a new teammate with status="invited".
// The actual sign-in path (Supabase Auth bridging + invite-token landing
// page) is a follow-up — this action is the first step so admins can see
// the new roster row and start assigning them to trainings even before
// the sign-in link exists.

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth/session";
import {
  inviteUrlFor,
  signInviteToken,
} from "@/lib/auth/invite-token";
import { prisma } from "@/lib/db/client";

const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().max(120).optional(),
  role: z.enum(["trainee", "admin"]).default("trainee"),
  teamId: z.string().min(1).max(100).optional(),
  managerId: z.string().min(1).max(100).optional(),
  employeeCode: z.string().trim().max(40).optional(),
  designation: z.string().trim().max(80).optional(),
  department: z.string().trim().max(80).optional(),
});

export type InviteTraineeInput = z.infer<typeof InviteSchema>;

export type InviteTraineeResult =
  | {
      ok: true;
      userId: string;
      inviteUrl: string;
      expiresAt: string;
    }
  | { ok: false; error: string };

export async function inviteTrainee(
  input: InviteTraineeInput,
): Promise<InviteTraineeResult> {
  const session = await getSessionUser();
  if (!session || session.role !== "admin" || !session.companyId) {
    return { ok: false, error: "Only company admins can invite teammates." };
  }

  const parsed = InviteSchema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `Invalid input — ${detail}` };
  }
  const data = parsed.data;

  // Email uniqueness check across the platform — User.email is unique
  // globally. We surface a different message when the conflict is in
  // the caller's own company vs another tenant, since the second case
  // is one the admin can't resolve themselves.
  const existing = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true, companyId: true, status: true },
  });
  if (existing) {
    if (existing.companyId === session.companyId) {
      return {
        ok: false,
        error:
          existing.status === "invited"
            ? "That email already has a pending invite on your roster."
            : "That email is already on your roster.",
      };
    }
    return {
      ok: false,
      error: "That email is already registered to another company.",
    };
  }

  // Tenant-scope the team if one was picked — admin can't sneak a user
  // into a team belonging to another company.
  if (data.teamId) {
    const team = await prisma.team.findFirst({
      where: { id: data.teamId, companyId: session.companyId },
      select: { id: true },
    });
    if (!team) {
      return { ok: false, error: "Selected team isn't in your company." };
    }
  }

  // Same tenant-scope check for the manager: the admin can only set a
  // manager who's already an admin/super_admin in their company (you
  // can't report to a trainee), and they must belong to the same
  // company.
  if (data.managerId) {
    const manager = await prisma.user.findFirst({
      where: {
        id: data.managerId,
        companyId: session.companyId,
        role: { in: ["admin", "super_admin"] },
      },
      select: { id: true },
    });
    if (!manager) {
      return { ok: false, error: "Selected manager isn't in your company." };
    }
  }

  // Pre-mint a UUID locally; the trainee's Supabase Auth user (when we
  // wire that up) will be created with the same id so the foreign key
  // never has to migrate. randomUUID() is v4 — compatible with the
  // @db.Uuid column.
  const userId = randomUUID();
  await prisma.user.create({
    data: {
      id: userId,
      email: data.email,
      name: data.name && data.name.length > 0 ? data.name : null,
      role: data.role,
      companyId: session.companyId,
      teamId: data.teamId ?? null,
      managerId: data.managerId ?? null,
      employeeCode:
        data.employeeCode && data.employeeCode.length > 0
          ? data.employeeCode
          : null,
      designation:
        data.designation && data.designation.length > 0
          ? data.designation
          : null,
      department:
        data.department && data.department.length > 0
          ? data.department
          : null,
      status: "invited",
    },
  });

  // Mint a stateless, HMAC-signed invite token that the admin can
  // share manually. The token carries userId + expiry; verification is
  // pure crypto so we don't need an InviteToken row. Single-use is
  // enforced at the acceptance step (step c) by checking that the
  // target user is still status="invited" before activating.
  let invite: { token: string; expiresAt: Date };
  try {
    invite = signInviteToken(userId);
  } catch (e) {
    // If the signing secret is unset we still want the row to land —
    // the admin can resend later — but we surface the issue clearly.
    return {
      ok: false,
      error:
        e instanceof Error
          ? `User row created, but the invite link couldn't be signed: ${e.message}`
          : "Invite link signing failed.",
    };
  }
  const inviteUrl = inviteUrlFor(invite.token);

  await audit({
    actorId: session.id,
    companyId: session.companyId,
    action: "user.invite",
    target: `user:${userId}`,
    metadata: {
      email: data.email,
      role: data.role,
      teamId: data.teamId ?? null,
      inviteExpiresAt: invite.expiresAt.toISOString(),
    },
  });

  revalidatePath("/admin/employees");
  return {
    ok: true,
    userId,
    inviteUrl,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

// ─── updateEmployee ───────────────────────────────────────────────────────────

const UpdateSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().trim().max(120).optional(),
  role: z.enum(["trainee", "admin"]).optional(),
  teamId: z.string().min(1).max(100).optional().nullable(),
  managerId: z.string().min(1).max(100).optional().nullable(),
  employeeCode: z.string().trim().max(40).optional().nullable(),
  designation: z.string().trim().max(80).optional().nullable(),
  department: z.string().trim().max(80).optional().nullable(),
});

export type UpdateEmployeeInput = z.infer<typeof UpdateSchema>;
export type UpdateEmployeeResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateEmployee(
  input: UpdateEmployeeInput,
): Promise<UpdateEmployeeResult> {
  const session = await getSessionUser();
  if (!session || session.role !== "admin" || !session.companyId) {
    return { ok: false, error: "Only company admins can edit employees." };
  }

  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `Invalid input — ${detail}` };
  }
  const data = parsed.data;

  const target = await prisma.user.findFirst({
    where: { id: data.userId, companyId: session.companyId },
    select: { id: true },
  });
  if (!target) {
    return { ok: false, error: "Employee not found in your company." };
  }

  if (data.teamId) {
    const team = await prisma.team.findFirst({
      where: { id: data.teamId, companyId: session.companyId },
      select: { id: true },
    });
    if (!team) {
      return { ok: false, error: "Selected team isn't in your company." };
    }
  }

  if (data.managerId) {
    const manager = await prisma.user.findFirst({
      where: {
        id: data.managerId,
        companyId: session.companyId,
        role: { in: ["admin", "super_admin"] },
      },
      select: { id: true },
    });
    if (!manager) {
      return { ok: false, error: "Selected manager isn't in your company." };
    }
  }

  await prisma.user.update({
    where: { id: data.userId },
    data: {
      name: data.name && data.name.length > 0 ? data.name : null,
      ...(data.role !== undefined && { role: data.role }),
      teamId: data.teamId ?? null,
      managerId: data.managerId ?? null,
      employeeCode: data.employeeCode && data.employeeCode.length > 0 ? data.employeeCode : null,
      designation: data.designation && data.designation.length > 0 ? data.designation : null,
      department: data.department && data.department.length > 0 ? data.department : null,
    },
  });

  await audit({
    actorId: session.id,
    companyId: session.companyId,
    action: "user.update",
    target: `user:${data.userId}`,
    metadata: { updatedFields: Object.keys(data).filter((k) => k !== "userId") },
  });

  revalidatePath("/admin/employees");
  return { ok: true };
}

// ─── deleteEmployee ───────────────────────────────────────────────────────────

export type DeleteEmployeeResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteEmployee(
  userId: string,
): Promise<DeleteEmployeeResult> {
  const session = await getSessionUser();
  if (!session || session.role !== "admin" || !session.companyId) {
    return { ok: false, error: "Only company admins can delete employees." };
  }

  if (userId === session.id) {
    return { ok: false, error: "You cannot delete your own account." };
  }

  const target = await prisma.user.findFirst({
    where: { id: userId, companyId: session.companyId },
    select: { id: true, email: true },
  });
  if (!target) {
    return { ok: false, error: "Employee not found in your company." };
  }

  await prisma.user.delete({ where: { id: userId } });

  await audit({
    actorId: session.id,
    companyId: session.companyId,
    action: "user.delete",
    target: `user:${userId}`,
    metadata: { email: target.email },
  });

  revalidatePath("/admin/employees");
  return { ok: true };
}
