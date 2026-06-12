// POST /api/admin/create-coach/generate
//
// Body: { trainingId, trainingUsecase, typeOfCoach, objectiveContext }
// Resp: { id }
//
// Companion to the "Generate" button on /modules/new/coach. Calls a
// fast Anthropic pass to draft a Coach module body (name + outline +
// guidance) and persists as a `document` type module with
// `body.kind: "coach"` — same temporary-storage convention as
// createCoachModule.

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { anthropic, MODEL_FAST } from "@/lib/ai/client";

const Body = z.object({
  trainingId: z.string().uuid(),
  trainingUsecase: z.enum(["sales", "fundamental"]),
  typeOfCoach: z.enum(["normal", "ppt"]),
  objectiveContext: z.string().trim().max(4000),
});

const DraftSchema = z.object({
  name: z.string().min(3).max(120),
  outline: z.string().min(20).max(2000),
  guidance: z.string().min(20).max(2000),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  const { trainingId, trainingUsecase, typeOfCoach, objectiveContext } =
    parsed.data;

  const training = await prisma.training.findFirst({
    where: { id: trainingId, companyId: user.companyId },
    select: { id: true, title: true, description: true, categories: true },
  });
  if (!training)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const draft = await draftCoach({
    trainingTitle: training.title,
    trainingDescription: training.description ?? "",
    categories: training.categories,
    trainingUsecase,
    typeOfCoach,
    objectiveContext,
  });
  if (!draft.ok)
    return NextResponse.json({ error: draft.error }, { status: 502 });

  const order = await prisma.trainingModule.count({ where: { trainingId } });
  const mod = await prisma.trainingModule.create({
    data: {
      trainingId,
      name: draft.value.name,
      type: "document",
      order,
      published: true,
      body: {
        kind: "coach",
        coachConfig: {
          trainingUsecase,
          typeOfCoach,
          objectiveContext,
          outline: draft.value.outline,
          guidance: draft.value.guidance,
        },
        generationPrompt: objectiveContext,
      },
    },
    select: { id: true },
  });

  revalidatePath(`/admin/trainings/${trainingId}/edit`);
  return NextResponse.json({ id: mod.id });
}

async function draftCoach(args: {
  trainingTitle: string;
  trainingDescription: string;
  categories: string[];
  trainingUsecase: "sales" | "fundamental";
  typeOfCoach: "normal" | "ppt";
  objectiveContext: string;
}): Promise<
  | { ok: true; value: z.infer<typeof DraftSchema> }
  | { ok: false; error: string }
> {
  const sys = `You design coach modules for corporate L&D training. A coach module guides a learner through a concept (Fundamental) or sales technique (Sales) with a structured outline and conversational guidance.

Return a single tool call with:
- name: short module title (3–8 words)
- outline: 4–6 bullet points covering what the learner will work through (one bullet per line, prefix with "- ").
- guidance: 1 paragraph the AI coach will use to stay on-topic and on-tone (60–120 words).

For PPT type, treat the outline as slide titles. For Normal, treat it as conversational beats.`;

  const user = [
    `Training: ${args.trainingTitle}`,
    args.trainingDescription ? `Description: ${args.trainingDescription}` : "",
    args.categories.length ? `Categories: ${args.categories.join(", ")}` : "",
    `Training usecase: ${args.trainingUsecase}`,
    `Coach type: ${args.typeOfCoach}`,
    "",
    "Coach objective & context:",
    args.objectiveContext || "(none — invent a realistic objective)",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await anthropic.messages.create({
      model: MODEL_FAST,
      max_tokens: 2000,
      system: sys,
      tools: [
        {
          name: "submit_coach",
          description: "Submit the drafted coach module.",
          input_schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              outline: { type: "string" },
              guidance: { type: "string" },
            },
            required: ["name", "outline", "guidance"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "submit_coach" },
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
