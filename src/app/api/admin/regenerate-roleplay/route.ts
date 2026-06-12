// POST /api/admin/regenerate-roleplay
//
// Body: { trainingId, moduleId, person1, person2, scenario }
// Resp: { name, persona, scenario, keywords[], idealConversation }
//
// Per-module regenerate pass for a Roleplay module. Returns the AI
// draft so the admin can preview before saving via the standard
// saveRoleplayModule path.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { anthropic, MODEL_FAST } from "@/lib/ai/client";

const Body = z.object({
  trainingId: z.string().uuid(),
  moduleId: z.string().uuid(),
  person1: z.string().trim().max(500),
  person2: z.string().trim().max(500),
  scenario: z.string().trim().max(8000),
});

const DraftSchema = z.object({
  name: z.string().min(3).max(120),
  persona: z.string().min(20).max(1500),
  scenario: z.string().min(20).max(1500),
  keywords: z.array(z.string().min(1).max(80)).max(10),
  idealConversation: z.string().min(20).max(4000),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  const { trainingId, moduleId, person1, person2, scenario } = parsed.data;

  const mod = await prisma.trainingModule.findFirst({
    where: {
      id: moduleId,
      trainingId,
      type: "roleplay",
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

  const p1 = person1 || "Sales Rep";
  const p2 = person2 || "Customer";

  const sys = `You design roleplay scenarios for corporate L&D training. Output a single tool call with:
- name: short module title (3–8 words)
- persona: 1 paragraph describing Person 2 (the AI counterpart) — role, attitude, constraints (60–120 words)
- scenario: 1 paragraph describing the situation Person 1 (the learner) walks into (60–120 words)
- keywords: 3–6 short phrases the learner should cover during the roleplay
- idealConversation: a sample dialogue showing the ideal flow. Use the format "<Person 1 name>: …" and "<Person 2 name>: …" alternating, 6–10 turns total.`;

  const userPrompt = [
    `Training: ${mod.training.title}`,
    mod.training.description ? `Description: ${mod.training.description}` : "",
    mod.training.categories.length
      ? `Categories: ${mod.training.categories.join(", ")}`
      : "",
    `Person 1 (Human / learner): ${p1}`,
    `Person 2 (AI / counterpart): ${p2}`,
    "",
    "Current scenario brief (admin's current state):",
    scenario || "(none — invent a realistic one for this training)",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await anthropic.messages.create({
      model: MODEL_FAST,
      max_tokens: 4000,
      system: sys,
      tools: [
        {
          name: "submit_roleplay",
          description: "Submit the regenerated roleplay.",
          input_schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              persona: { type: "string" },
              scenario: { type: "string" },
              keywords: { type: "array", items: { type: "string" } },
              idealConversation: { type: "string" },
            },
            required: [
              "name",
              "persona",
              "scenario",
              "keywords",
              "idealConversation",
            ],
          },
        },
      ],
      tool_choice: { type: "tool", name: "submit_roleplay" },
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
