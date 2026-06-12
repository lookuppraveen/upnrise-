"use server";

// Server action for the invite acceptance form. Verifies the HMAC
// token a second time (the page already did once, but never trust
// client-side state), looks up the still-invited User row, mints the
// Supabase Auth user with the SAME id as our public.users row so the
// FK identity holds across both systems, flips status to "active", and
// signs them in via the standard anon-key client so cookies land.

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db/client";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { verifyInviteToken } from "@/lib/auth/invite-token";
import { ROLE_SCOPES } from "@/lib/rbac/roles";

const InputSchema = z.object({
  token: z.string().min(1).max(2000),
  password: z.string().min(8).max(200),
});

export type AcceptInviteResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

export async function acceptInvite(
  raw: z.infer<typeof InputSchema>,
): Promise<AcceptInviteResult> {
  const parsed = InputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ") || "Invalid input.",
    };
  }
  const { token, password } = parsed.data;

  const payload = verifyInviteToken(token);
  if (!payload) {
    return {
      ok: false,
      error: "This invite link is invalid or has expired. Ask your admin for a fresh one.",
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, role: true, status: true },
  });
  if (!user) {
    return { ok: false, error: "Invite target no longer exists." };
  }
  if (user.status !== "invited") {
    return {
      ok: false,
      error:
        "This invite was already accepted. Use the login page with your password.",
    };
  }

  // Service-role client — needed for auth.admin.createUser. Inline
  // here rather than living in a shared module because this is the
  // only acceptance-time caller and the secret should stay scoped.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false,
      error:
        "Auth provider isn't configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    };
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Create the auth user with our public.users id. email_confirm:true
  // skips the verification email — the invite link already proved
  // they own the inbox (or the admin shared it directly).
  const created = await admin.auth.admin.createUser({
    id: user.id,
    email: user.email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    // Most likely cause: an auth user with that email or id already
    // exists. Surface it but don't change User.status — admin can
    // investigate and re-issue.
    return {
      ok: false,
      error: created.error?.message ?? "Couldn't create the auth account.",
    };
  }

  // Promote our row to active. This is what flips the next /login
  // redirect from "still invited" UX into a real session.
  await prisma.user.update({
    where: { id: user.id },
    data: { status: "active" },
  });

  await audit({
    actorId: user.id,
    companyId: null,
    action: "user.invite.accept",
    target: `user:${user.id}`,
    metadata: { role: user.role },
  });

  // Sign them in immediately so they land in the app, not on /login.
  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (signInError) {
    // Activation succeeded but auto-sign-in failed (rare — usually
    // a cookie-set issue). Send them to /login with the right email
    // pre-filled-via-query so they can finish manually.
    return {
      ok: true,
      redirectTo: `/login?email=${encodeURIComponent(user.email)}&accepted=1`,
    };
  }

  return { ok: true, redirectTo: ROLE_SCOPES[user.role].home };
}

// Thin wrapper used by the form: lets the client call the action,
// then perform the redirect server-side so cookies set above are
// preserved. We can't redirect() inside the data-returning version
// without throwing in the client.
export async function acceptInviteAndRedirect(
  raw: z.infer<typeof InputSchema>,
): Promise<{ error: string } | never> {
  const result = await acceptInvite(raw);
  if (!result.ok) return { error: result.error };
  redirect(result.redirectTo);
}
