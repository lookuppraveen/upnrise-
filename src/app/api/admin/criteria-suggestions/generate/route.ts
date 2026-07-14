// POST /api/admin/criteria-suggestions/generate
//
// Body: { moduleId, criterionLabel, criterionDescription?, existingItems[]? }
// Resp: { items: string[] } — 4-6 tailored checklist-item suggestions
//
// Powers the "Suggest with AI" button under each selected evaluation
// criterion in the Roleplay editor. Grounds the suggestions in the
// module's scenario / Person 1 / Person 2 so the items are specific to
// the conversation rather than generic library defaults.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { anthropic } from "@/lib/ai/client";
import { getAIConfig } from "@/lib/ai/config";

const Body = z.object({
  moduleId: z.string().min(1).max(100),
  criterionLabel: z.string().trim().min(1).max(200),
  criterionDescription: z.string().trim().max(600).optional().default(""),
  // Labels already added by the admin — the AI is instructed not to
  // re-suggest these so the returned list is additive.
  existingItems: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
});

const OutSchema = z.object({
  items: z
    .array(z.string().trim().min(6).max(200))
    .min(3)
    .max(6),
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
  const { moduleId, criterionLabel, criterionDescription, existingItems } =
    parsed.data;

  // Load the module's context: scenario + Person 1/Person 2 from body,
  // training title/description as a fallback anchor. Tenant-scoped so an
  // admin can't probe another company's modules.
  const mod = await prisma.trainingModule.findFirst({
    where: {
      id: moduleId,
      type: "roleplay",
      training: { companyId: user.companyId },
    },
    select: {
      body: true,
      training: { select: { title: true, description: true } },
    },
  });
  if (!mod)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const b = (mod.body ?? {}) as Record<string, unknown>;
  const person1 = typeof b.person1 === "string" ? b.person1 : "";
  const person2 = typeof b.person2 === "string" ? b.person2 : "";
  const scenario = typeof b.scenario === "string" ? b.scenario : "";

  const sys = [
    "You design evaluation checklists for corporate roleplay training. Given ONE evaluation criterion and the roleplay context, return 4-6 short, observable behaviours a scorer could tick off for that criterion — grounded in this specific scenario.",
    "",
    "Rules for each item:",
    "- Behaviour-anchored, past-tense: 'Confirmed X', 'Asked about Y', 'Handled Z'.",
    "- Short: ≤120 chars, single sentence, no lists inside.",
    "- Specific to the scenario/persona above — reference the counterpart, the product, the objection, etc., where it helps.",
    "- Observable: something the scorer could point at in a transcript.",
    "- Do NOT duplicate any item from the 'existing' list the admin already added.",
    "",
    "Output exactly one submit_items tool call. No prose.",
  ].join("\n");

  const userMsg = [
    `Training: ${mod.training.title}`,
    mod.training.description
      ? `Training description: ${mod.training.description}`
      : "",
    "",
    `Person 1 (Human / learner): ${person1 || "(unspecified)"}`,
    `Person 2 (AI / counterpart): ${person2 || "(unspecified)"}`,
    "",
    "Scenario:",
    scenario || "(empty — infer a reasonable scenario from the training above)",
    "",
    `Evaluation criterion: ${criterionLabel}`,
    criterionDescription ? `Criterion meaning: ${criterionDescription}` : "",
    "",
    existingItems.length > 0
      ? `Existing checklist items the admin already added (do NOT repeat these):\n${existingItems.map((s) => `- ${s}`).join("\n")}`
      : "Existing checklist items: (none)",
    "",
    `Suggest 4-6 checklist items for '${criterionLabel}' tailored to this scenario. Use the submit_items tool.`,
  ]
    .filter(Boolean)
    .join("\n");

  const ai = await getAIConfig();
  try {
    const res = await anthropic.messages.create({
      model: ai.fastModel,
      max_tokens: 1200,
      system: sys,
      tools: [
        {
          name: "submit_items",
          description:
            "Submit 4-6 checklist item labels tailored to the roleplay scenario.",
          input_schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                minItems: 3,
                maxItems: 6,
                items: { type: "string" },
              },
            },
            required: ["items"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "submit_items" },
      messages: [{ role: "user", content: userMsg }],
    });

    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use")
      return NextResponse.json({ error: "no items" }, { status: 502 });
    const validated = OutSchema.safeParse(block.input);
    if (!validated.success)
      return NextResponse.json(
        { error: "malformed items", issues: validated.error.flatten() },
        { status: 502 },
      );

    // Belt-and-braces dedupe against the admin's existing items in case
    // the model missed the instruction. Case-insensitive, trim-based.
    const existingLower = new Set(
      existingItems.map((s) => s.trim().toLowerCase()),
    );
    const items = validated.data.items.filter(
      (s) => !existingLower.has(s.trim().toLowerCase()),
    );
    if (items.length === 0)
      return NextResponse.json({ error: "no new items" }, { status: 502 });

    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI call failed" },
      { status: 502 },
    );
  }
}
