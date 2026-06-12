"use server";

// Materialization actions for the Generate-with-AI flow.
// The /api/admin/generate endpoint returns a preview; these actions persist
// what the admin chooses to keep. The full module bodies (video script,
// quiz questions, document markdown) returned by the API land directly
// into TrainingModule.body so trainees can see them immediately and the
// avatar render pipeline has a script to read.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

const PLACEHOLDER_RUBRIC = {
  pass_score: 70,
  criteria: [
    {
      id: "discovery",
      label: "Discovery",
      weight: 0.5,
      description: "Asked open-ended questions to surface the buyer's problem.",
    },
    {
      id: "next_step",
      label: "Next step",
      weight: 0.5,
      description: "Closed with a concrete, time-boxed next action.",
    },
  ],
};

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    throw new Error("forbidden");
  }
  return user;
}

const VideoBody = z.object({
  videoScript: z.string().min(1).max(8000),
  duration_min: z.number().int().min(1).max(60),
});
const QuizQuestion = z.object({
  q: z.string().min(1).max(500),
  options: z.array(z.string().min(1).max(300)).min(2).max(8),
  answer: z.number().int().min(0),
});
const QuizBody = z.object({
  questions: z.array(QuizQuestion).min(1).max(50),
});
const DocumentBody = z.object({
  markdown: z.string().min(1).max(20000),
});

const ModuleDraft = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("video"),
    name: z.string().min(1).max(200),
    body: VideoBody,
  }),
  z.object({
    type: z.literal("roleplay"),
    name: z.string().min(1).max(200),
    persona: z.string().max(800).optional(),
    scenario: z.string().max(800).optional(),
  }),
  z.object({
    type: z.literal("quiz"),
    name: z.string().min(1).max(200),
    body: QuizBody,
  }),
  z.object({
    type: z.literal("document"),
    name: z.string().min(1).max(200),
    body: DocumentBody,
  }),
]);

const TrainingDraft = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  categories: z.array(z.string().min(1).max(40)).max(10),
  modules: z.array(ModuleDraft).min(1).max(10),
});

export async function saveGeneratedTraining(
  data: z.infer<typeof TrainingDraft>,
) {
  const user = await requireAdmin();
  const parsed = TrainingDraft.parse(data);

  const training = await prisma.training.create({
    data: {
      companyId: user.companyId!,
      title: parsed.title,
      description: parsed.description,
      categories: parsed.categories,
      status: "draft",
    },
    select: { id: true },
  });

  for (let i = 0; i < parsed.modules.length; i++) {
    const m = parsed.modules[i];
    // Bodies are written for non-roleplay modules; roleplay uses its
    // own RoleplayConfig table seeded with a placeholder rubric below.
    const body =
      m.type === "video"
        ? {
            videoScript: m.body.videoScript,
            duration_min: m.body.duration_min,
          }
        : m.type === "quiz"
          ? { questions: m.body.questions }
          : m.type === "document"
            ? { markdown: m.body.markdown }
            : null;

    const mod = await prisma.trainingModule.create({
      data: {
        trainingId: training.id,
        name: m.name,
        type: m.type,
        order: i,
        published: true,
        body: body ?? undefined,
      },
      select: { id: true, type: true },
    });
    if (mod.type === "roleplay") {
      await prisma.roleplayConfig.create({
        data: {
          moduleId: mod.id,
          persona:
            m.type === "roleplay" && m.persona
              ? m.persona
              : "A buyer at a mid-sized company. Replace as needed.",
          scenario:
            m.type === "roleplay" && m.scenario
              ? m.scenario
              : "Replace this with the scenario the learner faces.",
          mode: "text",
          rubric: PLACEHOLDER_RUBRIC,
        },
      });
    }
  }

  revalidatePath("/admin/trainings");
  redirect(`/admin/trainings/${training.id}/edit?step=2`);
}

const DictionaryDraft = z.object({
  terms: z
    .array(
      z.object({
        term: z.string().min(1).max(80),
        definition: z.string().min(2).max(1000),
      }),
    )
    .min(1)
    .max(20),
});

export async function saveGeneratedDictionary(
  data: z.infer<typeof DictionaryDraft>,
) {
  const user = await requireAdmin();
  const parsed = DictionaryDraft.parse(data);

  for (const t of parsed.terms) {
    await prisma.dictionaryTerm.upsert({
      where: {
        companyId_term: { companyId: user.companyId!, term: t.term },
      },
      update: { definition: t.definition },
      create: { ...t, companyId: user.companyId! },
    });
  }

  revalidatePath("/admin/dictionary");
  revalidatePath("/learn/dictionary");
  redirect("/admin/dictionary");
}
