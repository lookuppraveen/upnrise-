// POST /api/admin/generate
//
// Body:
//   { kind: "training" | "dictionary",
//     brief: string,
//     kbSourceIds?: string[] }
//
// Training response now carries full module bodies, not just names —
// videoScript + duration_min for video modules, questions[] for quiz,
// markdown for document, persona/scenario for roleplay. The bodies
// flow straight into TrainingModule.body when the admin saves, so
// trainees see real content immediately and the avatar render pipeline
// has a script to read.
//
// kbSourceIds[] is the KB grounding hook: we look up the rows, verify
// tenant ownership, and concatenate their `content` text into a system
// section capped at ~30k chars. No embeddings yet — top-k via simple
// listing is enough for the v1 use case.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { anthropic } from "@/lib/ai/client";
import { getAIConfig } from "@/lib/ai/config";

const MAX_KB_CHARS = 30_000;

const Body = z.object({
  kind: z.enum(["training", "dictionary"]),
  brief: z.string().min(10).max(2000),
  kbSourceIds: z.array(z.string().uuid()).max(20).optional(),
});

const VideoBody = z.object({
  videoScript: z.string().min(20).max(8000),
  duration_min: z.number().int().min(1).max(60),
});
const QuizQuestion = z.object({
  q: z.string().min(3).max(500),
  options: z.array(z.string().min(1).max(300)).min(2).max(6),
  answer: z.number().int().min(0),
});
const QuizBody = z.object({
  questions: z.array(QuizQuestion).min(2).max(15),
});
const DocumentBody = z.object({
  markdown: z.string().min(20).max(8000),
});

const ModuleSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("video"),
    name: z.string().min(3).max(120),
    reason: z.string().max(200).optional(),
    body: VideoBody,
  }),
  z.object({
    type: z.literal("roleplay"),
    name: z.string().min(3).max(120),
    reason: z.string().max(200).optional(),
    persona: z.string().min(10).max(800),
    scenario: z.string().min(10).max(800),
  }),
  z.object({
    type: z.literal("quiz"),
    name: z.string().min(3).max(120),
    reason: z.string().max(200).optional(),
    body: QuizBody,
  }),
  z.object({
    type: z.literal("document"),
    name: z.string().min(3).max(120),
    reason: z.string().max(200).optional(),
    body: DocumentBody,
  }),
]);

const TrainingSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(20).max(600),
  categories: z.array(z.string().min(2).max(40)).min(1).max(4),
  modules: z.array(ModuleSchema).min(1).max(6),
});

