// POST /api/admin/create-roleplay/enhance-brief
//
// Body: { trainingId, person1, person2, context }
// Resp: { context }
//
// Powers the "Enhance Brief" button on the Create Roleplay intermediate
// page. Takes the admin's short context (or empty) and rewrites it as a
// richer multi-paragraph brief covering audience, scenario, counterpart
// posture, key challenges, and success criteria — without changing the
// admin's selected Person 1 / Person 2 roles.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { anthropic } from "@/lib/ai/client";
import { getAIConfig } from "@/lib/ai/config";

const Body = z.object({
  trainingId: z.string().min(1).max(100),
  person1: z.string().trim().max(500),
  person2: z.string().trim().max(500),
  context: z.string().trim().max(4000),
});

const OutSchema = z.object({
  context: z.string().min(60).max(4000),
});

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
    select: { title: true, description: true, categories: true },
  });
  if (!training)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const sys = [
    "You design corporate L&D roleplay scenarios. Take the admin's brief inputs and produce a richer multi-paragraph Context & Situation brief that the downstream roleplay-draft step can use directly.",
    "",
    "Cover at minimum:",
    "- Industry / Domain (one line)",
    "- Setting (where the conversation happens — call, in-office, on-site, etc.)",
    "- Counterpart posture (Person 2's mindset, constraints, hidden goals)",
    "- Learner's objective (Person 1's measurable outcome for the call)",
    "- 2-3 specific challenges or objections the learner will face",
    "- Success criteria (what a strong outcome looks like)",
    "",
    "Style: plain text paragraphs, no markdown headers, no bullet asterisks. Sections separated by blank lines.",
    "Stay grounded in the admin's brief — do not invent industries, products, or audiences they didn't reference.",
    "Use the submit_brief tool. Never write prose outside the tool call.",
  ].join("\n");

  const userMsg = [
    `Training title: ${training.title}`,
    training.description ? `Description: ${training.description}` : "",
    training.categories.length
      ? `Categories: ${training.categories.join(", ")}`
      : "",
    `Person 1 (Human / learner): ${person1 || "(unspecified)"}`,
    `Person 2 (AI / counterpart): ${person2 || "(unspecified)"}`,
    "",
    "Admin's brief context:",
    context || "(empty — invent a realistic one grounded in the training above)",
    "",
    "Rewrite as a structured Context & Situation brief.",
  ]
    .filter(Boolean)
    .join("\n");

  const ai = await getAIConfig();
  try {
    const res = await anthropic.messages.create({
      model: ai.fastModel,
      max_tokens: 1500,
      system: sys,
      tools: [
        {
          name: "submit_brief",
          description: "Submit the enhanced Context & Situation brief.",
          input_schema: {
            type: "object",
            properties: { context: { type: "string" } },
            required: ["context"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "submit_brief" },
      messages: [{ role: "user", content: userMsg }],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use")
      return NextResponse.json({ error: "no brief" }, { status: 502 });
    const validated = OutSchema.safeParse(block.input);
    if (!validated.success)
      return NextResponse.json({ error: "malformed brief" }, { status: 502 });
    return NextResponse.json(validated.data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI call failed" },
      { status: 502 },
    );
  }
}
