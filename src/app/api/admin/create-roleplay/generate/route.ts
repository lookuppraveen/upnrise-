// POST /api/admin/create-roleplay/generate
//
// Body: { trainingId, person1, person2, context }
// Resp: { id }
//
// Companion to the "Generate" button on the /modules/new/roleplay
// intermediate page. Calls Anthropic with the admin's brief inputs to
// flesh out a real persona + scenario, then persists a roleplay module
// + RoleplayConfig in one transaction so the client can route straight
// to the per-module edit page.

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { anthropic, MODEL_FAST } from "@/lib/ai/client";

const Body = z.object({
  trainingId: z.string().min(1).max(100),
  person1: z.string().trim().max(500),
  person2: z.string().trim().max(500),
  context: z.string().trim().max(4000),
});

const DraftSchema = z.object({
  name: z.string().min(3).max(120),
  persona: z.string().min(20).max(1200),
  scenario: z.string().min(20).max(1200),
});

const PLACEHOLDER_RUBRIC = {
  pass_score: 70,
  criteria: [
    {
      id: "discovery",
      label: "Discovery",
      weight: 0.5,
      description:
        "Asked open-ended questions to surface the buyer's problem.",
    },
    {
      id: "next_step",
      label: "Next step",
      weight: 0.5,
      description: "Closed with a concrete, time-boxed next action.",
    },
  ],
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "bad body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  const { trainingId, person1, person2, context } = parsed.data;

  const training = await prisma.training.findFirst({
    where: { id: trainingId, companyId: user.companyId },
    select: { id: true, title: true, description: true, categories: true },
  });
  if (!training)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const p1 = person1 || "Sales Rep";
  const p2 = person2 || "Customer";

  // AI draft
  const draft = await draftRoleplay({
    trainingTitle: training.title,
    trainingDescription: training.description ?? "",
    categories: training.categories,
    person1: p1,
    person2: p2,
    context,
  });
  if (!draft.ok)
    return NextResponse.json({ error: draft.error }, { status: 502 });

  const order = await prisma.trainingModule.count({ where: { trainingId } });
  const mod = await prisma.trainingModule.create({
    data: {
      trainingId,
      name: draft.value.name,
      type: "roleplay",
      order,
      published: true,
      body: { person1: p1, person2: p2, context, generationPrompt: context },
    },
    select: { id: true },
  });
  await prisma.roleplayConfig.create({
    data: {
      moduleId: mod.id,
      persona: draft.value.persona,
      scenario: draft.value.scenario,
      mode: "text",
      rubric: PLACEHOLDER_RUBRIC,
    },
  });

  revalidatePath(`/admin/trainings/${trainingId}/edit`);
  return NextResponse.json({ id: mod.id });
}

async function draftRoleplay(args: {
  trainingTitle: string;
  trainingDescription: string;
  categories: string[];
  person1: string;
  person2: string;
  context: string;
}): Promise<
  | { ok: true; value: z.infer<typeof DraftSchema> }
  | { ok: false; error: string }
> {
  const sys = `You design roleplay scenarios for corporate L&D training. Output a single tool call with name, persona (one paragraph describing Person 2 / the AI counterpart — their role, attitude, constraints), and scenario (one paragraph describing the situation Person 1 / the learner walks into). Keep both tight (60–120 words each). Ground in the training context.`;

  const user = [
    `Training: ${args.trainingTitle}`,
    args.trainingDescription ? `Description: ${args.trainingDescription}` : "",
    args.categories.length ? `Categories: ${args.categories.join(", ")}` : "",
    `Person 1 (Human / learner): ${args.person1}`,
    `Person 2 (AI / counterpart): ${args.person2}`,
    "",
    "Context & Situation brief:",
    args.context || "(no extra context — invent a realistic one)",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await anthropic.messages.create({
      model: MODEL_FAST,
      max_tokens: 1500,
      system: sys,
      tools: [
        {
          name: "submit_roleplay",
          description: "Submit the drafted roleplay.",
          input_schema: {
            type: "object",
            properties: {
              name: { type: "string", description: "Short module name (3–8 words)" },
              persona: { type: "string" },
              scenario: { type: "string" },
            },
            required: ["name", "persona", "scenario"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "submit_roleplay" },
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
