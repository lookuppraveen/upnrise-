// POST /api/admin/create-roleplay/ideal-conversation
//
// Body: { trainingId, person1, person2, scenario, persona? }
// Resp: { idealConversation: string }
//
// Powers the "AI Generate" button on the Ideal Conversation card in
// the Roleplay module editor. Produces a realistic alternating-turn
// dialogue (Person 1 → Person 2 → Person 1 → …) grounded in the
// scenario and (when provided) the Person 2 persona. The output is
// plain text — one speaker per line, prefixed with the role name and
// a colon — so it drops straight into the existing textarea.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { anthropic } from "@/lib/ai/client";
import { getAIConfig } from "@/lib/ai/config";

const PersonaInput = z.object({
  title: z.string().max(200).optional(),
  behavior: z.string().max(40).optional(),
  backgroundDetails: z.array(z.string().max(200)).max(10).optional(),
  additionalPrompt: z.string().max(4000).optional(),
});

const Body = z.object({
  trainingId: z.string().min(1).max(100),
  person1: z.string().trim().max(500),
  person2: z.string().trim().max(500),
  scenario: z.string().trim().max(8000),
  persona: PersonaInput.optional(),
});

const OutSchema = z.object({
  idealConversation: z.string().min(60).max(8000),
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
  const { trainingId, person1, person2, scenario, persona } = parsed.data;

  const training = await prisma.training.findFirst({
    where: { id: trainingId, companyId: user.companyId },
    select: { title: true, description: true, categories: true },
  });
  if (!training)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const p1 = person1 || "Person 1";
  const p2 = person2 || "Person 2";

  const sys = [
    "You write sample roleplay dialogues for corporate L&D training. The output is the ideal conversation the AI should aim to mirror — what a strong run of the scenario looks like.",
    "",
    "Rules:",
    `- Person 1 (${p1}) is the human learner — speaks first, drives the conversation toward the learning objective.`,
    `- Person 2 (${p2}) is the AI counterpart — responds in character with the behavior + background traits described.`,
    "- Format: one speaker per line, prefixed with the role name and a colon. Example: `${p1}: line of dialogue`.",
    "- Alternate turns. 8-14 total lines.",
    "- Realistic conversational tone — short sentences, natural follow-ups. No stage directions, no bracketed asides, no headings, no markdown.",
    "- Ground every line in the scenario; don't invent products / industries / numbers the admin didn't mention.",
    "- Show the learner handling at least one challenge or objection from Person 2 — the strong outcome should be earned, not handed over.",
    "- End on a clear next step or a graceful close.",
    "- Use the submit_dialogue tool. Never write prose outside the tool call.",
  ]
    .join("\n")
    .replaceAll("${p1}", p1)
    .replaceAll("${p2}", p2);

  const userMsg = [
    `Training: ${training.title}`,
    training.description ? `Description: ${training.description}` : "",
    training.categories.length
      ? `Categories: ${training.categories.join(", ")}`
      : "",
    `Person 1 (Human / learner): ${p1}`,
    `Person 2 (AI / counterpart): ${p2}`,
    persona?.title ? `Persona title: ${persona.title}` : "",
    persona?.behavior ? `Persona behavior: ${persona.behavior}` : "",
    persona?.backgroundDetails?.length
      ? `Persona background:\n- ${persona.backgroundDetails.join("\n- ")}`
      : "",
    persona?.additionalPrompt
      ? `Persona directive: ${persona.additionalPrompt}`
      : "",
    "",
    "Scenario:",
    scenario || "(empty — use the training context above to imagine a realistic one)",
    "",
    "Write the ideal conversation. Use the submit_dialogue tool.",
  ]
    .filter(Boolean)
    .join("\n");

  const ai = await getAIConfig();
  try {
    const res = await anthropic.messages.create({
      model: ai.fastModel,
      max_tokens: 2000,
      system: sys,
      tools: [
        {
          name: "submit_dialogue",
          description: "Submit the ideal conversation as plain text.",
          input_schema: {
            type: "object",
            properties: {
              idealConversation: {
                type: "string",
                description:
                  "8-14 lines of alternating dialogue, one speaker per line, prefixed with role name and colon. Plain text only.",
              },
            },
            required: ["idealConversation"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "submit_dialogue" },
      messages: [{ role: "user", content: userMsg }],
    });

    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use")
      return NextResponse.json({ error: "no dialogue" }, { status: 502 });
    const validated = OutSchema.safeParse(block.input);
    if (!validated.success)
      return NextResponse.json(
        { error: "malformed dialogue", issues: validated.error.flatten() },
        { status: 502 },
      );
    return NextResponse.json(validated.data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI call failed" },
      { status: 502 },
    );
  }
}
