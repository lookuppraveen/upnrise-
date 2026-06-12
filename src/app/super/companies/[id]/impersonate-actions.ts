"use server";

// Start / stop impersonation. Cookie-based session, DB-backed, audited.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_MAX_AGE_SECONDS,
} from "@/lib/auth/impersonation";
import { audit } from "@/lib/audit";
import { ROLE_SCOPES } from "@/lib/rbac/roles";

const StartSchema = z.object({
  companyId: z.string().uuid(),
  asRole: z.enum(["admin", "trainee"]),
});

async function requireSuperViaAuth() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("unauthorized");
  const row = await prisma.user.findUnique({
    where: { id: data.user.id },
    select: { id: true, role: true, email: true },
  });
  if (!row || row.role !== "super_admin") throw new Error("forbidden");
  return row;
}

export async function startImpersonation(
  data: z.infer<typeof StartSchema>,
) {
  const operator = await requireSuperViaAuth();
  const parsed = StartSchema.parse(data);

  // Verify tenant + pick a target.
  const company = await prisma.company.findUnique({
    where: { id: parsed.companyId },
    select: { id: true, name: true },
  });
  if (!company) throw new Error("company not found");

  const target = await prisma.user.findFirst({
    where: { companyId: parsed.companyId, role: parsed.asRole },
    select: { id: true, email: true },
  });
  if (!target) {
    throw new Error(
      `No ${parsed.asRole} exists in this tenant. Invite one first before impersonating.`,
    );
  }

  // End any prior active impersonation by this operator.
  await prisma.impersonationSession.updateMany({
    where: { operatorId: operator.id, endedAt: null },
    data: { endedAt: new Date() },
  });

  const session = await prisma.impersonationSession.create({
    data: {
      operatorId: operator.id,
      companyId: parsed.companyId,
      asRole: parsed.asRole,
    },
    select: { id: true },
  });

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: IMPERSONATION_MAX_AGE_SECONDS,
    path: "/",
  });

  // Audit (audit() will detect the cookie and double-record context, but
  // the start event itself we attribute directly).
  await prisma.auditLog.create({
    data: {
      actorId: operator.id,
      companyId: parsed.companyId,
      action: "impersonation.start",
      target: `user:${target.id}`,
      metadata: {
        as_role: parsed.asRole,
        target_email: target.email,
        session_id: session.id,
      },
    },
  });

  redirect(ROLE_SCOPES[parsed.asRole].home);
}

export async function stopImpersonation() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  if (!sessionId) redirect("/super/companies");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const realAuthId = data.user?.id;

  if (!realAuthId) {
    cookieStore.delete(IMPERSONATION_COOKIE);
    redirect("/login");
  }

  const session = await prisma.impersonationSession.findFirst({
    where: { id: sessionId, operatorId: realAuthId },
    select: { id: true, companyId: true, asRole: true },
  });

  if (session) {
    await prisma.impersonationSession.update({
      where: { id: session.id },
      data: { endedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        actorId: realAuthId,
        companyId: session.companyId,
        action: "impersonation.stop",
        target: `session:${session.id}`,
        metadata: { as_role: session.asRole },
      },
    });
  }

  cookieStore.delete(IMPERSONATION_COOKIE);
  redirect("/super/companies");
}
