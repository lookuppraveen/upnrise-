// Admin · Assignments  (01_ADMIN.md §Assignments)
//
// Server fetches assignments + computed status/progress and hands off to
// the client view. Filter/search is client-side because the typical
// roster is in the hundreds at most, and instant filter beats a URL
// roundtrip per keystroke.

import { getSessionUser } from "@/lib/auth/session";
import { listAssignmentsForCompany } from "@/lib/db/queries";
import {
  AdminAssignmentsView,
  type AdminAssignmentRow,
} from "@/components/admin/AdminAssignmentsView";

export default async function AdminAssignmentsPage() {
  const user = (await getSessionUser())!;
  if (!user.companyId) return null;

  const rows = await listAssignmentsForCompany(user.companyId);
  const view: AdminAssignmentRow[] = rows.map((r) => ({
    id: r.id,
    priority: r.priority as "p1" | "p2" | "p3",
    status: r.status,
    computedStatus: r.computedStatus,
    computedProgress: r.computedProgress,
    overdue: r.overdue,
    dueAt: r.dueAt,
    aiReason: r.aiReason,
    user: r.user,
    training: r.training,
  }));

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1280px]">
      <AdminAssignmentsView rows={view} />
    </div>
  );
}
