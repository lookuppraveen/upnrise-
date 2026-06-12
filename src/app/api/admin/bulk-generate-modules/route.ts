// POST /api/admin/bulk-generate-modules
//
// Body: { trainingId, counts: { roleplay?, quiz? }, prompt? }
// Resp: { added: number }
//
// "What would you like to create today?" → AI drafts the requested
// number of modules, each with a full body (persona/scenario for
// roleplay, questions[] for quiz), grounded in the training's attached
// KB sources. Persists in a single transaction and returns the count.
//
// Separate from /api/admin/generate (which drafts a full new training
// from scratch) — this route is the "augment existing" path. Mirrors
// the same KB-loading + tool-use pattern.

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { anthropic } from "@/lib/ai/client";
import { getAIConfig } from "@/lib/ai/config";

const MAX_KB_CHARS = 30_000;

const Body = z.object({
  trainingId: z.string().uuid(),
  counts: z.object({
    // Module counts. `evaluation_module` disambiguates from the QB
    // `evaluation` kind below — the discriminator is the field name.
    roleplay: z.number().int().min(0).max(20).optional(),
    quiz: z.number().int().min(0).max(20).optional(),
    gamified: z.number().int().min(0).max(20).optional(),
    evaluation_module: z.number().int().min(0).max(20).optional(),
    // QB item counts.
    evaluation: z.number().int().min(0).max(20).optional(),
    whatsapp_mcq: z.number().int().min(0).max(20).optional(),
  }),
  prompt: z.string().max(8000).optional(),
});

const QuizQuestion = z.object({
  q: z.string().min(3).max(500),
  options: z.array(z.string().min(1).max(300)).min(2).max(6),
  answer: z.number().int().min(0),
});

const ModuleDraft = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("roleplay"),
    name: z.string().min(3).max(120),
    persona: z.string().min(10).max(800),
    scenario: z.string().min(10).max(800),
  }),
  z.object({
    type: z.literal("quiz"),
    name: z.string().min(3).max(120),
    body: z.object({
      questions: z.array(QuizQuestion).min(2).max(15),
    }),
  }),
  z.object({
    type: z.literal("gamified"),
    name: z.string().min(3).max(120),
    body: z.object({
      description: z.string().min(20).max(1000),
    }),
  }),
  z.object({
    type: z.literal("evaluation"),
    name: z.string().min(3).max(120),
    body: z.object({
      description: z.string().min(20).max(1000),
    }),
  }),
]);

const QbItemDraft = z.object({
  kind: z.enum(["evaluation", "whatsapp_mcq"]),
  question: z.string().min(3).max(500),
  options: z.array(z.string().min(1).max(300)).min(2).max(6),
  answer: z.number().int().min(0),
});

const Out = z.object({
  modules: z.array(ModuleDraft).max(40).optional().default([]),
  qb_items: z.array(QbItemDraft).max(40).optional().default([]),
});