const DictionarySchema = z.object({
  terms: z
    .array(
      z.object({
        term: z.string().min(2).max(80),
        definition: z.string().min(10).max(400),
      }),
    )
    .min(2)
    .max(10),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad body" }, { status: 400 });

  const { kind, brief, kbSourceIds } = parsed.data;
  const kbContext = await loadKbContext(user.companyId, kbSourceIds ?? []);

  if (kind === "training") return generateTraining(brief, kbContext);
  return generateDictionary(brief, kbContext);
}

// ─────────────── KB loading ───────────────

async function loadKbContext(
  companyId: string,
  ids: string[],
): Promise<string> {
  if (ids.length === 0) return "";
  const rows = await prisma.kbSource.findMany({
    where: { id: { in: ids }, companyId },
    select: { name: true, content: true, kind: true, sourceUrl: true },
    orderBy: { createdAt: "desc" },
  });
  if (rows.length === 0) return "";

  // Distribute the char budget evenly across sources so a single huge
  // source doesn't crowd out the rest.
  const perSource = Math.floor(MAX_KB_CHARS / rows.length);
  return rows
    .map((r) => {
      const head = `## Source: ${r.name}${r.sourceUrl ? ` (${r.sourceUrl})` : ""}`;
      const body = (r.content ?? "").slice(0, perSource).trim();
      return `${head}\n${body || "(empty)"}`;
    })
    .join("\n\n");
}

// ─────────────── Training generator ───────────────

async function generateTraining(brief: string, kbContext: string) {
  const system = [
    "You are a senior sales L&D designer. Given a brief (and optional grounding sources), draft a complete training that's ready to ship.",
    "",
    "Output a full training: title, 2-3 sentence description, 2-4 category chips, and 3-5 modules with FULL bodies — not just names.",
    "",
    "Per-module body rules:",
    "- video: write a complete narration `videoScript` (300-700 words, conversational tone, ~1 min per 130 words) the learner will hear an avatar speak. Estimate `duration_min` honestly.",
    "- roleplay: write a 1-sentence `persona` (who the learner is talking to) AND a 1-2 sentence `scenario` (the situation).",
    "- quiz: write 3-8 multiple-choice `questions`, each with 2-4 `options` and `answer` (0-indexed correct option). No 'all of the above'.",
    "- document: write a `markdown` reference doc (300-700 words) the learner reads. Use headings and bullet lists.",
    "",
    "Overall rules:",
    "- title: outcome-focused, ≤8 words.",
    "- description: 2-3 sentences. Open with the buyer scenario; end with what the learner can do after.",
    "- categories: short noun phrases, no overlap.",
    "- Mix module types so the training covers theory, practice, and check. Default: 1 video intro, 1-2 roleplays, 1 quiz, maybe 1 doc.",
    "- If grounding sources are provided, EVERY module body must reference specifics from them — names, numbers, exact phrases. Do not invent facts when the sources contradict.",
    "- Use the submit_training tool. Never write prose outside the tool call.",
  ].join("\n");

  const ai = await getAIConfig();
  const userMessage = kbContext
    ? `## Grounding sources\n${kbContext}\n\n## Brief\n${brief}\n\nDraft the training using the submit_training tool. Ground every module body in the sources above.`
    : `## Brief\n${brief}\n\nDraft the training using the submit_training tool.`;

  const result = await anthropic.messages.create({
    model: kbContext ? ai.model : ai.fastModel,
    max_tokens: 6000,
    system,
    tools: [
      {
        name: "submit_training",
        description:
          "Submit the structured training draft with full module bodies.",
        input_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            categories: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
              maxItems: 4,
            },
            modules: {
              type: "array",
              minItems: 1,
              maxItems: 6,
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["video", "roleplay", "quiz", "document"],
                  },
                  name: { type: "string" },
                  reason: { type: "string" },
                  // roleplay-only:
                  persona: { type: "string" },
                  scenario: { type: "string" },
                  // video / quiz / document body:
                  body: {
                    type: "object",
                    properties: {
                      videoScript: { type: "string" },
                      duration_min: { type: "number" },
                      markdown: { type: "string" },
                      questions: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            q: { type: "string" },
                            options: {
                              type: "array",
                              items: { type: "string" },
                            },
                            answer: { type: "number" },
                          },
                          required: ["q", "options", "answer"],
                        },
                      },
                    },
                  },
                },
                required: ["type", "name"],
              },
            },
          },
          required: ["title", "description", "categories", "modules"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "submit_training" },
    messages: [{ role: "user", content: userMessage }],
  });

  const toolUse = result.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use")
    return NextResponse.json({ error: "no draft" }, { status: 502 });
  const validated = TrainingSchema.safeParse(toolUse.input);
  if (!validated.success) {
    return NextResponse.json(
      { error: "invalid draft", detail: validated.error.format() },
      { status: 502 },
    );
  }
  return NextResponse.json(validated.data);
}

// ─────────────── Dictionary generator ───────────────

async function generateDictionary(brief: string, kbContext: string) {
  const system = [
    "You are a sales L&D editor building a tenant glossary. Given a brief (and optional grounding sources), propose 3-8 dictionary entries — terms or acronyms the team uses, each with a tight 1-2 sentence definition.",
    "Rules:",
    "- term: short, often an acronym or 1-3 words.",
    "- definition: 1-2 sentences. Concrete, no fluff.",
    "- Match the tenant's domain implied by the brief AND the grounding sources. Don't add generic startup-glossary entries unless the brief is generic.",
    "- Use the submit_dictionary tool. Never write prose outside the tool call.",
  ].join("\n");

  const ai = await getAIConfig();
  const userMessage = kbContext
    ? `## Grounding sources\n${kbContext}\n\n## Brief\n${brief}\n\nPropose the entries via submit_dictionary.`
    : `## Brief\n${brief}\n\nPropose the entries via submit_dictionary.`;

  const result = await anthropic.messages.create({
    model: ai.fastModel,
    max_tokens: 1200,
    system,
    tools: [
      {
        name: "submit_dictionary",
        description: "Submit the proposed dictionary entries.",
        input_schema: {
          type: "object",
          properties: {
            terms: {
              type: "array",
              minItems: 2,
              maxItems: 10,
              items: {
                type: "object",
                properties: {
                  term: { type: "string" },
                  definition: { type: "string" },
                },
                required: ["term", "definition"],
              },
            },
          },
          required: ["terms"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "submit_dictionary" },
    messages: [{ role: "user", content: userMessage }],
  });

  const toolUse = result.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use")
    return NextResponse.json({ error: "no draft" }, { status: 502 });
  const validated = DictionarySchema.safeParse(toolUse.input);
  if (!validated.success)
    return NextResponse.json({ error: "invalid draft" }, { status: 502 });
  return NextResponse.json(validated.data);
}
