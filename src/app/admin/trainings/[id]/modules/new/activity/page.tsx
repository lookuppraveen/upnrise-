// /admin/trainings/[id]/modules/new/activity
//
// Intermediate "Create New Activity Module" page. Same shape as the
// sibling /modules/new/{roleplay,coach,assessment} routes — captures
// a duration preset + learning-goals prompt before persisting the
// gamified module via createActivityModule (manual) or
// /api/admin/create-activity/generate.

import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { CreateActivityPage } from "@/components/admin/CreateActivityPage";

export const dynamic = "force-dynamic";

export default async function NewActivityModuleRoute({
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
    <CreateActivityPage
      trainingId={training.id}
      trainingTitle={training.title}
    />
  );
}
