// /admin/trainings/[id]/modules/new/assessment
//
// Intermediate "Create New Assessment Module" page. Same shape as
// /modules/new/roleplay and /modules/new/coach — captures the
// question count + scope/criteria up front before persisting the
// quiz module via createAssessmentModule (manual) or
// /api/admin/create-assessment/generate.

import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { CreateAssessmentPage } from "@/components/admin/CreateAssessmentPage";

export const dynamic = "force-dynamic";

export default async function NewAssessmentModuleRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    redirect("/login");
  }

  const training = await prisma.training.findFirst({
    where: { id, companyId: user.companyId },
    select: { id: true, title: true },
  });
  if (!training) notFound();

  return (
    <CreateAssessmentPage
      trainingId={training.id}
      trainingTitle={training.title}
    />
  );
}
