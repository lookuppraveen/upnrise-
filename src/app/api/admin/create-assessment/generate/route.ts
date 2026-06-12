// POST /api/admin/create-assessment/generate
//
// Body: { trainingId, numberOfQuestions, scopeAndCriteria }
// Resp: { id }
//
// Companion to the "Generate" button on /modules/new/assessment.
// Calls Anthropic to draft `numberOfQuestions` MCQs framed by the
// admin's scope/criteria + the training's KB context, then persists
// a quiz module in one shot.

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { anthropic, MODEL_FAST } from "@/lib/ai/client";

const MAX_KB_CHARS = 20_000;

const Body = z.object({
  trainingId: z.string().uuid(),
  numberOfQuestions: z.number().int().min(1).max(100),
  scopeAndCriteria: z.string().trim().max(4000),
});

const QuestionSchema = z.object({
  q: z.string().min(3).max(500),
  options: z.array(z.string().min(1).max(300)).min(2).max(6),
  answer: z.number().int().min(0),
});

const DraftSchema = z.object({
  name: z.string().min(3).max(120),
  questions: z.array(QuestionSchema).min(1).max(50),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  const { trainingId, numberOfQuestions, scopeAndCriteria } = parsed.data;

  const training = await prisma.training.findFirst({
    where: { id: trainingId, companyId: user.companyId },
    select: {
      id: true,
      title: true,
      description: true,
      categories: true,
      kbSources: {
        where: { content: { not: null } },
        select: { name: true, content: true, kind: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });
  if (!training)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const kbContext = formatKbContext(training.kbSources);

  const draft = await draftAssessment({
    trainingTitle: training.title,
    trainingDescription: training.description ?? "",
    categories: training.categories,
    numberOfQuestions,
    scopeAndCriteria,
    kbContext,
  });
  if (!draft.ok)
    return NextResponse.json({ error: draft.error }, { status: 502 });

  // Drop any question whose answer index is OOB before persisting.
  const safeQuestions = draft.value.questions.filter(
    (q) => q.answer < q.options.length,
  );
  if (safeQuestions.length === 0)
    return NextResponse.json(
      { error: "AI returned no valid questions" },
      { status: 502 },
    );

  const order = await prisma.trainingModule.count({ where: { trainingId } });
  const mod = await prisma.trainingModule.create({
    data: {
      trainingId,
      name: draft.value.name,
      type: "quiz",
      order,
      published: true,
      body: {
        questions: safeQuestions,
        scopeAndCriteria,
        targetCount: numberOfQuestions,
        generationPrompt: scopeAndCriteria,
      },
    },
    select: { id: true },
  });

  revalidatePath(`/admin/trainings/${trainingId}/edit`);
  return NextResponse.json({ id: mod.id });
}

function formatKbContext(
  rows: Array<{ name: string; content: string | null; kind: string }>,
): string {
  if (rows.length === 0) return "";
  const perSource = Math.floor(MAX_KB_CHARS / rows.length);
  return rows
    .map((r) => {
      const head = `## Source: ${r.name}`;
      const body = (r.content ?? "").slice(0, perSource).trim();
      return `${head}\n${body || "(empty)"}`;
    })
    .join("\n\n");
}

async function draftAssessment(args: {
  trainingTitle: string;
  trainingDescription: string;
  categories: string[];
  numberOfQuestions: number;
  scopeAndCriteria: string;
  kbContext: string;
}): Promise<
  | { ok: true; value: z.infer<typeof DraftSchema> }
  | { ok: false; error: string }
> {
  const sys = `You write knowledge-check assessments for corporate L&D training. Output a single tool call with a short module name and exactly ${args.numberOfQuestions} multiple-choice questions. Each question must have 3–5 options, one correct, indexed by \`answer\`. Ground in the training context and KB sources when provided.`;

  const user = [
    `Training: ${args.trainingTitle}`,
    args.trainingDescription ? `Description: ${args.trainingDescription}` : "",
    args.categories.length ? `Categories: ${args.categories.join(", ")}` : "",
    `Target question count: ${args.numberOfQuestions}`,
    "",
    "Scope & criteria:",
    args.scopeAndCriteria || "(none — invent a reasonable scope from context)",
    args.kbContext ? "\nKnowledge base sources:\n" + args.kbContext : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await anthropic.messages.create({
      model: MODEL_FAST,
      max_tokens: 8000,
      system: sys,
      tools: [
        {
          name: "submit_assessment",
          description: "Submit the drafted MCQ assessment.",
          input_schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    q: { type: "string" },
                    options: {
                      type: "array",
                      items: { type: "string" },
                    },
                    answer: {
                      type: "integer",
                      description: "0-based index of the correct option",
                    },
                  },
                  required: ["q", "options", "answer"],
                },
              },
            },
            required: ["name", "questions"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "submit_assessment" },
      messages: [{ role: "user", content: user }],
    });
    const block = res.content.find((c) => c.type === "tool_use");
    if (!block || block.type !== "tool_use")
      return { ok: false, error: "no tool_use in response" };
    const parsed = DraftSchema.safeParse(block.input);
    if (!parsed.success) return { ok: false, error: "AI returned malformed draft" };
    return { ok: true, value: parsed.data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI call failed" };
  }
}
