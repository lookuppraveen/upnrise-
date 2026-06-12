// Canonical role gate + shared shell for /admin/*.
// Renders the impersonation banner above the shell when a super_admin is
// acting as an admin in this tenant.

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { ROLE_SCOPES } from "@/lib/rbac/roles";
import { signOut } from "@/app/login/actions";
import { AppShell } from "@/components/shell/AppShell";
import { ADMIN_SHELL } from "@/components/shell/nav-admin";
import { ImpersonationBanner } from "@/components/shell/ImpersonationBanner";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect(ROLE_SCOPES[user.role].home);

  return (
    <>
      {user.isImpersonating &&
      user.impersonatorEmail &&
      user.impersonatingCompanyName ? (
        <ImpersonationBanner
          asRole="admin"
          companyName={user.impersonatingCompanyName}
          impersonatorEmail={user.impersonatorEmail}
        />
      ) : null}
      <AppShell
        config={ADMIN_SHELL}
        email={user.email}
        pageTitle="Admin Console"
        pageSubtitle="Trainings, people, and engagement for your tenant"
        signOutAction={signOut}
      >
        {children}
      </AppShell>
    </>
  );
}
