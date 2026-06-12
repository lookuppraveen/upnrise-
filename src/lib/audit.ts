// Audit log helper. Use from server actions / route handlers to record
// admin and super_admin actions for the Activities page + super-admin
// Support & Audit screen.
//
// Impersonation: when called inside an impersonation context, the audit
// row is attributed to the OPERATOR (the real super_admin) — not to the
// impersonated user — and the metadata records who they were acting as.
// This is the security property that makes "act as" forensically clean.

import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { IMPERSONATION_COOKIE } from "@/lib/auth/impersonation";

export async function audit(args: {
  /** Typically `(await getSessionUser()).id`. May be the impersonated id during a session — we resolve to the operator below. */
  actorId: string;
  companyId: string | null;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
}) {
  let realActorId = args.actorId;
  let extra: Record<string, unknown> = {};

  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(IMPERSONATION_COOKIE)?.value;
    if (sessionId) {
      // Verify against the real Supabase auth user — we trust nothing else.
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.auth.getUser();
      const realAuthId = data.user?.id;
      if (realAuthId) {
        const sess = await prisma.impersonationSession.findFirst({
          where: { id: sessionId, operatorId: realAuthId, endedAt: null },
          select: { operatorId: true, asRole: true, companyId: true },
        });
        if (sess) {
          realActorId = sess.operatorId;
          extra = {
            impersonating: args.actorId,
            impersonating_role: sess.asRole,
            impersonation_session: sessionId,
          };
        }
      }
    }
  } catch {
    // Not in a request context, or cookies unavailable — skip detection.
  }

  try {
    await prisma.auditLog.create({
      data: {
        actorId: realActorId,
        companyId: args.companyId,
        action: args.action,
        target: args.target ?? null,
        metadata: { ...(args.metadata ?? {}), ...extra } as object,
      },
    });
  } catch {
    // Never break the calling action.
  }
}
