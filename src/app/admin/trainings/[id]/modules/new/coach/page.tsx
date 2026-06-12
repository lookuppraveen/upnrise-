// /admin/trainings/[id]/modules/new/coach
//
// Intermediate "Create New Coach Module" page. Sister to
// /modules/new/roleplay — captures Training Usecase, Type of Coach,
// and an objective/context blurb up front, then dispatches to
// createCoachModule (manual) or /api/admin/create-coach/generate.

import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { CreateCoachPage } from "@/components/admin/CreateCoachPage";

export const dynamic = "force-dynamic";

export default async function NewCoachModuleRoute({
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
    <CreateCoachPage
      trainingId={training.id}
      trainingTitle={training.title}
    />
  );
}
