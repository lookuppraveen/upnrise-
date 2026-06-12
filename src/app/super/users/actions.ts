"use server";

// User write actions for super-admin. Phase 4.7 ships suspend / reinstate.
// Role changes + invite remain a Phase 5 polish item.

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

const Body = z.object({
  userId: z.string().uuid(),
  status: z.enum(["active", "suspended"]),
});

export async function setUserStatus(data: z.infer<typeof Body>) {
  const operator = await requireSuper();
  const parsed = Body.parse(data);
  if (parsed.userId === operator.id) {
    throw new Error("Can't change your own status.");
  }
  const target = await prisma.user.findUnique({
    where: { id: parsed.userId },
    select: { id: true, email: true, role: true, companyId: true, status: true },
  });
  if (!target) throw new Error("user not found");
  if (target.role === "super_admin" && parsed.status === "suspended") {
    throw new Error("Suspending super-admins is not allowed via this UI.");
  }
  if (target.status === parsed.status) return;

  await prisma.user.update({
    where: { id: parsed.userId },
    data: { status: parsed.status },
  });
  await audit({
    actorId: operator.id,
    companyId: target.companyId,
    action: parsed.status === "suspended" ? "user.suspend" : "user.unsuspend",
    target: `user:${parsed.userId}`,
    metadata: { email: target.email, prior_status: target.status },
  });
  revalidatePath("/super/users");
}
