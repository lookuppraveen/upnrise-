// POST /api/admin/create-activity/generate
//
// Body: { trainingId, duration, prompt }
// Resp: { id }
//
// Companion to the "Generate" button on /modules/new/activity. Asks
// Anthropic to expand the admin's prompt into a structured activity
// brief (name + description + exercises[]) sized to the duration
// preset, then persists the gamified module.

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { anthropic, MODEL_FAST } from "@/lib/ai/client";

const Body = z.object({
  trainingId: z.string().uuid(),
  duration: z.enum(["short", "medium", "long"]),
  prompt: z.string().trim().max(4000),
});

const DraftSchema = z.object({
  name: z.string().min(3).max(120),
  description: z.string().min(20).max(2000),
  exercises: z.array(z.string().min(5).max(400)).min(1).max(8),
});

const DURATION_MINUTES: Record<"short" | "medium" | "long", number> = {
  short: 3,
  medium: 5,
  long: 7,
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  const { trainingId, duration, prompt } = parsed.data;

  const training = await prisma.training.findFirst({
    where: { id: trainingId, companyId: user.companyId },
    select: { id: true, title: true, description: true, categories: true },
  });
  if (!training)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const draft = await draftActivity({
    trainingTitle: training.title,
    trainingDescription: training.description ?? "",
    categories: training.categories,
    duration,
    prompt,
  });
  if (!draft.ok)
    return NextResponse.json({ error: draft.error }, { status: 502 });

  const order = await prisma.trainingModule.count({ where: { trainingId } });
  const mod = await prisma.trainingModule.create({
    data: {
      trainingId,
      name: draft.value.name,
      type: "gamified",
      order,
      published: true,
      body: {
        description: draft.value.description,
        exercises: draft.value.exercises,
        duration,
        duration_min: DURATION_MINUTES[duration],
        prompt,
        generationPrompt: prompt,
      },
    },
    select: { id: true },
  });

  revalidatePath(`/admin/trainings/${trainingId}/edit`);
  return NextResponse.json({ id: mod.id });
}

async function draftActivity(args: {
  trainingTitle: string;
  trainingDescription: string;
  categories: string[];
  duration: "short" | "medium" | "long";
  prompt: string;
}): Promise<
  | { ok: true; value: z.infer<typeof DraftSchema> }
  | { ok: false; error: string }
> {
  const targetMin = DURATION_MINUTES[args.duration];
  const sys = `You design gamified activity modules for corporate L&D training. An activity is a short, hands-on practice — drag-and-drop, scenario branching, simulation, drill — that exercises the learner's skills.

Return a single tool call with:
- name: short module title (3–8 words)
- description: 1 paragraph describing the activity setup, mechanics, and the skill it exercises (80–160 words)
- exercises: a list of 2–${args.duration === "long" ? 6 : args.duration === "medium" ? 4 : 3} concrete exercise prompts the learner will work through, sized to fit ${targetMin} minutes total.`;

  const user = [
    `Training: ${args.trainingTitle}`,
    args.trainingDescription ? `Description: ${args.trainingDescription}` : "",
    args.categories.length ? `Categories: ${args.categories.join(", ")}` : "",
    `Target duration: ${targetMin} minutes (${args.duration})`,
    "",
    "Learning goals & exercises brief:",
    args.prompt || "(none — invent a realistic activity from the training context)",
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
          name: "submit_activity",
          description: "Submit the drafted gamified activity.",
          input_schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              exercises: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["name", "description", "exercises"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "submit_activity" },
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
