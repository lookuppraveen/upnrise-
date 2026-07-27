// Trainee · Trainings list  (03_TRAINEE.md §Trainings list)
//
// Server splits published trainings into Newly Added (last NEW_DAYS) vs
// Others, computes per-training progress, and hands off to the client
// TrainingsCatalog which renders the prototype.css .scen-card grid with
// search filter and the accent-orange section headers from the screenshot.

import { getSessionUser } from "@/lib/auth/session";
import {
  listTrainingsForCompany,
  getTrainingProgressForManyForUser,
} from "@/lib/db/queries";
import { Card } from "@/components/ui/Card";
import {
  TrainingsCatalog,
  type CatalogItem,
} from "@/components/learn/TrainingsCatalog";

const NEW_DAYS = 30;

export default async function TrainingsList() {
  const user = (await getSessionUser())!;
  if (!user.companyId) {
    return <EmptyState reason="no_tenant" />;
  }
  const trainings = await listTrainingsForCompany(user.companyId);

  // Previously fired N × 3 queries (one getTrainingProgressForUser per
  // training). Now: three total queries, one groupBy + one findMany +
  // one module fetch, no matter how many trainings the tenant has.
  const progressByTraining = await getTrainingProgressForManyForUser(
    user.id,
    trainings.map((t) => t.id),
  );

  const withProgress: CatalogItem[] = trainings.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    categories: t.categories,
    thumbnailUrl: t.thumbnailUrl,
    progress: progressByTraining.get(t.id) ?? 0,
    _count: t._count,
  }));

  const cutoff = Date.now() - NEW_DAYS * 24 * 60 * 60 * 1000;
  const newlyAdded = withProgress.filter(
    (_, i) => +trainings[i].createdAt >= cutoff,
  );
  const others = withProgress.filter(
    (_, i) => +trainings[i].createdAt < cutoff,
  );

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1180px]">
      <TrainingsCatalog
        newlyAdded={newlyAdded}
        others={others}
        totalCount={trainings.length}
      />
    </div>
  );
}

function EmptyState({ reason }: { reason: "no_tenant" }) {
  return (
    <div className="px-7 py-8 max-w-[820px]">
      <Card pad="lg">
        <h2 className="font-display text-[22px]">No tenant assigned</h2>
        <p className="text-ink-2 text-[13px] mt-2">
          {reason === "no_tenant"
            ? "Your account isn't linked to a company. Contact an admin."
            : null}
        </p>
      </Card>
    </div>
  );
}
