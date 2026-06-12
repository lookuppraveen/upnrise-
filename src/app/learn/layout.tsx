// Canonical role gate + shared shell for /learn/*.
// Renders the impersonation banner above the shell when a super_admin is
// acting as a trainee in this tenant.

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { ROLE_SCOPES } from "@/lib/rbac/roles";
import { signOut } from "@/app/login/actions";
import { AppShell } from "@/components/shell/AppShell";
import { LEARN_SHELL } from "@/components/shell/nav-learn";
import { ImpersonationBanner } from "@/components/shell/ImpersonationBanner";

export default async function LearnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "trainee") redirect(ROLE_SCOPES[user.role].home);

  return (
    <>
      {user.isImpersonating &&
      user.impersonatorEmail &&
      user.impersonatingCompanyName ? (
        <ImpersonationBanner
          asRole="trainee"
          companyName={user.impersonatingCompanyName}
          impersonatorEmail={user.impersonatorEmail}
        />
      ) : null}
      <AppShell
        config={LEARN_SHELL}
        email={user.email}
        pageTitle="Your learning"
        pageSubtitle="Personalized to your sessions"
        signOutAction={signOut}
      >
        {children}
      </AppShell>
    </>
  );
}
