// /admin/trainings/[id]/modules/new/roleplay
//
// Intermediate "Create New Roleplay Module" page that runs between the
// "+ Add New Module → Roleplay" dropdown click in Step 2 and the
// per-module edit page. Captures Person 1 / Person 2 / Context up
// front so the new module starts with real values instead of
// placeholder copy.

import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { CreateRoleplayPage } from "@/components/admin/CreateRoleplayPage";

export const dynamic = "force-dynamic";

export default async function NewRoleplayModuleRoute({
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
    <CreateRoleplayPage
      trainingId={training.id}
      trainingTitle={training.title}
    />
  );
}
