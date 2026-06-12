// POST /api/admin/regenerate-assessment
//
// Body: { trainingId, moduleId, scopeAndCriteria, numberOfQuestions }
// Resp: { name, questions[] }
//
// Per-module regenerate pass for a quiz module. Returns the draft so
// the admin can preview before saving; the standard saveAssessment
// path is how the changes hit the DB.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { anthropic, MODEL_FAST } from "@/lib/ai/client";

const MAX_KB_CHARS = 20_000;

const Body = z.object({
  trainingId: z.string().uuid(),
  moduleId: z.string().uuid(),
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
  const { trainingId, moduleId, numberOfQuestions, scopeAndCriteria } =
    parsed.data;

  const mod = await prisma.trainingModule.findFirst({
    where: {
      id: moduleId,
      trainingId,
      type: "quiz",
      training: { companyId: user.companyId },
    },
    select: {
      id: true,
      training: {
        select: {
          title: true,
          description: true,
          categories: true,
          kbSources: {
            where: { content: { not: null } },
            select: { name: true, content: true },
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
      },
    },
  });
  if (!mod)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const kbContext = formatKbContext(mod.training.kbSources);

  const sys = `You write knowledge-check assessments for corporate L&D training. Output a single tool call with a short module name and exactly ${numberOfQuestions} multiple-choice questions. Each question must have 3–5 options, one correct, indexed by \`answer\`. Ground in the training context and KB sources when provided.`;

  const userPrompt = [
    `Training: ${mod.training.title}`,
    mod.training.description ? `Description: ${mod.training.description}` : "",
    mod.training.categories.length
      ? `Categories: ${mod.training.categories.join(", ")}`
      : "",
    `Target question count: ${numberOfQuestions}`,
    "",
    "Scope & criteria:",
    scopeAndCriteria || "(none — invent a reasonable scope from context)",
    kbContext ? "\nKnowledge base sources:\n" + kbContext : "",
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
          description: "Submit the regenerated MCQ assessment.",
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
                    options: { type: "array", items: { type: "string" } },
                    answer: { type: "integer" },
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
      messages: [{ role: "user", content: userPrompt }],
    });
    const block = res.content.find((c) => c.type === "tool_use");
    if (!block || block.type !== "tool_use")
      return NextResponse.json(
        { error: "no tool_use in response" },
        { status: 502 },
      );
    const parsedDraft = DraftSchema.safeParse(block.input);
    if (!parsedDraft.success)
      return NextResponse.json(
        { error: "AI returned malformed draft" },
        { status: 502 },
      );
    // Drop any answer index that overshoots its options array.
    const safe = parsedDraft.data.questions.filter(
      (q) => q.answer < q.options.length,
    );
    if (safe.length === 0)
      return NextResponse.json(
        { error: "AI returned no valid questions" },
        { status: 502 },
      );
    return NextResponse.json({ name: parsedDraft.data.name, questions: safe });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI call failed" },
      { status: 502 },
    );
  }
}

function formatKbContext(
  rows: Array<{ name: string; content: string | null }>,
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
