// /admin/trainings/[id]/modules/[mid]/edit (PDF p11+)
//
// Per-module routed edit page that replaces the in-wizard
// ModuleEditModal. Loads the training + module + roleplay config
// server-side and hands off to ModuleEditPage for the client UI.

import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { ModuleEditPage } from "@/components/admin/ModuleEditPage";
import { PROVIDER_SUPPORTS_STREAMING } from "@/lib/video";

export const dynamic = "force-dynamic";

export default async function ModuleEditRoute({
  params,
}: {
  params: Promise<{ id: string; mid: string }>;
}) {
  const { id, mid } = await params;
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    redirect("/login");
  }

  const training = await prisma.training.findFirst({
    where: { id, companyId: user.companyId },
    select: {
      id: true,
      title: true,
      companyId: true,
      modules: {
        where: { id: mid },
        include: { roleplayConfig: true },
      },
    },
  });
  if (!training || training.modules.length === 0) notFound();
  const m = training.modules[0];

  const [defaultProvider, portraits] = await Promise.all([
    prisma.videoProvider.findFirst({
      where: { companyId: training.companyId, isDefault: true },
      select: { kind: true },
    }),
    prisma.didPortrait.findMany({
      where: { companyId: training.companyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        label: true,
        sourceUrl: true,
        displayUrl: true,
        voiceId: true,
        voiceName: true,
      },
    }),
  ]);

  return (
    <ModuleEditPage
      trainingId={training.id}
      trainingTitle={training.title}
      module={{
        id: m.id,
        name: m.name,
        type: m.type,
        published: m.published,
        aiScore: m.aiScore,
        updatedAt: m.updatedAt,
        body:
          m.body && typeof m.body === "object" && !Array.isArray(m.body)
            ? (m.body as Record<string, unknown>)
            : null,
        roleplayConfig: m.roleplayConfig
          ? {
              persona: m.roleplayConfig.persona,
              scenario: m.roleplayConfig.scenario,
            }
          : null,
      }}
      hasDefaultVideoProvider={Boolean(defaultProvider)}
      tenantStreamingProvider={
        defaultProvider
          ? {
              kind: defaultProvider.kind,
              supportsStreaming:
                PROVIDER_SUPPORTS_STREAMING[defaultProvider.kind],
            }
          : null
      }
      savedPortraits={portraits}
    />
  );
}
