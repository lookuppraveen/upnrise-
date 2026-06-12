// Impersonation — cookie + DB-backed sessions.
//
// Model: when a super_admin starts impersonating, we create a row in
// `impersonation_sessions` and set a short-lived httpOnly cookie holding
// that session's id. `getActiveImpersonation` reads the cookie, verifies
// the session belongs to the calling operator, isn't ended, and isn't
// expired. `getSessionUser` uses it to swap the returned identity.
//
// Security notes:
//   • Cookie is httpOnly + sameSite=lax + secure in prod.
//   • Cookie is operator-scoped — we always re-verify `operatorId` against
//     the real Supabase user before honoring it.
//   • Time-boxed to MAX_AGE_SECONDS (1 hour). Past that, getActive returns
//     null; stopImpersonation cleans up the cookie.
//   • Every action while impersonating is attributed to the OPERATOR in
//     audit_log, with `impersonating: <target_user_id>` in metadata.

import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";

export const IMPERSONATION_COOKIE = "upnrise_imp";
export const IMPERSONATION_MAX_AGE_SECONDS = 60 * 60; // 1 hour

export type ActiveImpersonation = {
  sessionId: string;
  operatorId: string;
  companyId: string;
  companyName: string;
  asRole: "admin" | "trainee";
  startedAt: Date;
};

/**
 * Returns the active impersonation session for the given operator, or null
 * if none. Does NOT mutate cookies — that's the responsibility of
 * `stopImpersonation`.
 */
export async function getActiveImpersonation(
  operatorId: string,
): Promise<ActiveImpersonation | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  if (!sessionId) return null;

  const sess = await prisma.impersonationSession.findFirst({
    where: { id: sessionId, operatorId, endedAt: null },
    include: { company: { select: { id: true, name: true } } },
  });
  if (!sess) return null;

  const elapsedMs = Date.now() - sess.startedAt.getTime();
  if (elapsedMs > IMPERSONATION_MAX_AGE_SECONDS * 1000) {
    return null;
  }
  return {
    sessionId: sess.id,
    operatorId: sess.operatorId,
    companyId: sess.companyId,
    companyName: sess.company.name,
    asRole: sess.asRole as "admin" | "trainee",
    startedAt: sess.startedAt,
  };
}