const PLACEHOLDER_RUBRIC = {
  pass_score: 70,
  criteria: [
    {
      id: "discovery",
      label: "Discovery",
      weight: 0.5,
      description:
        "Asked open-ended questions to surface the buyer's problem.",
    },
    {
      id: "next_step",
      label: "Next step",
      weight: 0.5,
      description: "Closed with a concrete, time-boxed next action.",
    },
  ],
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad body" }, { status: 400 });

  const { trainingId, counts, prompt } = parsed.data;
  const roleplayN = counts.roleplay ?? 0;
  const quizN = counts.quiz ?? 0;
  const gamifiedN = counts.gamified ?? 0;
  const evalModuleN = counts.evaluation_module ?? 0;
  const evalQbN = counts.evaluation ?? 0;
  const waN = counts.whatsapp_mcq ?? 0;
  if (roleplayN + quizN + gamifiedN + evalModuleN + evalQbN + waN === 0) {
    return NextResponse.json(
      { error: "pick at least one item" },
      { status: 400 },
    );
  }

  // Ownership check + load training context.
  const training = await prisma.training.findFirst({
    where: { id: trainingId, companyId: user.companyId },
    select: {
      id: true,
      companyId: true,
      title: true,
      description: true,
      categories: true,
      modules: {
        orderBy: { order: "asc" },
        select: { name: true, type: true, order: true },
      },
      kbSources: {
        where: { content: { not: null } },
        select: {
          name: true,
          content: true,
          kind: true,
          sourceUrl: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!training)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const kbContext = formatKbContext(training.kbSources);

  // Call Anthropic for the drafts.
  const drafts = await draftModules({
    training: {
      title: training.title,
      description: training.description ?? "",
      categories: training.categories,
      existingModuleNames: training.modules.map((m) => m.name),
    },
    counts: {
      roleplay: roleplayN,
      quiz: quizN,
      gamified: gamifiedN,
      evaluation_module: evalModuleN,
      evaluation: evalQbN,
      whatsapp_mcq: waN,
    },
    prompt: prompt?.trim() ?? "",
    kbContext,
  });
  if (!drafts.ok) return NextResponse.json({ error: drafts.error }, { status: 502 });

  // Persist in a single transaction. Each new module's `order` continues
  // from the highest existing order so cards land at the end of Step 2.
  const baseOrder = training.modules.length;
  const created = await prisma.$transaction(async (tx) => {
    let addedModules = 0;
    for (let i = 0; i < drafts.modules.length; i++) {
      const d = drafts.modules[i];
      if (d.type === "roleplay") {
        const mod = await tx.trainingModule.create({
          data: {
            trainingId,
            name: d.name,
            type: "roleplay",
            order: baseOrder + i,
            published: true,
            // Optional: surface the prompt that drove generation so a
            // future re-generate pass can read it back from the body.
            body: prompt ? { generationPrompt: prompt } : undefined,
          },
          select: { id: true },
        });
        await tx.roleplayConfig.create({
          data: {
            moduleId: mod.id,
            persona: d.persona,
            scenario: d.scenario,
            mode: "text",
            rubric: PLACEHOLDER_RUBRIC,
          },
        });
      } else if (d.type === "quiz") {
        await tx.trainingModule.create({
          data: {
            trainingId,
            name: d.name,
            type: "quiz",
            order: baseOrder + i,
            published: true,
            body: {
              questions: d.body.questions,
              ...(prompt ? { generationPrompt: prompt } : {}),
            },
          },
        });
      } else {
        // gamified | evaluation — placeholder body until Phase M ships
        // the real editors. AI returns a one-paragraph `description`
        // we store on body so the trainee surface has something to show.
        await tx.trainingModule.create({
          data: {
            trainingId,
            name: d.name,
            type: d.type,
            order: baseOrder + i,
            published: true,
            body: {
              description: d.body.description,
              ...(prompt ? { generationPrompt: prompt } : {}),
            },
          },
        });
      }
      addedModules++;
    }

    let addedQb = 0;
    for (const q of drafts.qb_items) {
      if (q.answer >= q.options.length) continue;
      await tx.questionBankItem.create({
        data: {
          companyId: training.companyId,
          trainingId,
          kind: q.kind,
          question: q.question,
          options: q.options,
          answer: q.answer,
        },
      });
      addedQb++;
    }
    return { addedModules, addedQb };
  });

  revalidatePath(`/admin/trainings/${trainingId}/edit`);
  return NextResponse.json(created);
}

// ─────────────── KB context ───────────────

function formatKbContext(
  rows: Array<{
    name: string;
    content: string | null;
    kind: string;
    sourceUrl: string | null;
  }>,
): string {
  if (rows.length === 0) return "";
  const perSource = Math.floor(MAX_KB_CHARS / rows.length);
  return rows
    .map((r) => {
      const head = `## Source: ${r.name}${r.sourceUrl ? ` (${r.sourceUrl})` : ""}`;
      const body = (r.content ?? "").slice(0, perSource).trim();
      return `${head}\n${body || "(empty)"}`;
    })
    .join("\n\n");
}

// ─────────────── Anthropic draft pass ───────────────

type DraftResult =
  | {
      ok: true;
      modules: z.infer<typeof ModuleDraft>[];
      qb_items: z.infer<typeof QbItemDraft>[];
    }
  | { ok: false; error: string };

async function draftModules({
  training,
  counts,
  prompt,
  kbContext,
}: {
  training: {
    title: string;
    description: string;
    categories: string[];
    existingModuleNames: string[];
  };
  counts: {
    roleplay: number;
    quiz: number;
    gamified: number;
    evaluation_module: number;
    evaluation: number;
    whatsapp_mcq: number;
  };
  prompt: string;
  kbContext: string;
}): Promise<DraftResult> {
  const system = [
    "You are extending an existing sales L&D training with more modules and reusable question-bank items.",
    "Given the training context (and optional grounding sources + admin note), draft EXACTLY the requested count of each item type.",
    "",
    "Module rules:",
    "- roleplay: write a 1-sentence `persona` (who the learner is talking to) AND a 1-2 sentence `scenario` (the situation). Vary persona toughness across drafts so the learner faces different buyer types.",
    "- quiz: write 3-8 multiple-choice `questions`, each with 2-4 `options` and `answer` (0-indexed correct option). No 'all of the above'. Cover different parts of the training arc.",
    "- gamified: a gamified activity module. Body has a 2-4 sentence `description` of the activity (e.g. a points-based negotiation simulation, scenario-card draw, tactic-matching exercise).",
    "- evaluation: an open-ended evaluation module. Body has a 2-4 sentence `description` of what the learner will be evaluated on and how (e.g. recorded answer to a scenario prompt, scored by AI against an ideal answer).",
    "",
    "Question-bank rules:",
    "- evaluation: single-question reusable MCQs that a future Assessment module can pull from. Each item has `kind: \"evaluation\"`, `question`, `options` (2-4), and `answer` (0-indexed). Cover distinct concepts — don't repeat the same question twice.",
    "- whatsapp_mcq: same structure but short and conversational, ≤120 chars per question — built to be delivered as a single WhatsApp nudge. `kind: \"whatsapp_mcq\"`.",
    "",
    "Overall rules:",
    "- Names: outcome-focused, distinct from existing module names, ≤8 words.",
    "- If grounding sources are provided, EVERY draft must reference specifics from them — names, numbers, exact phrases. Don't invent facts.",
    "- Honor the admin's note if present (focus area, persona type, etc.).",
    "- Use the submit_drafts tool. Never write prose outside the tool call.",
  ].join("\n");

  const ai = await getAIConfig();
  const existing =
    training.existingModuleNames.length > 0
      ? `## Existing modules (don't duplicate these names)\n${training.existingModuleNames.map((n) => `- ${n}`).join("\n")}\n`
      : "";
  const requestParts: string[] = [];
  if (counts.roleplay > 0) requestParts.push(`${counts.roleplay} roleplay module(s)`);
  if (counts.quiz > 0) requestParts.push(`${counts.quiz} quiz module(s)`);
  if (counts.gamified > 0)
    requestParts.push(`${counts.gamified} gamified-activity module(s)`);
  if (counts.evaluation_module > 0)
    requestParts.push(`${counts.evaluation_module} evaluation module(s)`);
  if (counts.evaluation > 0)
    requestParts.push(`${counts.evaluation} evaluation question(s) (question bank)`);
  if (counts.whatsapp_mcq > 0)
    requestParts.push(`${counts.whatsapp_mcq} WhatsApp MCQ item(s) (question bank)`);

  const userMessage = [
    `## Training\nTitle: ${training.title}\nDescription: ${training.description || "(none)"}\nCategories: ${training.categories.join(", ") || "(none)"}`,
    existing,
    `## Request\nDraft ${requestParts.join(", ")}.`,
    prompt ? `## Admin note\n${prompt}` : "",
    kbContext ? `## Grounding sources\n${kbContext}` : "",
    "Use the submit_drafts tool.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await anthropic.messages.create({
    model: kbContext ? ai.model : ai.fastModel,
    max_tokens: 6000,
    system,
    tools: [
      {
        name: "submit_drafts",
        description:
          "Submit the drafted modules and question-bank items.",
        input_schema: {
          type: "object",
          properties: {
            modules: {
              type: "array",
              maxItems: 40,
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["roleplay", "quiz", "gamified", "evaluation"],
                  },
                  name: { type: "string" },
                  // roleplay-only:
                  persona: { type: "string" },
                  scenario: { type: "string" },
                  // quiz / gamified / evaluation:
                  body: {
                    type: "object",
                    properties: {
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
                      description: { type: "string" },
                    },
                  },
                },
                required: ["type", "name"],
              },
            },
            qb_items: {
              type: "array",
              maxItems: 40,
              items: {
                type: "object",
                properties: {
                  kind: {
                    type: "string",
                    enum: ["evaluation", "whatsapp_mcq"],
                  },
                  question: { type: "string" },
                  options: {
                    type: "array",
                    items: { type: "string" },
                  },
                  answer: { type: "number" },
                },
                required: ["kind", "question", "options", "answer"],
              },
            },
          },
        },
      },
    ],
    tool_choice: { type: "tool", name: "submit_drafts" },
    messages: [{ role: "user", content: userMessage }],
  });

  const toolUse = result.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return { ok: false, error: "no draft" };
  }
  const validated = Out.safeParse(toolUse.input);
  if (!validated.success) {
    return { ok: false, error: "invalid draft" };
  }

  // Soft-check: accept what the model returned. If it drifted on count
  // the admin can delete extras from Step 2.
  return {
    ok: true,
    modules: validated.data.modules,
    qb_items: validated.data.qb_items,
  };
}
