// Resolves the current Supabase auth user to our `public.users` row (with
// role + companyId). Cached per request via React.cache AND across requests
// via unstable_cache keyed on the auth id.
//
// Impersonation: if the real user is a super_admin AND has an active
// impersonation session, this returns the IMPERSONATED user's identity
// instead (so layouts/queries scoped by role + tenant see the right data),
// plus impersonation-context flags. The real super_admin id is preserved
// in `impersonatorId` for audit/UI use.
//
// Cache layering:
//   - `cache()` (react) — dedupes within a single render tree
//   - `unstable_cache` — persists across navigations for a short TTL
//
// The auth-id and impersonation lookup happen OUTSIDE the cached function
// (unstable_cache can't read cookies), then the cheap-per-hit DB lookups
// are cached under the tag `session:user:${authId}`. Sign-out / impersona-
// tion start/stop invalidate the tag.

import { cache } from "react";
import { unstable_cache } from "next/cache";
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

// Per-authId DB lookup, cached for a short TTL. The auth id is baked into
// the cache key (unstable_cache args) so different users get different
// entries. A coarse `session:users` tag lets us blow the whole set away
// on sign-out / impersonation changes without tracking per-user tags.
const getUserByAuthIdCached = unstable_cache(
  async (authId: string) => {
    return prisma.user.findUnique({
      where: { id: authId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
      },
    });
  },
  ["session:user"],
  { revalidate: 60, tags: ["session:users"] },
);

// Per-tenant + role lookup for impersonation. Any admin/trainee in the
// target tenant will do — the identity matters less than the role+tenant
// scoping.
const getImpersonationTargetCached = unstable_cache(
  async (companyId: string, asRole: Role) => {
    return prisma.user.findFirst({
      where: { companyId, role: asRole },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
      },
    });
  },
  ["session:impersonation-target"],
  { revalidate: 60, tags: ["session:users"] },
);

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const authId = data.user.id;

  // Layered: DB user row is cached (rarely changes); the auth check +
  // impersonation state are not (cookies + short-lived rows).
  const realUser = await getUserByAuthIdCached(authId);
  if (!realUser) return null;

  // Only super_admins can have an active impersonation.
  if (realUser.role === "super_admin") {
    const imp = await getActiveImpersonation(realUser.id);
    if (imp) {
      const target = await getImpersonationTargetCached(imp.companyId, imp.asRole);
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

/**
 * Invalidate all cached session-user rows. Call after any mutation that
 * changes `public.users` (role change, company move, sign-out, name/email
 * edit) or after impersonation start/stop. Coarse — dumps every entry —
 * but the TTL is only 60s and hit rate stays high in practice.
 */
export async function invalidateSessionUsers() {
  const { revalidateTag } = await import("next/cache");
  revalidateTag("session:users", "max");
}
