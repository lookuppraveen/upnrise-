// Canonical role gate + shared shell for /super/*.

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { ROLE_SCOPES } from "@/lib/rbac/roles";
import { signOut } from "@/app/login/actions";
import { AppShell } from "@/components/shell/AppShell";
import { SUPER_SHELL } from "@/components/shell/nav-super";

export default async function SuperLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "super_admin") redirect(ROLE_SCOPES[user.role].home);

  // Phase 1: static topbar copy. Per-page titles can land later via
  // a headers()-based pathname lookup. The page body has its own h1.
  return (
    <AppShell
      config={SUPER_SHELL}
      email={user.email}
      pageTitle="Super Admin"
      pageSubtitle="Cross-tenant platform operations"
      signOutAction={signOut}
    >
      {children}
    </AppShell>
  );
}
