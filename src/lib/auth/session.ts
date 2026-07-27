// Resolves the current Supabase auth user to our `public.users` row (with
// role + companyId). Cached per request via React.cache.
//
// Impersonation: if the real user is a super_admin AND has an active
// impersonation session, this returns the IMPERSONATED user's identity
// instead (so layouts/queries scoped by role + tenant see the right data),
// plus impersonation-context flags. The real super_admin id is preserved
// in `impersonatorId` for audit/UI use.
//
// A previous iteration wrapped the Prisma lookups in `unstable_cache` to
// dedupe across navigations. That broke in production because Vercel's
// cache handler serialized Date fields to strings; anything downstream
// that called `.getTime()` on a User field crashed. Reverted to the
// simpler React.cache-only version below.

import { cache } from "react";
import { createSupabaseServerClient } from "./supabase-server";
import { prisma } from "@/lib/db/client";
import type { Role } from "@/lib/rbac/roles";
import { getActiveImpersonation } from "./impersonation";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  companyId: string | null;
  // Impersonation context (set only while a super_admin is impersonating).
  isImpersonating?: boolean;
  impersonatorId?: string;
  impersonatorEmail?: string;
  impersonationSessionId?: string;
  impersonatingCompanyName?: string;
};

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const realUser = await prisma.user.findUnique({
    where: { id: data.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      companyId: true,
    },
  });
  if (!realUser) return null;

  // Only super_admins can have an active impersonation.
  if (realUser.role === "super_admin") {
    const imp = await getActiveImpersonation(realUser.id);
    if (imp) {
      // Pick any user in the target tenant with the matching role. The
      // identity matters less than the role+tenant scoping; multiple admins
      // share the same permissions.
      const target = await prisma.user.findFirst({
        where: { companyId: imp.companyId, role: imp.asRole },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          companyId: true,
        },
      });
      if (target) {
        return {
          ...target,
          isImpersonating: true,
          impersonatorId: realUser.id,
          impersonatorEmail: realUser.email,
          impersonationSessionId: imp.sessionId,
          impersonatingCompanyName: imp.companyName,
        } as SessionUser;
      }
    }
  }

  return realUser as SessionUser;
});
