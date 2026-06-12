// Admin · Employees  (01_ADMIN.md §Employees)
//
// Roster of users in this tenant. Server fetches the employee list with
// per-user stats and hands off to the client EmployeesView for tabs +
// search + filtering. KPI strip and AI-nudge banner are derived
// client-side from real lastActive / createdAt fields.

import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { listEmployeesForCompany } from "@/lib/db/queries";
import {
  EmployeesView,
  type EmployeeRow,
  type TeamOption,
} from "@/components/admin/EmployeesView";
import type { ManagerOption } from "@/components/admin/AddTraineeModal";

export default async function EmployeesPage() {
  const user = (await getSessionUser())!;
  if (!user.companyId) return null;

  const [employees, teams, managers] = await Promise.all([
    listEmployeesForCompany(user.companyId),
    prisma.team.findMany({
      where: { companyId: user.companyId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // Manager candidates = company admins (and the super_admin if there
    // is one in the tenant). Trainees can't be managers.
    prisma.user.findMany({
      where: {
        companyId: user.companyId,
        role: { in: ["admin", "super_admin"] },
      },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
  ]);

  const rows: EmployeeRow[] = employees
    .filter(
      (e): e is typeof e & { role: "admin" | "trainee" } =>
        e.role === "admin" || e.role === "trainee",
    )
    .map((e) => ({
      id: e.id,
      email: e.email,
      name: e.name,
      role: e.role,
      status: e.status,
      lastActive: e.lastActive,
      createdAt: e.createdAt,
      sessions: e.sessions,
      avgScore: e.avgScore,
      assignments: e.assignments,
      team: e.team,
    }));

  const teamOptions: TeamOption[] = teams.map((t) => ({
    id: t.id,
    name: t.name,
  }));
  // Exclude the current admin from their own "Reporting manager"
  // dropdown — they can't be their own manager.
  const managerOptions: ManagerOption[] = managers
    .filter((m) => m.id !== user.id)
    .map((m) => ({
      id: m.id,
      name: m.name ?? "",
      email: m.email,
    }));

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1280px]">
      <EmployeesView
        employees={rows}
        teams={teamOptions}
        managers={managerOptions}
      />
    </div>
  );
}
