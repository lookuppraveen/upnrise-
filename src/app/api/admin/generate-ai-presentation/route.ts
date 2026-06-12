// POST /api/admin/generate-ai-presentation
//
// Body: { trainingId, moduleId, prompt }
// Resp: { name, slides: [{title, body, narration}], combinedNarration }
//
// Generates a slide deck from a text prompt for the AI Presentation
// card in the Video module editor. The slide structure lives in
// body.aiPresentation; combinedNarration is the concatenated script
// the existing avatar render pipeline can consume to produce a
// narrated video. We don't persist here — the panel previews the
// draft and the admin saves through the standard saveVideoModule path.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { anthropic, MODEL_FAST } from "@/lib/ai/client";

const Body = z.object({
  trainingId: z.string().uuid(),
  moduleId: z.string().uuid(),
  prompt: z.string().trim().min(20).max(4000),
});

const SlideSchema = z.object({
  title: z.string().min(2).max(120),
  body: z.string().min(5).max(600),
  narration: z.string().min(20).max(800),
});

const DraftSchema = z.object({
  name: z.string().min(3).max(120),
  slides: z.array(SlideSchema).min(3).max(12),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  const { trainingId, moduleId, prompt } = parsed.data;

  const mod = await prisma.trainingModule.findFirst({
    where: {
      id: moduleId,
      trainingId,
      type: "video",
      training: { companyId: user.companyId },
    },
    select: {
      id: true,
      training: {
        select: { title: true, description: true, categories: true },
      },
    },
  });
  if (!mod)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const draft = await draftPresentation({
    trainingTitle: mod.training.title,
    trainingDescription: mod.training.description ?? "",
    categories: mod.training.categories,
    prompt,
  });
  if (!draft.ok)
    return NextResponse.json({ error: draft.error }, { status: 502 });

  // Concatenate narrations into a single avatar script so the existing
  // renderAvatarVideo pipeline can speak the whole deck.
  const combinedNarration = draft.value.slides
    .map((s, i) => `Slide ${i + 1}: ${s.title}.\n${s.narration}`)
    .join("\n\n");

  return NextResponse.json({
    name: draft.value.name,
    slides: draft.value.slides,
    combinedNarration,
  });
}

async function draftPresentation(args: {
  trainingTitle: string;
  trainingDescription: string;
  categories: string[];
  prompt: string;
}): Promise<
  | { ok: true; value: z.infer<typeof DraftSchema> }
  | { ok: false; error: string }
> {
  const sys = `You design narrated slide decks for corporate L&D training. Output a single tool call with a short module name and a deck of 4–8 slides. Each slide must have:
- title: a punchy slide title (≤ 8 words)
- body: 1–4 bullet points the slide displays, separated by newlines, each prefixed with "- "
- narration: a 1–3 sentence paragraph the avatar speaks while the slide is on screen. Conversational, not formal.

First slide is the framing ("Why this matters"). Last slide is a wrap-up with a clear takeaway. Ground in the training context.`;

  const userPrompt = [
    `Training: ${args.trainingTitle}`,
    args.trainingDescription ? `Description: ${args.trainingDescription}` : "",
    args.categories.length ? `Categories: ${args.categories.join(", ")}` : "",
    "",
    "Presentation brief:",
    args.prompt,
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
          name: "submit_presentation",
          description: "Submit the drafted presentation.",
          input_schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              slides: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    body: { type: "string" },
                    narration: { type: "string" },
                  },
                  required: ["title", "body", "narration"],
                },
              },
            },
            required: ["name", "slides"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "submit_presentation" },
      messages: [{ role: "user", content: userPrompt }],
    });
    const block = res.content.find((c) => c.type === "tool_use");
    if (!block || block.type !== "tool_use")
      return { ok: false, error: "no tool_use in response" };
    const parsedDraft = DraftSchema.safeParse(block.input);
    if (!parsedDraft.success)
      return { ok: false, error: "AI returned malformed draft" };
    return { ok: true, value: parsedDraft.data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI call failed" };
  }
}
