// POST /api/admin/persona/generate
//
// Body: { trainingId, moduleId?, person1, person2, scenario }
// Resp: PersonaData — title, behavior, backgroundDetails[], additionalPrompt,
//                     avatarGender, backgroundId, languages, voiceId
//
// Powers the "AI Generate" button inside the PersonaModal. Builds a
// grounded Persona for Person 2 (the AI counterpart) using the training
// context plus whatever Person 1 / Person 2 / Scenario the admin has
// already entered. Returned enum values are constrained to the same
// option lists PersonaModal renders, so the result drops in without a
// mapping layer.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { anthropic } from "@/lib/ai/client";
import { getAIConfig } from "@/lib/ai/config";

const Body = z.object({
  trainingId: z.string().min(1).max(100),
  moduleId: z.string().min(1).max(100).optional(),
  // person1 / person2 act as role labels in the UI but admins often
  // paste short briefs ("Pharmacy buyer for a diabetic specialty store
  // in tier-2 town…") to ground the AI generator. 500 is generous
  // enough to hold that without spilling into the scenario field.
  person1: z.string().trim().max(500),
  person2: z.string().trim().max(500),
  scenario: z.string().trim().max(8000),
});

const BEHAVIOR_KEYS = [
  "friendly",
  "skeptical",
  "formal",
  "impatient",
  "supportive",
  "neutral",
  "critical",
  "emotional",
  "authoritative",
  "casual",
] as const;

const BACKGROUND_IDS = [
  "office",
  "lounge",
  "hospital",
  "studio",
  "factory",
  "blank",
  "clinic",
  "pharmacy",
  "retail",
] as const;

const GENDER_KEYS = ["male", "female", "neutral"] as const;

const LANGUAGES = [
  "English",
  "Hindi",
  "Tamil",
  "Telugu",
  "Kannada",
  "Malayalam",
  "Bengali",
  "Marathi",
  "Gujarati",
  "Punjabi",
  "Urdu",
] as const;

const VOICE_IDS = [
  "m-warm",
  "m-deep",
  "m-young",
  "m-calm",
  "f-warm",
  "f-bright",
  "f-formal",
  "f-calm",
  "n-clear",
  "n-warm",
] as const;

const OutSchema = z.object({
  title: z.string().min(3).max(200),
  behavior: z.enum(BEHAVIOR_KEYS),
  backgroundDetails: z.array(z.string().min(2).max(200)).min(3).max(8),
  additionalPrompt: z.string().min(20).max(2000),
  avatarGender: z.enum(GENDER_KEYS),
  backgroundId: z.enum(BACKGROUND_IDS),
  languages: z.array(z.enum(LANGUAGES)).min(1).max(4),
  voiceId: z.enum(VOICE_IDS),
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
  const { trainingId, person1, person2, scenario } = parsed.data;

  const training = await prisma.training.findFirst({
    where: { id: trainingId, companyId: user.companyId },
    select: { title: true, description: true, categories: true },
  });
  if (!training)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const sys = [
    "You design Persona profiles for corporate L&D roleplays. The Persona describes Person 2 — the AI counterpart the learner will practise against. Make it specific, realistic, and grounded in the training context the admin already entered.",
    "",
    "Output exactly one tool call. The shape:",
    "- title: A short profile headline (≤80 chars) describing who Person 2 is in this scenario.",
    "- behavior: One enum from this set — friendly | skeptical | formal | impatient | supportive | neutral | critical | emotional | authoritative | casual. Pick the dominant disposition Person 2 should bring to the conversation.",
    "- backgroundDetails: 4-6 short bullet-style facts (each ≤140 chars) about Person 2's role, seniority, constraints, motivations, knowledge level, and any pain point or hidden objective the learner will need to surface.",
    "- additionalPrompt: A 2-3 sentence directive the AI counterpart should follow during the conversation. Address it in second person ('You are…', 'You should…').",
    "- avatarGender: male | female | neutral. Default to neutral when Person 2 reads as a generic role rather than a specific person; pick male / female only if the scenario clearly implies it.",
    "- backgroundId: One of office | lounge | hospital | studio | factory | blank | clinic | pharmacy | retail. Match the typical setting of the scenario.",
    "- languages: 1-3 entries from English | Hindi | Tamil | Telugu | Kannada | Malayalam | Bengali | Marathi | Gujarati | Punjabi | Urdu. Always include English unless the scenario is exclusively non-English.",
    "- voiceId: One of m-warm | m-deep | m-young | m-calm | f-warm | f-bright | f-formal | f-calm | n-clear | n-warm. Match voice gender to avatarGender (m-* for male, f-* for female, n-* for neutral).",
    "",
    "Never write prose outside the tool call.",
  ].join("\n");

  const userMsg = [
    `Training: ${training.title}`,
    training.description ? `Description: ${training.description}` : "",
    training.categories.length
      ? `Categories: ${training.categories.join(", ")}`
      : "",
    `Person 1 (Human / learner): ${person1 || "(unspecified)"}`,
    `Person 2 (AI / counterpart) — this is the persona we are designing: ${person2 || "(unspecified)"}`,
    "",
    "Scenario:",
    scenario || "(empty — invent a realistic one grounded in the training above)",
    "",
    "Design Person 2's persona profile. Use the submit_persona tool.",
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
          name: "submit_persona",
          description: "Submit the structured Persona profile for Person 2.",
          input_schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              behavior: { type: "string", enum: [...BEHAVIOR_KEYS] },
              backgroundDetails: {
                type: "array",
                minItems: 3,
                maxItems: 8,
                items: { type: "string" },
              },
              additionalPrompt: { type: "string" },
              avatarGender: { type: "string", enum: [...GENDER_KEYS] },
              backgroundId: { type: "string", enum: [...BACKGROUND_IDS] },
              languages: {
                type: "array",
                minItems: 1,
                maxItems: 4,
                items: { type: "string", enum: [...LANGUAGES] },
              },
              voiceId: { type: "string", enum: [...VOICE_IDS] },
            },
            required: [
              "title",
              "behavior",
              "backgroundDetails",
              "additionalPrompt",
              "avatarGender",
              "backgroundId",
              "languages",
              "voiceId",
            ],
          },
        },
      ],
      tool_choice: { type: "tool", name: "submit_persona" },
      messages: [{ role: "user", content: userMsg }],
    });

    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use")
      return NextResponse.json({ error: "no persona" }, { status: 502 });
    const validated = OutSchema.safeParse(block.input);
    if (!validated.success)
      return NextResponse.json(
        { error: "malformed persona", issues: validated.error.flatten() },
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
