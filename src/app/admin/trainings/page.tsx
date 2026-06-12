// Admin · Trainings list  (01_ADMIN.md §Trainings)
//
// Server fetches the full tenant catalog + picks the most recent draft for
// the "Recent draft" Copilot card, then hands off to the client view which
// owns tab+search state and renders the rich gradient-thumb cards.

import { getSessionUser } from "@/lib/auth/session";
import { listTrainingsForAdmin } from "@/lib/db/queries";
import {
  AdminTrainingsView,
  type AdminTrainingItem,
  type CopilotDraft,
} from "@/components/admin/AdminTrainingsView";

export default async function AdminTrainings() {
  const user = (await getSessionUser())!;
  if (!user.companyId) return null;

  const all = await listTrainingsForAdmin(user.companyId);

  const trainings: AdminTrainingItem[] = all.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    categories: t.categories,
    status: t.status,
    houseStyleMatch: t.houseStyleMatch,
    learnerCount: t.learnerCount,
    completionPct: t.completionPct,
    _count: t._count,
    updatedAt: t.updatedAt,
  }));

  // Most recent draft (if any) drives the Recent-draft Copilot card.
  // Trainings are returned ordered by updatedAt desc, so the first draft
  // in the list is the freshest.
  const recentDraftItem = trainings.find((t) => t.status === "draft");
  const copilotDraft: CopilotDraft = recentDraftItem
    ? {
        id: recentDraftItem.id,
        title: recentDraftItem.title,
        modules: recentDraftItem._count.modules,
        houseStyleMatch: recentDraftItem.houseStyleMatch,
        updatedAt: recentDraftItem.updatedAt,
      }
    : null;

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1200px]">
      <AdminTrainingsView
        trainings={trainings}
        copilotDraft={copilotDraft}
      />
    </div>
  );
}
