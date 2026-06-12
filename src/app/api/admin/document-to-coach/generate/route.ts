// POST /api/admin/document-to-coach/generate
//
// Body: { trainingId, documentModuleId }
// Resp: { id }
//
// Companion to the "Generate using PPT" button in the Document
// module editor. Reads the source Document's description + uploaded
// document filenames, asks Anthropic to draft a PPT-style Coach
// (slide titles + speaking guidance), and persists it as a new Coach
// module right after the source Document.

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { anthropic, MODEL_FAST } from "@/lib/ai/client";

const Body = z.object({
  trainingId: z.string().uuid(),
  documentModuleId: z.string().uuid(),
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
  const { trainingId, documentModuleId } = parsed.data;

  const source = await prisma.trainingModule.findFirst({
    where: {
      id: documentModuleId,
      trainingId,
      type: "document",
      training: { companyId: user.companyId },
    },
    select: {
      id: true,
      name: true,
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
  if (!source)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const body =
    source.body && typeof source.body === "object" && !Array.isArray(source.body)
      ? (source.body as Record<string, unknown>)
      : {};
  const description =
    typeof body.description === "string" ? body.description : "";
  const docs = Array.isArray(body.documents) ? body.documents : [];
  const docNames = docs
    .map((d) => (d && typeof d === "object" ? (d as { name?: unknown }).name : null))
    .filter((n): n is string => typeof n === "string");

  if (description.trim().length < 20 && docNames.length === 0) {
    return NextResponse.json(
      {
        error:
          "Add a module description (or upload documents) before generating a PPT — the AI needs source material.",
      },
      { status: 400 },
    );
  }

  const draft = await draftCoachFromDocument({
    trainingTitle: source.training.title,
    trainingDescription: source.training.description ?? "",
    categories: source.training.categories,
    sourceName: source.name,
    description,
    docNames,
  });
  if (!draft.ok)
    return NextResponse.json({ error: draft.error }, { status: 502 });

  // Insert the new Coach module right after the source Document so
  // the PPT companion sits next to its source in the Step 2 grid.
  const order = await prisma.trainingModule.count({ where: { trainingId } });
  const mod = await prisma.trainingModule.create({
    data: {
      trainingId,
      name: draft.value.name,
      type: "document",
      order,
      published: true,
      body: {
        kind: "coach",
        coachConfig: {
          trainingUsecase: "fundamental",
          typeOfCoach: "ppt",
          objectiveContext: description || `Slide deck companion for "${source.name}".`,
          outline: draft.value.outline,
          guidance: draft.value.guidance,
        },
        sourceDocumentModuleId: source.id,
        generationPrompt: description,
      },
    },
    select: { id: true },
  });

  revalidatePath(`/admin/trainings/${trainingId}/edit`);
  return NextResponse.json({ id: mod.id });
}

async function draftCoachFromDocument(args: {
  trainingTitle: string;
  trainingDescription: string;
  categories: string[];
  sourceName: string;
  description: string;
  docNames: string[];
}): Promise<
  | { ok: true; value: z.infer<typeof DraftSchema> }
  | { ok: false; error: string }
> {
  const sys = `You convert source documentation into a PPT-style Coach module — a slide-by-slide walk-through that an AI coach uses to teach the learner.

Return a single tool call with:
- name: a short module title (3–8 words). Make it a PPT-style title.
- outline: 5–8 slide titles, one per line, prefixed with "- ". Each slide should be a discrete idea or step. First slide is the framing ("Why this matters"), last is "Wrap-up & next steps".
- guidance: 1 paragraph (80–140 words) the AI coach will use to stay on-topic. Describe tone, what to emphasise, and check-in moments between slides.`;

  const userPrompt = [
    `Training: ${args.trainingTitle}`,
    args.trainingDescription ? `Description: ${args.trainingDescription}` : "",
    args.categories.length ? `Categories: ${args.categories.join(", ")}` : "",
    `Source Document module: "${args.sourceName}"`,
    "",
    "Source description (what the learner should walk away knowing):",
    args.description || "(none)",
    args.docNames.length
      ? "\nUploaded reference documents:\n" +
        args.docNames.map((n) => `- ${n}`).join("\n")
      : "",
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
          name: "submit_coach_from_document",
          description: "Submit the PPT-style coach drafted from a Document.",
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
      tool_choice: { type: "tool", name: "submit_coach_from_document" },
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
