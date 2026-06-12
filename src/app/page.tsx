// Root → role-aware redirect.
//   • Not authed → /login (handled by middleware before we get here)
//   • Authed    → role-home from ROLE_SCOPES

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { ROLE_SCOPES } from "@/lib/rbac/roles";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(ROLE_SCOPES[user.role].home);
}
