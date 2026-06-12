// POST /api/admin/regenerate-coach
//
// Body: { trainingId, moduleId, trainingUsecase, typeOfCoach, objectiveContext }
// Resp: { name, outline, guidance }
//
// Per-module regenerate pass for a Coach module (stored as document
// with body.kind=coach). Returns the draft so the admin can preview
// before saving.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { anthropic, MODEL_FAST } from "@/lib/ai/client";

const Body = z.object({
  trainingId: z.string().uuid(),
  moduleId: z.string().uuid(),
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
  const { trainingId, moduleId, trainingUsecase, typeOfCoach, objectiveContext } =
    parsed.data;

  const mod = await prisma.trainingModule.findFirst({
    where: {
      id: moduleId,
      trainingId,
      type: "document",
      training: { companyId: user.companyId },
    },
    select: {
      id: true,
      body: true,
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

  // Ensure it really is a coach module.
  const bodyObj =
    mod.body && typeof mod.body === "object" && !Array.isArray(mod.body)
      ? (mod.body as Record<string, unknown>)
      : null;
  if (!bodyObj || bodyObj.kind !== "coach")
    return NextResponse.json({ error: "not a coach module" }, { status: 400 });

  const sys = `You design coach modules for corporate L&D training. A coach module guides a learner through a concept (Fundamental) or sales technique (Sales) with a structured outline and conversational guidance.

Return a single tool call with:
- name: short module title (3–8 words)
- outline: 4–6 bullet points covering what the learner will work through (one bullet per line, prefix with "- ").
- guidance: 1 paragraph the AI coach will use to stay on-topic and on-tone (60–120 words).

For PPT type, treat the outline as slide titles. For Normal, treat it as conversational beats.`;

  const userPrompt = [
    `Training: ${mod.training.title}`,
    mod.training.description ? `Description: ${mod.training.description}` : "",
    mod.training.categories.length
      ? `Categories: ${mod.training.categories.join(", ")}`
      : "",
    `Training usecase: ${trainingUsecase}`,
    `Coach type: ${typeOfCoach}`,
    "",
    "Coach objective & context (admin's current state):",
    objectiveContext || "(none — invent a realistic objective)",
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
          description: "Submit the regenerated coach module.",
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
