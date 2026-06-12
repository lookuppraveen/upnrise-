// POST /api/admin/regenerate-activity
//
// Body: { trainingId, moduleId, duration, prompt }
// Resp: { name, description, exercises[] }
//
// Per-module regenerate pass for a Gamified (Activity) module. Mirrors
// the AI logic in /api/admin/create-activity/generate but targets an
// existing module instead of creating one. The caller updates its
// local state with the returned shape and persists via the standard
// saveGamifiedModule path — no DB writes from this route, so the
// admin can preview before saving.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { anthropic, MODEL_FAST } from "@/lib/ai/client";

const Body = z.object({
  trainingId: z.string().uuid(),
  moduleId: z.string().uuid(),
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
  const { trainingId, moduleId, duration, prompt } = parsed.data;

  // Ownership + module existence check.
  const mod = await prisma.trainingModule.findFirst({
    where: {
      id: moduleId,
      trainingId,
      type: "gamified",
      training: { companyId: user.companyId },
    },
    select: {
      id: true,
      training: {
        select: {
          title: true,
          description: true,
          categories: true,
        },
      },
    },
  });
  if (!mod)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const targetMin = DURATION_MINUTES[duration];
  const sys = `You design gamified activity modules for corporate L&D training. An activity is a short, hands-on practice — drag-and-drop, scenario branching, simulation, drill — that exercises the learner's skills.

Return a single tool call with:
- name: short module title (3–8 words)
- description: 1 paragraph describing the activity setup, mechanics, and the skill it exercises (80–160 words)
- exercises: a list of 2–${duration === "long" ? 6 : duration === "medium" ? 4 : 3} concrete exercise prompts the learner will work through, sized to fit ${targetMin} minutes total.`;

  const userPrompt = [
    `Training: ${mod.training.title}`,
    mod.training.description ? `Description: ${mod.training.description}` : "",
    mod.training.categories.length
      ? `Categories: ${mod.training.categories.join(", ")}`
      : "",
    `Target duration: ${targetMin} minutes (${duration})`,
    "",
    "Learning goals & exercises brief (admin's current state):",
    prompt || "(none — invent a realistic activity from the training context)",
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
          description: "Submit the regenerated activity.",
          input_schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              exercises: { type: "array", items: { type: "string" } },
            },
            required: ["name", "description", "exercises"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "submit_activity" },
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
    return NextResponse.json(parsedDraft.data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI call failed" },
      { status: 502 },
    );
  }
}
