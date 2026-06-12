"use server";

// Server actions for the login form. Sign-in uses the anon-key client so the
// session cookie is set correctly; sign-out clears it.
//
// On success we redirect to the role-appropriate home (resolved from our
// public.users row, not from the Supabase JWT — see lib/auth/session.ts).

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { prisma } from "@/lib/db/client";
import { ROLE_SCOPES } from "@/lib/rbac/roles";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password required." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { error: error?.message ?? "Invalid credentials." };
  }

  // Look up role and redirect to the right surface.
  const row = await prisma.user.findUnique({
    where: { id: data.user.id },
    select: { role: true },
  });

  if (!row) {
    // Auth user exists but no public.users row — admin will need to seed.
    return {
      error:
        "Account exists in auth but not in users table. Contact an admin.",
    };
  }

  redirect(ROLE_SCOPES[row.role].home);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
