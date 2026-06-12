// POST /api/admin/create-roleplay/suggest-persons
//
// Body: { trainingId }
// Resp: { pairs: Array<{ person1, person2, reason }> }
//
// Powers the "AI Suggest" chip-row on the Create Roleplay intermediate
// page. Reads the training's title / description / categories and asks
// Claude for 3 realistic (Person 1, Person 2) pairs so the admin can
// one-click fill the role fields instead of typing from scratch.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { anthropic } from "@/lib/ai/client";
import { getAIConfig } from "@/lib/ai/config";

const Body = z.object({ trainingId: z.string().min(1).max(100) });

const OutSchema = z.object({
  pairs: z
    .array(
      z.object({
        person1: z.string().min(2).max(60),
        person2: z.string().min(2).max(60),
        reason: z.string().min(5).max(200),
      }),
    )
    .min(1)
    .max(4),
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

  const training = await prisma.training.findFirst({
    where: { id: parsed.data.trainingId, companyId: user.companyId },
    select: { title: true, description: true, categories: true },
  });
  if (!training)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const sys = [
    "You design corporate L&D roleplay scenarios. Given a training context, suggest 3 realistic (Person 1, Person 2) role pairs the admin could use for a practice roleplay.",
    "Rules:",
    "- Person 1 is the human learner — the role being trained.",
    "- Person 2 is the AI counterpart — who the learner interacts with.",
    "- Roles are short job titles or audience labels (2-5 words). No long descriptions.",
    "- Vary the 3 pairs — don't repeat the same Person 1 with three Person 2's.",
    "- Ground in the training's title / description / categories. Don't invent industries the admin didn't mention.",
    "- Each pair also gets a one-sentence `reason` explaining why it fits this training.",
    "- Use the submit_pairs tool. Never write prose outside the tool call.",
  ].join("\n");

  const userMsg = [
    `Training title: ${training.title}`,
    training.description ? `Description: ${training.description}` : "",
    training.categories.length
      ? `Categories: ${training.categories.join(", ")}`
      : "",
    "",
    "Suggest 3 realistic (Person 1, Person 2) pairs for a roleplay module.",
  ]
    .filter(Boolean)
    .join("\n");

  const ai = await getAIConfig();
  try {
    const res = await anthropic.messages.create({
      model: ai.fastModel,
      max_tokens: 800,
      system: sys,
      tools: [
        {
          name: "submit_pairs",
          description: "Submit the suggested role pairs.",
          input_schema: {
            type: "object",
            properties: {
              pairs: {
                type: "array",
                minItems: 1,
                maxItems: 4,
                items: {
                  type: "object",
                  properties: {
                    person1: { type: "string" },
                    person2: { type: "string" },
                    reason: { type: "string" },
                  },
                  required: ["person1", "person2", "reason"],
                },
              },
            },
            required: ["pairs"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "submit_pairs" },
      messages: [{ role: "user", content: userMsg }],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use")
      return NextResponse.json({ error: "no suggestions" }, { status: 502 });
    const validated = OutSchema.safeParse(block.input);
    if (!validated.success)
      return NextResponse.json({ error: "malformed suggestions" }, { status: 502 });
    return NextResponse.json(validated.data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI call failed" },
      { status: 502 },
    );
  }
}
