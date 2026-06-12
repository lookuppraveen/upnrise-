// /admin/trainings/generator
//
// Routed version of the "What would you like to create today?" surface.
// Wraps GeneratorConsole inside the admin shell so the sidebar + topbar
// stay visible (PDF p4-p7). The "+ Add Training" button on the
// trainings list links here.

import { getSessionUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { GeneratorConsole } from "@/components/admin/GeneratorConsole";

export const dynamic = "force-dynamic";

export default async function GeneratorPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    redirect("/login");
  }
  return <GeneratorConsole />;
}
