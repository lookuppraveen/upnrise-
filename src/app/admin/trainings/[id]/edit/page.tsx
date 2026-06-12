// Admin · Add Training wizard.
//
// Single page handles all 4 steps via ?step= query param. Server-renders
// the appropriate Step component with the data it needs.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { Icon } from "@/components/ui/Icon";
import { Stepper } from "@/components/admin/wizard/Stepper";
import { StepBasic } from "@/components/admin/wizard/StepBasic";
import { StepModules } from "@/components/admin/wizard/StepModules";
import { StepAssign } from "@/components/admin/wizard/StepAssign";
import { StepSettings } from "@/components/admin/wizard/StepSettings";

export const dynamic = "force-dynamic";

export default async function WizardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const stepRaw = Number(sp.step ?? "1");
  const step = stepRaw >= 1 && stepRaw <= 4 ? stepRaw : 1;

  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) notFound();

  const training = await prisma.training.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: { roleplayConfig: true },
      },
      assignments: { select: { userId: true, priority: true, dueAt: true } },
    },
  });
  if (!training) notFound();

  // Step 1 needs the KB lists; Step 2 needs the QB items. Loading them
  // outside the conditional so the wizard render path stays simple;
  // the lists are cheap.
  const [attachedKb, libraryKb, qbItems] = await Promise.all([
    prisma.kbSource.findMany({
      where: { companyId: user.companyId, trainingId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        kind: true,
        name: true,
        size: true,
        sourceUrl: true,
        createdAt: true,
      },
    }),
    prisma.kbSource.findMany({
      where: { companyId: user.companyId, trainingId: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, kind: true, name: true, size: true, sourceUrl: true },
    }),
    prisma.questionBankItem.findMany({
      where: { companyId: user.companyId, trainingId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        kind: true,
        question: true,
        options: true,
        answer: true,
        tags: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <div className="px-6 py-8 max-w-[960px] space-y-6">
      <div className="space-y-3">
        <Link
          href="/admin/trainings"
          className="inline-flex items-center gap-1 text-[12.5px] text-ink-2 hover:text-ink"
        >
          <Icon name="chevron-right" size={14} className="rotate-180" />
          Back to Trainings
        </Link>
        <header className="space-y-1">
          <h1 className="font-display text-[28px] leading-[1.05] -tracking-[0.015em]">
            {training.title === "Untitled training"
              ? "New training"
              : training.title}
          </h1>
          <p className="text-ink-2 text-[13px]">
            Step {step} of 4 · status:{" "}
            <span className="uppercase tracking-[0.08em] font-mono text-[11px]">
              {training.status}
            </span>
          </p>
        </header>
        <Stepper trainingId={training.id} current={step} />
      </div>

      {step === 1 ? (
        <StepBasic
          training={{
            id: training.id,
            title: training.title,
            description: training.description,
            categories: training.categories,
            thumbnailUrl: training.thumbnailUrl,
          }}
          attachedKbSources={attachedKb.map((s) => ({
            id: s.id,
            kind: s.kind,
            name: s.name,
            size: s.size,
            sourceUrl: s.sourceUrl,
            createdAt: s.createdAt.toISOString(),
          }))}
          libraryKbSources={libraryKb.map((s) => ({
            id: s.id,
            kind: s.kind,
            name: s.name,
            size: s.size,
            sourceUrl: s.sourceUrl,
          }))}
        />
      ) : step === 2 ? (
        <StepModules
          trainingId={training.id}
          trainingTitle={training.title}
          questionBankItems={qbItems}
          modules={training.modules.map((m) => ({
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
          }))}
          hasDefaultVideoProvider={
            (await prisma.videoProvider.count({
              where: { companyId: training.companyId, isDefault: true },
            })) > 0
          }
        />
      ) : step === 3 ? (
        await renderAssign(training)
      ) : (
        await renderSettings(training)
      )}
    </div>
  );
}

async function renderAssign(training: {
  id: string;
  companyId: string;
  assignments: Array<{
    userId: string;
    priority: "p1" | "p2" | "p3";
    dueAt: Date | null;
  }>;
}) {
  const rows = await prisma.user.findMany({
    where: { companyId: training.companyId, role: "trainee" },
    select: {
      id: true,
      email: true,
      name: true,
      employeeCode: true,
      zone: true,
      designation: true,
      department: true,
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  return (
    <StepAssign
      trainingId={training.id}
      trainees={rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        employeeCode: r.employeeCode,
        zone: r.zone,
        designation: r.designation,
        department: r.department,
        role: "Trainee",
      }))}
      initialAssignedIds={training.assignments.map((a) => a.userId)}
    />
  );
}

type SettingsTraining = {
  id: string;
  companyId: string;
  title: string;
  status: "draft" | "published" | "archived";
  visibility: "private" | "org_wide" | "public";
  prerequisiteIds: string[];
  selfEnrollment: boolean;
  startAt: Date | null;
  dueAt: Date | null;
  repeat: "never" | "weekly" | "monthly" | "quarterly";
  issueCertificate: boolean;
  passingScore: number;
  rewardPoints: number;
  adaptiveDifficulty: boolean;
  liveCoachTips: boolean;
  followUpNudges: boolean;
  feedbackTone: "soft" | "balanced" | "direct";
  modules: Array<{ published: boolean }>;
  assignments: Array<unknown>;
};

async function renderSettings(training: SettingsTraining) {
  const candidates = await prisma.training.findMany({
    where: {
      companyId: training.companyId,
      id: { not: training.id },
      status: { not: "archived" },
    },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });

  return (
    <StepSettings
      trainingId={training.id}
      prerequisiteCandidates={candidates}
      summary={{
        title: training.title,
        moduleCount: training.modules.length,
        publishedModuleCount: training.modules.filter((m) => m.published).length,
        assignmentCount: training.assignments.length,
        status: training.status,
      }}
      initial={{
        visibility: training.visibility,
        prerequisiteIds: training.prerequisiteIds,
        selfEnrollment: training.selfEnrollment,
        startAt:
          training.startAt != null
            ? training.startAt.toISOString().slice(0, 10)
            : null,
        dueAt:
          training.dueAt != null
            ? training.dueAt.toISOString().slice(0, 10)
            : null,
        repeat: training.repeat,
        issueCertificate: training.issueCertificate,
        passingScore: training.passingScore,
        rewardPoints: training.rewardPoints,
        adaptiveDifficulty: training.adaptiveDifficulty,
        liveCoachTips: training.liveCoachTips,
        followUpNudges: training.followUpNudges,
        feedbackTone: training.feedbackTone,
      }}
    />
  );
}
