"use server";

// Server actions for the Add Training wizard.
//
// All actions validate that the caller is admin of the training's tenant.
// We never trust `trainingId` from the client without re-checking ownership.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { Prisma, type ModuleType } from "@prisma/client";
import { STANDARD_CRITERIA } from "@/lib/evaluation/criteria-library";
import { invalidateTrainings } from "@/lib/db/invalidate";

async function requireAdminOwnsTraining(trainingId: string) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    throw new Error("forbidden");
  }
  const t = await prisma.training.findFirst({
    where: { id: trainingId, companyId: user.companyId },
    select: { id: true, companyId: true, status: true },
  });
  if (!t) throw new Error("not found");
  return { user, training: t };
}

// ──────────── Create draft ────────────

export async function createDraftTraining() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    throw new Error("forbidden");
  }
  const draft = await prisma.training.create({
    data: {
      companyId: user.companyId,
      title: "Untitled training",
      status: "draft",
      categories: [],
    },
    select: { id: true },
  });
  revalidatePath("/admin/trainings");
  invalidateTrainings(user.companyId);
  redirect(`/admin/trainings/${draft.id}/edit?step=1`);
}

// Variant for the /admin/trainings/generator flow: creates a draft and
// returns the id without redirecting, so the client can chain into the
// bulk-generate API call and only navigate after that completes.
export async function createDraftTrainingForGenerator(): Promise<{ id: string }> {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    throw new Error("forbidden");
  }
  const draft = await prisma.training.create({
    data: {
      companyId: user.companyId,
      title: "Untitled training",
      status: "draft",
      categories: [],
    },
    select: { id: true },
  });
  revalidatePath("/admin/trainings");
  invalidateTrainings(user.companyId);
  return { id: draft.id };
}

// ──────────── Step 1 — Basic details ────────────

const BasicSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  categories: z.array(z.string().min(1).max(40)).max(10),
});

export async function saveBasicDetails(
  trainingId: string,
  data: z.infer<typeof BasicSchema>,
  next: boolean,
) {
  const parsed = BasicSchema.safeParse(data);
  if (!parsed.success) throw new Error("invalid input");
  const { training } = await requireAdminOwnsTraining(trainingId);

  await prisma.training.update({
    where: { id: trainingId },
    data: {
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      categories: parsed.data.categories,
    },
  });
  revalidatePath(`/admin/trainings/${trainingId}/edit`);
  invalidateTrainings(training.companyId);
  if (next) redirect(`/admin/trainings/${trainingId}/edit?step=2`);
}

// ──────────── Step 1 — Thumbnail ────────────
//
// Thumbnails now live in Supabase Storage (bucket `attachments`,
// prefix `thumbnails/`). Only the URL is stored on
// `Training.thumbnailUrl`; the storage path is not persisted so old
// files leak when the admin replaces the thumbnail. Follow-up: add
// `thumbnailPath` column when we next touch the schema, then
// orphan-delete on replace. Legacy data-URL thumbnails stay valid —
// `<img src>` accepts both data: and https: URLs.

export async function setTrainingThumbnail(formData: FormData) {
  const trainingId = String(formData.get("trainingId") ?? "").trim();
  if (!trainingId) throw new Error("missing trainingId");
  await requireAdminOwnsTraining(trainingId);

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("missing file");

  const upload = new FormData();
  upload.append("file", file);
  upload.append("category", "thumbnails");
  upload.append("trainingId", trainingId);

  const { uploadAttachment } = await import("./upload-actions");
  const { url } = await uploadAttachment(upload);

  await prisma.training.update({
    where: { id: trainingId },
    data: { thumbnailUrl: url },
  });
  revalidatePath(`/admin/trainings/${trainingId}/edit`);
  revalidatePath("/admin/trainings");
}

export async function clearTrainingThumbnail(trainingId: string) {
  await requireAdminOwnsTraining(trainingId);
  await prisma.training.update({
    where: { id: trainingId },
    data: { thumbnailUrl: null },
  });
  revalidatePath(`/admin/trainings/${trainingId}/edit`);
  revalidatePath("/admin/trainings");
}

// Generates a thumbnail from a free-form prompt and stores it the same
// way an uploaded thumbnail would be stored. When OPENAI_API_KEY is set
// we call gpt-image-1; otherwise we render a deterministic SVG
// placeholder so the feature is usable in dev without an external key.
export async function generateTrainingThumbnail(
  trainingId: string,
  prompt: string,
): Promise<void> {
  const trimmed = prompt.trim();
  if (trimmed.length < 5) throw new Error("Prompt is too short.");
  if (trimmed.length > 800) throw new Error("Prompt is too long.");
  await requireAdminOwnsTraining(trainingId);

  const t = await prisma.training.findUnique({
    where: { id: trainingId },
    select: { title: true },
  });

  const refined = [
    "Training thumbnail illustration, 16:9 landscape, clean modern editorial style, vibrant but professional palette, no text, no logos, no watermark.",
    `Subject: ${trimmed}.`,
    "Composition: centered focal point, balanced negative space, polished corporate / L&D learning aesthetic.",
  ].join(" ");

  let bytes: Uint8Array;
  let contentType: string;
  let ext: string;

  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt: refined,
        size: "1536x1024",
        quality: "medium",
        n: 1,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `image generation failed (${res.status}): ${detail.slice(0, 200)}`,
      );
    }
    const data: { data?: Array<{ b64_json?: string }> } = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error("image generation returned no image.");
    bytes = Uint8Array.from(Buffer.from(b64, "base64"));
    contentType = "image/png";
    ext = "png";
  } else {
    const svg = makePlaceholderSvg(t?.title ?? "Training", trimmed);
    bytes = new TextEncoder().encode(svg);
    contentType = "image/svg+xml";
    ext = "svg";
  }

  const { storagePathFor, uploadToStorage } = await import(
    "@/lib/storage/supabase-storage"
  );
  const path = storagePathFor({
    category: "thumbnails",
    trainingId,
    filename: `ai-generated.${ext}`,
  });
  const { url } = await uploadToStorage({ path, file: bytes, contentType });

  await prisma.training.update({
    where: { id: trainingId },
    data: { thumbnailUrl: url },
  });
  revalidatePath(`/admin/trainings/${trainingId}/edit`);
  revalidatePath("/admin/trainings");
}

// Generates a Scenario Intro illustration from a free-form prompt and
// returns the storage URL. Caller (AdditionalSettingsModal) drops the
// URL into `additionalSettings.scenarioIntroGif` exactly like an
// uploaded GIF — the player renders it through an <img> tag so a
// static PNG works just as well as an animated GIF.
export async function generateScenarioIntroImage(
  trainingId: string,
  prompt: string,
): Promise<{ url: string; name: string }> {
  const trimmed = prompt.trim();
  if (trimmed.length < 5) throw new Error("Prompt is too short.");
  if (trimmed.length > 800) throw new Error("Prompt is too long.");
  await requireAdminOwnsTraining(trainingId);

  const t = await prisma.training.findUnique({
    where: { id: trainingId },
    select: { title: true },
  });

  // 16:9 landscape sized to look right in the pre-session gate the
  // player already renders for the intro. Editorial-style framing
  // matches the rest of the training thumbnails.
  const refined = [
    "Roleplay scenario intro illustration, 16:9 landscape, clean modern editorial style, friendly approachable palette, no text, no logos, no watermark.",
    `Scenario: ${trimmed}.`,
    "Composition: human-centric, conversational mood, balanced negative space, polished corporate / L&D learning aesthetic.",
  ].join(" ");

  let bytes: Uint8Array;
  let contentType: string;
  let ext: string;

  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt: refined,
        size: "1536x1024",
        quality: "medium",
        n: 1,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `image generation failed (${res.status}): ${detail.slice(0, 200)}`,
      );
    }
    const data: { data?: Array<{ b64_json?: string }> } = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error("image generation returned no image.");
    bytes = Uint8Array.from(Buffer.from(b64, "base64"));
    contentType = "image/png";
    ext = "png";
  } else {
    const svg = makePlaceholderSvg(t?.title ?? "Scenario", trimmed);
    bytes = new TextEncoder().encode(svg);
    contentType = "image/svg+xml";
    ext = "svg";
  }

  const { storagePathFor, uploadToStorage } = await import(
    "@/lib/storage/supabase-storage"
  );
  const path = storagePathFor({
    category: "gifs",
    trainingId,
    filename: `ai-scenario-intro.${ext}`,
  });
  const { url } = await uploadToStorage({ path, file: bytes, contentType });
  return { url, name: `ai-scenario-intro.${ext}` };
}

function makePlaceholderSvg(title: string, subject: string): string {
  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (c) =>
      c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
    );
  const safeTitle = esc(title).slice(0, 80) || "Training";
  // Pick a deterministic gradient pair from the subject text so the
  // placeholder feels per-prompt, not always identical.
  const hash = Array.from(subject).reduce(
    (acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0,
    0,
  );
  const palettes: Array<[string, string]> = [
    ["#7c5cd6", "#ff7c52"],
    ["#0ea5e9", "#22c55e"],
    ["#ec4899", "#f59e0b"],
    ["#6366f1", "#06b6d4"],
    ["#ef4444", "#a855f7"],
  ];
  const [a, b] = palettes[hash % palettes.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 1024" width="1536" height="1024"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${a}"/><stop offset="100%" stop-color="${b}"/></linearGradient></defs><rect width="1536" height="1024" fill="url(#g)"/><circle cx="1180" cy="240" r="180" fill="rgba(255,255,255,0.12)"/><circle cx="320" cy="820" r="240" fill="rgba(255,255,255,0.10)"/><text x="768" y="540" fill="#ffffff" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="96" font-weight="800" text-anchor="middle" dominant-baseline="middle">${safeTitle}</text></svg>`;
}

// ──────────── Step 2 — Modules ────────────

const ModuleTypeSchema = z.enum([
  "video",
  "roleplay",
  "quiz",
  "document",
  "gamified",
  "evaluation",
]);

export async function addModule(
  trainingId: string,
  type: ModuleType,
): Promise<{ id: string }> {
  await requireAdminOwnsTraining(trainingId);
  ModuleTypeSchema.parse(type);

  const order = await prisma.trainingModule.count({ where: { trainingId } });
  const created = await prisma.trainingModule.create({
    data: {
      trainingId,
      name: defaultModuleName(type),
      type,
      order,
      // New modules default to published. Admin can flip off any module
      // they're still authoring; the wizard's publish gate only requires
      // at least one published module per training.
      published: true,
    },
    select: { id: true, type: true },
  });

  // Auto-seed a placeholder RoleplayConfig so the editor has something to bind.
  if (created.type === "roleplay") {
    await prisma.roleplayConfig.create({
      data: {
        moduleId: created.id,
        persona: "A buyer at a mid-sized company. Replace with your scenario.",
        scenario: "Cold call — replace with the situation the learner faces.",
        mode: "text",
        rubric: PLACEHOLDER_RUBRIC,
      },
    });
  }
  revalidatePath(`/admin/trainings/${trainingId}/edit`);
  return { id: created.id };
}

const ModuleUpdateSchema = z.object({
  name: z.string().min(1).max(200),
  published: z.boolean(),
});

// ──────────── Step 2 — Create Roleplay (from the "+ Add New Module"
// → Roleplay intermediate page). Captures Person 1 (Human) / Person 2
// (AI) / Context & Situation upfront so the persona+scenario start
// with real values instead of placeholder copy.

const CreateRoleplaySchema = z.object({
  person1: z.string().trim().max(500),
  person2: z.string().trim().max(500),
  context: z.string().trim().max(4000),
});

// ──────────── Step 2 — Create Coach module ────────────
//
// Coach is shown as its own top-level type in the "+ Add New Module"
// dropdown, but the `coach` enum value isn't in ModuleType yet (would
// need a Prisma migration). We store Coach modules as `document` type
// with `body.kind: "coach"` and the form inputs in `body.coachConfig`
// so the per-module edit page can branch on the marker later. Promote
// to a real ModuleType once Phase M is being built.

const CoachInputSchema = z.object({
  trainingUsecase: z.enum(["sales", "fundamental"]),
  typeOfCoach: z.enum(["normal", "ppt"]),
  objectiveContext: z.string().trim().max(4000),
});

// ──────────── Step 2 — Create Scorm module ────────────
//
// Same temporary-storage convention as Coach: `scorm` isn't in the
// Prisma ModuleType enum yet, so Scorm modules persist as `document`
// with `body.kind: "scorm"` and the uploaded package in body.scorm.
// Promote to a real ModuleType once Phase M is being built.

export async function createScormModule(
  trainingId: string,
): Promise<{ id: string }> {
  await requireAdminOwnsTraining(trainingId);

  const order = await prisma.trainingModule.count({ where: { trainingId } });
  const created = await prisma.trainingModule.create({
    data: {
      trainingId,
      name: "New SCORM module",
      type: "document",
      order,
      published: true,
      body: { kind: "scorm" },
    },
    select: { id: true },
  });

  revalidatePath(`/admin/trainings/${trainingId}/edit`);
  return { id: created.id };
}

// ──────────── Scorm module — full save ────────────

const ScormPackageSchema = z.object({
  name: z.string().min(1).max(300),
  url: z.string().max(8_000_000),
  size: z.number().int().min(0),
});

const ScormModuleSchema = z.object({
  name: z.string().min(1).max(200),
  published: z.boolean(),
  description: z.string().max(20000),
  scormPackage: ScormPackageSchema.nullable(),
});

export async function saveScormModule(
  trainingId: string,
  moduleId: string,
  data: z.infer<typeof ScormModuleSchema>,
) {
  await requireAdminOwnsTraining(trainingId);
  const parsed = ScormModuleSchema.parse(data);

  const mod = await prisma.trainingModule.findFirst({
    where: { id: moduleId, trainingId, type: "document" },
    select: { body: true },
  });
  if (!mod) throw new Error("not found");

  const current =
    mod.body && typeof mod.body === "object" && !Array.isArray(mod.body)
      ? (mod.body as Record<string, unknown>)
      : {};
  if (current.kind !== "scorm") throw new Error("not a scorm module");

  const nextBody = {
    ...current,
    description: parsed.description,
    scorm: parsed.scormPackage,
  };

  await prisma.trainingModule.update({
    where: { id: moduleId },
    data: {
      name: parsed.name,
      published: parsed.published,
      body: nextBody as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/admin/trainings/${trainingId}/edit`);
}

export async function createCoachModule(
  trainingId: string,
  input: z.infer<typeof CoachInputSchema>,
): Promise<{ id: string }> {
  await requireAdminOwnsTraining(trainingId);
  const parsed = CoachInputSchema.parse(input);

  const order = await prisma.trainingModule.count({ where: { trainingId } });
  const created = await prisma.trainingModule.create({
    data: {
      trainingId,
      name:
        parsed.typeOfCoach === "ppt"
          ? "New PPT coach"
          : "New coach module",
      type: "document",
      order,
      published: true,
      body: {
        kind: "coach",
        coachConfig: {
          trainingUsecase: parsed.trainingUsecase,
          typeOfCoach: parsed.typeOfCoach,
          objectiveContext: parsed.objectiveContext,
        },
      },
    },
    select: { id: true },
  });

  revalidatePath(`/admin/trainings/${trainingId}/edit`);
  return { id: created.id };
}

// ──────────── Step 2 — Create Assessment module ────────────
//
// Same intermediate-page pattern as Coach + Roleplay. The dropdown's
// "Assessment" entry routes to /modules/new/assessment where the
// admin picks number of questions + writes a scope/criteria blurb.
// Manual create persists an empty quiz; Generate calls the AI route.

const CreateAssessmentSchema = z.object({
  numberOfQuestions: z.number().int().min(1).max(100),
  scopeAndCriteria: z.string().trim().max(4000),
});

export async function createAssessmentModule(
  trainingId: string,
  input: z.infer<typeof CreateAssessmentSchema>,
): Promise<{ id: string }> {
  await requireAdminOwnsTraining(trainingId);
  const parsed = CreateAssessmentSchema.parse(input);

  const order = await prisma.trainingModule.count({ where: { trainingId } });
  const created = await prisma.trainingModule.create({
    data: {
      trainingId,
      name: "New knowledge check",
      type: "quiz",
      order,
      published: true,
      body: {
        questions: [],
        scopeAndCriteria: parsed.scopeAndCriteria,
        targetCount: parsed.numberOfQuestions,
      },
    },
    select: { id: true },
  });

  revalidatePath(`/admin/trainings/${trainingId}/edit`);
  return { id: created.id };
}

// ──────────── Step 2 — Create Activity module ────────────
//
// Same intermediate-page pattern. The dropdown's "Activities" entry
// (ModuleType.gamified) routes to /modules/new/activity where the
// admin picks a duration preset and writes the learning goals brief.

const CreateActivitySchema = z.object({
  duration: z.enum(["short", "medium", "long"]),
  prompt: z.string().trim().max(4000),
});

const DURATION_MINUTES: Record<"short" | "medium" | "long", number> = {
  short: 3,
  medium: 5,
  long: 7,
};

export async function createActivityModule(
  trainingId: string,
  input: z.infer<typeof CreateActivitySchema>,
): Promise<{ id: string }> {
  await requireAdminOwnsTraining(trainingId);
  const parsed = CreateActivitySchema.parse(input);

  const order = await prisma.trainingModule.count({ where: { trainingId } });
  const created = await prisma.trainingModule.create({
    data: {
      trainingId,
      name: "New gamified activity",
      type: "gamified",
      order,
      published: true,
      body: {
        description: parsed.prompt,
        duration: parsed.duration,
        duration_min: DURATION_MINUTES[parsed.duration],
        prompt: parsed.prompt,
      },
    },
    select: { id: true },
  });

  revalidatePath(`/admin/trainings/${trainingId}/edit`);
  return { id: created.id };
}

export async function createRoleplayModule(
  trainingId: string,
  input: z.infer<typeof CreateRoleplaySchema>,
): Promise<{ id: string }> {
  await requireAdminOwnsTraining(trainingId);
  const parsed = CreateRoleplaySchema.parse(input);

  const person1 = parsed.person1 || "Sales Rep";
  const person2 = parsed.person2 || "Customer";
  const context = parsed.context || "";

  const order = await prisma.trainingModule.count({ where: { trainingId } });
  const created = await prisma.trainingModule.create({
    data: {
      trainingId,
      name: `${person1} × ${person2} roleplay`,
      type: "roleplay",
      order,
      published: true,
      // Round-trip the form inputs so the per-module edit screen can
      // re-render Person 1 / Person 2 labels (Phase K) without a schema
      // migration.
      body: { person1, person2, context },
    },
    select: { id: true },
  });

  await prisma.roleplayConfig.create({
    data: {
      moduleId: created.id,
      persona: person2,
      scenario: context || "Replace with the situation the learner faces.",
      mode: "text",
      rubric: PLACEHOLDER_RUBRIC,
    },
  });

  revalidatePath(`/admin/trainings/${trainingId}/edit`);
  return { id: created.id };
}

// Bulk-add via AI lives at /api/admin/bulk-generate-modules. The Add
// Module modal calls that route directly so it can stream a long
// Anthropic call without being bound to a server-action timeout.

// ──────────── Question Bank items ────────────

const QbItemSchema = z.object({
  kind: z.enum(["evaluation", "whatsapp_mcq"]),
  question: z.string().min(3).max(500),
  options: z.array(z.string().min(1).max(300)).min(2).max(6),
  answer: z.number().int().min(0),
  tags: z.array(z.string().min(1).max(40)).max(10).optional(),
});

export async function createQuestionBankItem(
  trainingId: string,
  data: z.infer<typeof QbItemSchema>,
) {
  const parsed = QbItemSchema.safeParse(data);
  if (!parsed.success) throw new Error("invalid input");
  if (parsed.data.answer >= parsed.data.options.length) {
    throw new Error("answer index out of range");
  }
  const { training } = await requireAdminOwnsTraining(trainingId);

  await prisma.questionBankItem.create({
    data: {
      companyId: training.companyId,
      trainingId,
      kind: parsed.data.kind,
      question: parsed.data.question,
      options: parsed.data.options,
      answer: parsed.data.answer,
      tags: parsed.data.tags ?? [],
    },
  });
  revalidatePath(`/admin/trainings/${trainingId}/edit`);
}

export async function deleteQuestionBankItem(
  trainingId: string,
  itemId: string,
) {
  const { training } = await requireAdminOwnsTraining(trainingId);
  // Scope the delete to the tenant — never trust a client-supplied id.
  await prisma.questionBankItem.deleteMany({
    where: { id: itemId, companyId: training.companyId },
  });
  revalidatePath(`/admin/trainings/${trainingId}/edit`);
}

export async function updateModule(
  trainingId: string,
  moduleId: string,
  data: z.infer<typeof ModuleUpdateSchema>,
) {
  await requireAdminOwnsTraining(trainingId);
  const parsed = ModuleUpdateSchema.parse(data);
  await prisma.trainingModule.update({
    where: { id: moduleId, trainingId },
    data: parsed,
  });
  revalidatePath(`/admin/trainings/${trainingId}/edit`);
}

// Per-type body shapes for video / document / quiz modules. Roleplay
// uses its own RoleplayConfig table — never touched here.
const VideoBodySchema = z.object({
  videoUrl: z.string().url().max(2000).nullable(),
  duration_min: z.number().int().min(0).max(600).nullable(),
  // Optional narration the avatar-render pipeline will speak.
  videoScript: z.string().max(8000).nullable().optional(),
});
const DocumentBodySchema = z.object({
  markdown: z.string().max(20000),
});
const QuizQuestionSchema = z.object({
  q: z.string().min(1).max(500),
  options: z.array(z.string().min(1).max(300)).min(2).max(8),
  answer: z.number().int().min(0),
}).refine((q) => q.answer < q.options.length, {
  message: "answer index out of range",
});
const QuizBodySchema = z.object({
  questions: z.array(QuizQuestionSchema).min(1).max(50),
});

const ModuleBodySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("video"), body: VideoBodySchema }),
  z.object({ type: z.literal("document"), body: DocumentBodySchema }),
  z.object({ type: z.literal("quiz"), body: QuizBodySchema }),
]);

export async function updateModuleBody(
  trainingId: string,
  moduleId: string,
  payload: z.infer<typeof ModuleBodySchema>,
) {
  await requireAdminOwnsTraining(trainingId);
  const parsed = ModuleBodySchema.parse(payload);
  // Re-fetch to verify the module's stored type matches the payload type;
  // otherwise a client could write quiz JSON into a video module's body.
  const mod = await prisma.trainingModule.findFirst({
    where: { id: moduleId, trainingId },
    select: { type: true, body: true },
  });
  if (!mod) throw new Error("not found");
  if (mod.type !== parsed.type) throw new Error("type mismatch");

  // Merge with existing body so non-editor-owned fields survive — most
  // importantly `renderJob` (managed by the avatar render pipeline) and
  // `videoUrl` set by a completed render that the admin hasn't refreshed
  // out of yet.
  const current =
    mod.body && typeof mod.body === "object" && !Array.isArray(mod.body)
      ? (mod.body as Record<string, unknown>)
      : {};
  await prisma.trainingModule.update({
    where: { id: moduleId },
    data: { body: { ...current, ...parsed.body } },
  });
  revalidatePath(`/admin/trainings/${trainingId}/edit`);
}

const RoleplayUpdateSchema = z.object({
  persona: z.string().min(10).max(2000),
  scenario: z.string().min(10).max(2000),
});

export async function updateRoleplayConfig(
  trainingId: string,
  moduleId: string,
  data: z.infer<typeof RoleplayUpdateSchema>,
) {
  await requireAdminOwnsTraining(trainingId);
  const parsed = RoleplayUpdateSchema.parse(data);
  await prisma.roleplayConfig.update({
    where: { moduleId },
    data: parsed,
  });
  revalidatePath(`/admin/trainings/${trainingId}/edit`);
}

/**
 * Reorder modules within a training. Pass the new order as an array
 * of moduleIds; we re-number `order` to match the array index in a
 * single transaction. Caller is responsible for verifying the
 * trainingId; we re-verify here and that the supplied IDs cover the
 * full module set so a partial array can't orphan rows.
 */
export async function reorderModules(
  trainingId: string,
  moduleIdsInOrder: string[],
): Promise<void> {
  await requireAdminOwnsTraining(trainingId);

  // Fetch the current set so we can validate the supplied ordering
  // covers exactly those IDs — no missing, no extras.
  const existing = await prisma.trainingModule.findMany({
    where: { trainingId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((m) => m.id));
  if (moduleIdsInOrder.length !== existingIds.size) {
    throw new Error("reorder payload missing modules");
  }
  for (const id of moduleIdsInOrder) {
    if (!existingIds.has(id)) {
      throw new Error("reorder payload references unknown module");
    }
  }

  await prisma.$transaction(
    moduleIdsInOrder.map((id, idx) =>
      prisma.trainingModule.update({
        where: { id, trainingId },
        data: { order: idx },
      }),
    ),
  );
  revalidatePath(`/admin/trainings/${trainingId}/edit`);
}

export async function deleteModule(trainingId: string, moduleId: string) {
  await requireAdminOwnsTraining(trainingId);
  await prisma.trainingModule.delete({
    where: { id: moduleId, trainingId },
  });
  revalidatePath(`/admin/trainings/${trainingId}/edit`);
}

// Hard-delete a training and everything that cascades off it (modules,
// roleplay sessions, assignments, completions, feedback, etc — see the
// onDelete: Cascade arrows in schema.prisma). LibraryItem /
// KnowledgeBaseItem / Notification rows that reference this training
// are kept (their relations use SetNull) so we don't lose unrelated
// state. Tenant scope is enforced by requireAdminOwnsTraining.
export async function deleteTraining(trainingId: string) {
  const { user } = await requireAdminOwnsTraining(trainingId);
  await prisma.training.delete({ where: { id: trainingId } });
  await audit({
    actorId: user.id,
    companyId: user.companyId ?? null,
    action: "training.delete",
    target: `training:${trainingId}`,
  });
  revalidatePath("/admin/trainings");
  if (user.companyId) invalidateTrainings(user.companyId);
}

// ──────────── Roleplay module — full save ────────────
//
// Composite "Save" for the redesigned per-module roleplay editor page.
// Writes the header (name + published), the body (person1, person2,
// idealConversation, visualAids, keywords, showKeywords, scoringMode,
// evaluationCriteria, additionalSettings), and mirrors scenario+persona
// into RoleplayConfig so the existing trainee/runtime surfaces keep
// working. One call per "Save" press.

const VisualAidSchema = z.object({
  name: z.string().max(200),
  url: z.string().max(4000),
});
const ChecklistItemSchema = z.object({
  id: z.string().max(60),
  label: z.string().min(1).max(300),
  visible: z.boolean(),
});
const EvalCriterionSchema = z.object({
  id: z.string().max(60),
  label: z.string().min(1).max(200),
  // Percentage weight. Persisted as 0–100 integer; the AI rubric writer
  // below normalises to a 0–1 fraction (RubricShape contract).
  weight: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .default(0),
  items: z.array(ChecklistItemSchema).max(20),
});
const PersonaSchema = z.object({
  title: z.string().trim().max(200),
  behavior: z.enum([
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
  ]),
  backgroundDetails: z.array(z.string().min(1).max(200)).max(10),
  additionalPrompt: z.string().trim().max(4000),
  avatarGender: z.enum(["male", "female", "neutral"]),
  avatarStyle: z.enum(["animated", "custom"]),
  avatarId: z.string().max(80).nullable(),
  backgroundId: z.string().max(80).nullable(),
  languages: z.array(z.string().min(1).max(40)).max(20),
  voiceId: z.string().max(80).nullable(),
  // Per-persona LiveAvatar override. When set, the streaming session
  // for this module prefers these IDs over the provider default. Stored
  // alongside the cosmetic avatar/voice IDs above so admins can tell at
  // a glance which UUID will actually drive the live stream.
  liveAvatarId: z.string().trim().max(120).nullable().optional(),
  liveAvatarName: z.string().trim().max(200).nullable().optional(),
  liveVoiceId: z.string().trim().max(120).nullable().optional(),
  liveVoiceName: z.string().trim().max(200).nullable().optional(),
  liveDisplayUrl: z.string().trim().max(4000).nullable().optional(),
  // Phase 3: admin-picked ElevenLabs voice for the trainee player.
  // Nullable so the "Auto" option (fall back to gender-based default)
  // round-trips through save cleanly.
  elevenLabsVoiceId: z.string().trim().max(120).nullable().optional(),
});

const AdditionalSettingsSchema = z
  .object({
    modes: z.object({
      video: z.boolean(),
      onlyAiVideo: z.boolean(),
      onlyUserVideo: z.boolean(),
      audio: z.boolean(),
      userChoice: z.boolean(),
    }),
    recordAv: z.enum(["yes", "no"]),
    attempts: z.object({
      kind: z.enum(["unlimited", "limited"]),
      limit: z.number().int().min(1).max(50),
    }),
    followIdealConversation: z.boolean(),
    minDurationMin: z.number().int().min(1).max(60),
    maxDurationMin: z.number().int().min(1).max(60),
    failBelowMinDuration: z.boolean(),
    showExplanation: z.boolean(),
    autoDisconnectOnLimit: z.boolean(),
    disconnectOnInactivity: z.boolean(),
    hints: z.object({
      kind: z.enum(["yes", "no", "limited"]),
      limit: z.number().int().min(1).max(20),
    }),
    hintType: z.enum(["complete", "bullet"]),
    startRoleplayBy: z.enum(["ai", "user", "either"]),
    endRoleplayBy: z.enum(["ai", "user", "either"]),
    scenarioIntroGif: z
      .object({ name: z.string().min(1).max(200), dataUrl: z.string().max(2000) })
      .nullable(),
    tipsOnReportGif: z
      .object({ name: z.string().min(1).max(200), dataUrl: z.string().max(2000) })
      .nullable(),
    // Fast mode — /turn uses Haiku instead of Sonnet. Optional so
    // modules saved before this field existed continue to parse.
    fastMode: z.boolean().optional().default(false),
  })
  .refine(
    (d) =>
      d.modes.video ||
      d.modes.onlyAiVideo ||
      d.modes.onlyUserVideo ||
      d.modes.audio ||
      d.modes.userChoice,
    { message: "At least one mode must be selected.", path: ["modes"] },
  )
  .refine((d) => !(d.modes.onlyAiVideo && d.modes.onlyUserVideo), {
    message: "Pick either Only AI Video or Only User Video, not both.",
    path: ["modes", "onlyAiVideo"],
  })
  .refine((d) => d.minDurationMin <= d.maxDurationMin, {
    message: "Minimum duration must be less than or equal to maximum.",
    path: ["maxDurationMin"],
  });

const RoleplayModuleSchema = z
  .object({
    name: z.string().min(1).max(200),
    published: z.boolean(),
    person1: z.string().trim().max(500),
    person2: z.string().trim().max(500),
    scenario: z.string().max(8000),
    idealConversation: z.string().max(8000),
    visualAids: z.array(VisualAidSchema).max(20),
    keywords: z.array(z.string().min(1).max(80)).max(40),
    showKeywords: z.boolean(),
    scoringMode: z.enum(["checklist", "standard"]),
    evaluationCriteria: z.array(EvalCriterionSchema).max(20),
    additionalSettings: AdditionalSettingsSchema.optional(),
    persona: PersonaSchema.optional(),
  })
  .superRefine((d, ctx) => {
    // Evaluation criteria weightage must sum to 100 when at least one
    // criterion is present. Empty list is allowed (rubric falls back to
    // the placeholder for backwards compat). This mirrors the client
    // check in validateCriteriaWeights so tampered payloads are rejected
    // server-side too.
    if (d.evaluationCriteria.length === 0) return;
    const total = d.evaluationCriteria.reduce(
      (sum, c) => sum + (c.weight ?? 0),
      0,
    );
    if (total !== 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evaluationCriteria"],
        message: `Evaluation criteria weightage must total 100% (received ${total}%).`,
      });
    }
  });

// ──────────── Gamified (Activity) module — full save ────────────
//
// Composite save for the redesigned per-module Gamified editor. Body
// shape: description (rich text), duration preset (short/medium/long),
// duration_min (derived but stored), and exercises[] (each is a short
// prompt the learner works through).

const GamifiedModuleSchema = z.object({
  name: z.string().min(1).max(200),
  published: z.boolean(),
  description: z.string().max(8000),
  duration: z.enum(["short", "medium", "long"]),
  exercises: z.array(z.string().min(1).max(500)).max(20),
});

const GAMIFIED_DURATION_MIN: Record<"short" | "medium" | "long", number> = {
  short: 3,
  medium: 5,
  long: 7,
};

export async function saveGamifiedModule(
  trainingId: string,
  moduleId: string,
  data: z.infer<typeof GamifiedModuleSchema>,
) {
  await requireAdminOwnsTraining(trainingId);
  const parsed = GamifiedModuleSchema.parse(data);

  const mod = await prisma.trainingModule.findFirst({
    where: { id: moduleId, trainingId, type: "gamified" },
    select: { body: true },
  });
  if (!mod) throw new Error("not found");

  const current =
    mod.body && typeof mod.body === "object" && !Array.isArray(mod.body)
      ? (mod.body as Record<string, unknown>)
      : {};

  const nextBody = {
    ...current,
    description: parsed.description,
    duration: parsed.duration,
    duration_min: GAMIFIED_DURATION_MIN[parsed.duration],
    exercises: parsed.exercises,
  };

  await prisma.trainingModule.update({
    where: { id: moduleId },
    data: {
      name: parsed.name,
      published: parsed.published,
      body: nextBody as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/admin/trainings/${trainingId}/edit`);
}

// ──────────── Assessment (Quiz) module — full save ────────────
//
// Composite save for the redesigned Assessment editor. body.questions
// is the canonical question list; we also round-trip scopeAndCriteria
// + targetCount so "Regenerate" has them as defaults.

const AssessmentQuestionSchema = z.object({
  q: z.string().min(1).max(500),
  options: z.array(z.string().min(1).max(300)).min(2).max(8),
  answer: z.number().int().min(0),
}).refine((q) => q.answer < q.options.length, {
  message: "answer index out of range",
});

const AssessmentModuleSchema = z.object({
  name: z.string().min(1).max(200),
  published: z.boolean(),
  scopeAndCriteria: z.string().max(4000),
  questions: z.array(AssessmentQuestionSchema).min(1).max(100),
});

export async function saveAssessmentModule(
  trainingId: string,
  moduleId: string,
  data: z.infer<typeof AssessmentModuleSchema>,
) {
  await requireAdminOwnsTraining(trainingId);
  const parsed = AssessmentModuleSchema.parse(data);

  const mod = await prisma.trainingModule.findFirst({
    where: { id: moduleId, trainingId, type: "quiz" },
    select: { body: true },
  });
  if (!mod) throw new Error("not found");

  const current =
    mod.body && typeof mod.body === "object" && !Array.isArray(mod.body)
      ? (mod.body as Record<string, unknown>)
      : {};

  const nextBody = {
    ...current,
    questions: parsed.questions,
    scopeAndCriteria: parsed.scopeAndCriteria,
    targetCount: parsed.questions.length,
  };

  await prisma.trainingModule.update({
    where: { id: moduleId },
    data: {
      name: parsed.name,
      published: parsed.published,
      body: nextBody as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/admin/trainings/${trainingId}/edit`);
}

// ──────────── Coach module — full save ────────────
//
// Coach modules persist as ModuleType.document with body.kind=coach.
// This action is the canonical save for the dedicated Coach editor.
// Body shape:
//   { kind: "coach", coachConfig: { trainingUsecase, typeOfCoach,
//     objectiveContext, outline, guidance } }

const CoachModuleSchema = z.object({
  name: z.string().min(1).max(200),
  published: z.boolean(),
  trainingUsecase: z.enum(["sales", "fundamental"]),
  typeOfCoach: z.enum(["normal", "ppt"]),
  objectiveContext: z.string().max(8000),
  outline: z.string().max(8000),
  guidance: z.string().max(8000),
});

export async function saveCoachModule(
  trainingId: string,
  moduleId: string,
  data: z.infer<typeof CoachModuleSchema>,
) {
  await requireAdminOwnsTraining(trainingId);
  const parsed = CoachModuleSchema.parse(data);

  const mod = await prisma.trainingModule.findFirst({
    where: { id: moduleId, trainingId, type: "document" },
    select: { body: true },
  });
  if (!mod) throw new Error("not found");

  const current =
    mod.body && typeof mod.body === "object" && !Array.isArray(mod.body)
      ? (mod.body as Record<string, unknown>)
      : {};
  if (current.kind !== "coach") throw new Error("not a coach module");

  const nextBody = {
    ...current,
    kind: "coach",
    coachConfig: {
      trainingUsecase: parsed.trainingUsecase,
      typeOfCoach: parsed.typeOfCoach,
      objectiveContext: parsed.objectiveContext,
      outline: parsed.outline,
      guidance: parsed.guidance,
    },
  };

  await prisma.trainingModule.update({
    where: { id: moduleId },
    data: {
      name: parsed.name,
      published: parsed.published,
      body: nextBody as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/admin/trainings/${trainingId}/edit`);
}

// ──────────── Evaluation module — full save ────────────
//
// Composite save for the redesigned per-module Evaluation editor.
// Writes header (name + published) plus every Evaluation Setting on
// body. No nested Prisma table — all knobs live on body.evaluation.

const EvaluationModuleSchema = z.object({
  name: z.string().min(1).max(200),
  published: z.boolean(),
  selectionMode: z.enum(["random", "manual"]),
  numberOfQuestions: z.number().int().min(1).max(100).nullable(),
  timeLimit: z.enum(["global", "per_question"]),
  totalTimeLimitMin: z.number().int().min(1).max(600),
  perQuestionTimeLimitSec: z.number().int().min(5).max(600),
  attempts: z.object({
    kind: z.enum(["unlimited", "limited"]),
    limit: z.number().int().min(1).max(50),
  }),
  scoring: z.enum(["keyword_weightage", "ai"]),
  speechDelivery: z.boolean(),
  hideAnswerFromUser: z.boolean(),
  modeOfEvaluation: z.enum(["user_choice", "video", "audio"]),
});

export async function saveEvaluationModule(
  trainingId: string,
  moduleId: string,
  data: z.infer<typeof EvaluationModuleSchema>,
) {
  await requireAdminOwnsTraining(trainingId);
  const parsed = EvaluationModuleSchema.parse(data);

  const mod = await prisma.trainingModule.findFirst({
    where: { id: moduleId, trainingId, type: "evaluation" },
    select: { body: true },
  });
  if (!mod) throw new Error("not found");

  const current =
    mod.body && typeof mod.body === "object" && !Array.isArray(mod.body)
      ? (mod.body as Record<string, unknown>)
      : {};

  const nextBody = {
    ...current,
    evaluation: {
      selectionMode: parsed.selectionMode,
      numberOfQuestions: parsed.numberOfQuestions,
      timeLimit: parsed.timeLimit,
      totalTimeLimitMin: parsed.totalTimeLimitMin,
      perQuestionTimeLimitSec: parsed.perQuestionTimeLimitSec,
      attempts: parsed.attempts,
      scoring: parsed.scoring,
      speechDelivery: parsed.speechDelivery,
      hideAnswerFromUser: parsed.hideAnswerFromUser,
      modeOfEvaluation: parsed.modeOfEvaluation,
    },
  };

  await prisma.trainingModule.update({
    where: { id: moduleId },
    data: {
      name: parsed.name,
      published: parsed.published,
      body: nextBody as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/admin/trainings/${trainingId}/edit`);
}

// ──────────── Document module — full save ────────────
//
// Composite save for the redesigned per-module Document editor page.
// Writes header (name + published) and body (description rich text +
// uploaded documents). Documents are stored as a list of
// {name, kind, url} entries — `url` is a data URL or external link.

const DocumentEntrySchema = z.object({
  name: z.string().min(1).max(300),
  kind: z.enum(["docx", "pdf", "pptx", "other"]),
  url: z.string().max(8_000_000), // big-enough for inline data URLs
});

const DocumentModuleSchema = z.object({
  name: z.string().min(1).max(200),
  published: z.boolean(),
  description: z.string().max(20000),
  documents: z.array(DocumentEntrySchema).max(20),
});

export async function saveDocumentModule(
  trainingId: string,
  moduleId: string,
  data: z.infer<typeof DocumentModuleSchema>,
) {
  await requireAdminOwnsTraining(trainingId);
  const parsed = DocumentModuleSchema.parse(data);

  const mod = await prisma.trainingModule.findFirst({
    where: { id: moduleId, trainingId, type: "document" },
    select: { body: true },
  });
  if (!mod) throw new Error("not found");

  const current =
    mod.body && typeof mod.body === "object" && !Array.isArray(mod.body)
      ? (mod.body as Record<string, unknown>)
      : {};

  const nextBody = {
    ...current,
    description: parsed.description,
    documents: parsed.documents,
  };

  await prisma.trainingModule.update({
    where: { id: moduleId },
    data: {
      name: parsed.name,
      published: parsed.published,
      body: nextBody as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/admin/trainings/${trainingId}/edit`);
}

// ──────────── Video module — full save ────────────
//
// Composite save for the redesigned per-module Video editor page.
// Writes header (name + published) and body (description rich text,
// languages, videoUrl, duration_min, videoScript, source method).
// renderJob is preserved as-is so an in-flight HeyGen render isn't
// clobbered by a description-only save.

const SlideSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(2000),
  narration: z.string().max(2000),
});

const VideoModuleSchema = z.object({
  name: z.string().min(1).max(200),
  published: z.boolean(),
  description: z.string().max(20000),
  languages: z.array(z.string().min(1).max(40)).max(20),
  source: z.enum(["upload", "ai_presentation", "roleplay_video"]).nullable(),
  videoUrl: z.string().max(4000).nullable(),
  duration_min: z.number().int().min(0).max(600).nullable(),
  videoScript: z.string().max(8000).nullable(),
  // AI Presentation panel saves slides[] here so the trainee surface
  // (and a future slide-render pipeline) can read it back. Optional —
  // only present when source === "ai_presentation".
  slides: z.array(SlideSchema).max(20).nullable().optional(),
});

export async function saveVideoModule(
  trainingId: string,
  moduleId: string,
  data: z.infer<typeof VideoModuleSchema>,
) {
  await requireAdminOwnsTraining(trainingId);
  const parsed = VideoModuleSchema.parse(data);

  const mod = await prisma.trainingModule.findFirst({
    where: { id: moduleId, trainingId, type: "video" },
    select: { body: true },
  });
  if (!mod) throw new Error("not found");

  const current =
    mod.body && typeof mod.body === "object" && !Array.isArray(mod.body)
      ? (mod.body as Record<string, unknown>)
      : {};

  const nextBody = {
    ...current,
    description: parsed.description,
    languages: parsed.languages,
    source: parsed.source,
    videoUrl: parsed.videoUrl,
    duration_min: parsed.duration_min,
    videoScript: parsed.videoScript,
    // Persist slides only when the editor passed them through — keep
    // the prior shape for any module that's never seen the AI panel.
    ...(parsed.slides !== undefined ? { slides: parsed.slides } : {}),
  };

  await prisma.trainingModule.update({
    where: { id: moduleId },
    data: {
      name: parsed.name,
      published: parsed.published,
      body: nextBody as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/admin/trainings/${trainingId}/edit`);
}

export async function saveRoleplayModule(
  trainingId: string,
  moduleId: string,
  data: z.infer<typeof RoleplayModuleSchema>,
) {
  await requireAdminOwnsTraining(trainingId);
  const parsed = RoleplayModuleSchema.parse(data);

  const mod = await prisma.trainingModule.findFirst({
    where: { id: moduleId, trainingId, type: "roleplay" },
    select: { body: true, roleplayConfig: { select: { moduleId: true } } },
  });
  if (!mod) throw new Error("not found");

  const current =
    mod.body && typeof mod.body === "object" && !Array.isArray(mod.body)
      ? (mod.body as Record<string, unknown>)
      : {};

  const nextBody = {
    ...current,
    person1: parsed.person1,
    person2: parsed.person2,
    scenario: parsed.scenario,
    idealConversation: parsed.idealConversation,
    visualAids: parsed.visualAids,
    keywords: parsed.keywords,
    showKeywords: parsed.showKeywords,
    scoringMode: parsed.scoringMode,
    evaluationCriteria: parsed.evaluationCriteria,
    additionalSettings: parsed.additionalSettings ?? {},
    ...(parsed.persona ? { persona: parsed.persona } : {}),
  };

  await prisma.trainingModule.update({
    where: { id: moduleId },
    // additionalSettings is open-shape user input; Prisma's strict
    // InputJsonValue rejects Record<string, unknown> without an
    // intermediate cast through Prisma.InputJsonValue.
    data: {
      name: parsed.name,
      published: parsed.published,
      body: nextBody as Prisma.InputJsonValue,
    },
  });

  // Mirror scenario + Person 2 into RoleplayConfig so the chat runtime
  // and trainee surfaces (which read from RoleplayConfig) stay in sync.
  // Fall back to safe placeholders if either side is empty — the column
  // is NOT NULL.
  const persona = parsed.person2 || "Customer";
  const scenarioText = parsed.scenario.trim() || "Replace with the situation.";
  // Build a runtime rubric from the admin's chosen evaluation criteria
  // so the AI scorer / hint / coach routes all use the same list the
  // admin sees. Weights are normalised from 0–100 % to 0–1 fractions
  // because that's what RubricShape and the scorer expect. If no
  // criteria are configured we keep the historical PLACEHOLDER_RUBRIC
  // to preserve behaviour for legacy modules that never touched this
  // section.
  const runtimeRubric = buildRuntimeRubric(parsed.evaluationCriteria);
  if (mod.roleplayConfig) {
    await prisma.roleplayConfig.update({
      where: { moduleId },
      data: { persona, scenario: scenarioText, rubric: runtimeRubric },
    });
  } else {
    await prisma.roleplayConfig.create({
      data: {
        moduleId,
        persona,
        scenario: scenarioText,
        mode: "text",
        rubric: runtimeRubric,
      },
    });
  }

  revalidatePath(`/admin/trainings/${trainingId}/edit`);
  // Cross-user invalidation: trainee play pages read the same
  // module.body (voice ID, persona, criteria) via loadModuleForUser.
  // Without this, a trainee who had the play page loaded before the
  // admin's save would still be served the pre-change RSC payload
  // from Next's route cache — leading to the "admin changed the
  // voice but trainee still hears the old one" report. The wildcard
  // covers every module route under this training.
  revalidatePath(`/learn/trainings/${trainingId}`);
  revalidatePath(`/learn/trainings/${trainingId}/modules/${moduleId}/play`);
}

/**
 * Flip every unpublished module in this training to published in one go.
 * Returns the number of modules that changed so callers can render a
 * "N published" toast / pill. Idempotent: re-calling does nothing.
 */
export async function publishAllModules(trainingId: string): Promise<number> {
  const { training } = await requireAdminOwnsTraining(trainingId);
  const result = await prisma.trainingModule.updateMany({
    where: { trainingId, published: false },
    data: { published: true },
  });
  revalidatePath(`/admin/trainings/${trainingId}/edit`);
  invalidateTrainings(training.companyId);
  return result.count;
}

export async function goToStep(trainingId: string, step: number) {
  await requireAdminOwnsTraining(trainingId);
  redirect(`/admin/trainings/${trainingId}/edit?step=${step}`);
}

// ──────────── Step 2 — Knowledge sources ────────────

/**
 * Attach an existing tenant-library KbSource to this training. The same
 * row stays in the library; we just point trainingId at this training so
 * the wizard's "attached" list picks it up and so the source travels
 * with the training in exports/reports.
 */
export async function attachKbSourceToTraining(
  trainingId: string,
  kbSourceId: string,
) {
  const { user } = await requireAdminOwnsTraining(trainingId);
  await prisma.kbSource.updateMany({
    where: { id: kbSourceId, companyId: user.companyId! },
    data: { trainingId },
  });
  revalidatePath(`/admin/trainings/${trainingId}/edit`);
}

/**
 * Detach a source from the training. The KbSource itself stays alive in
 * the company library (trainingId = null); admins delete it permanently
 * from /admin/knowledge.
 */
export async function detachKbSourceFromTraining(
  trainingId: string,
  kbSourceId: string,
) {
  const { user } = await requireAdminOwnsTraining(trainingId);
  await prisma.kbSource.updateMany({
    where: {
      id: kbSourceId,
      companyId: user.companyId!,
      trainingId,
    },
    data: { trainingId: null },
  });
  revalidatePath(`/admin/trainings/${trainingId}/edit`);
}

// ──────────── Step 3 — Assign ────────────

const AssignSchema = z.object({
  userIds: z.array(z.string().uuid()),
  priority: z.enum(["p1", "p2", "p3"]),
  dueAt: z.string().optional().nullable(),
});

export async function saveAssignments(
  trainingId: string,
  data: z.infer<typeof AssignSchema>,
  next: boolean,
) {
  const { user } = await requireAdminOwnsTraining(trainingId);
  const parsed = AssignSchema.parse(data);

  // Verify all userIds belong to the same tenant.
  if (parsed.userIds.length > 0) {
    const tenantUsers = await prisma.user.findMany({
      where: { id: { in: parsed.userIds }, companyId: user.companyId },
      select: { id: true },
    });
    if (tenantUsers.length !== parsed.userIds.length) {
      throw new Error("cross-tenant user");
    }
  }

  const dueAt = parsed.dueAt ? new Date(parsed.dueAt) : null;

  // Reconcile: remove assignments for unselected users, upsert for selected.
  const existing = await prisma.assignment.findMany({
    where: { trainingId },
    select: { id: true, userId: true },
  });
  const existingByUser = new Map(existing.map((a) => [a.userId, a.id]));
  const targetSet = new Set(parsed.userIds);

  const toDelete = existing
    .filter((a) => !targetSet.has(a.userId))
    .map((a) => a.id);
  const toCreate = parsed.userIds.filter((u) => !existingByUser.has(u));
  const toUpdate = parsed.userIds.filter((u) => existingByUser.has(u));

  await prisma.$transaction([
    prisma.assignment.deleteMany({ where: { id: { in: toDelete } } }),
    ...toUpdate.map((uid) =>
      prisma.assignment.update({
        where: { id: existingByUser.get(uid)! },
        data: { priority: parsed.priority, dueAt },
      }),
    ),
    ...toCreate.map((uid) =>
      prisma.assignment.create({
        data: {
          trainingId,
          userId: uid,
          priority: parsed.priority,
          dueAt,
          status: "not_started",
          progress: 0,
        },
      }),
    ),
  ]);

  revalidatePath(`/admin/trainings/${trainingId}/edit`);
  if (next) redirect(`/admin/trainings/${trainingId}/edit?step=4`);
}

// ──────────── Step 4 — Settings ────────────

const SettingsSchema = z.object({
  visibility: z.enum(["private", "org_wide", "public"]),
  prerequisiteIds: z.array(z.string().uuid()).max(20),
  selfEnrollment: z.boolean(),
  startAt: z.string().nullable(), // YYYY-MM-DD or null
  dueAt: z.string().nullable(),
  repeat: z.enum(["never", "weekly", "monthly", "quarterly"]),
  issueCertificate: z.boolean(),
  passingScore: z.number().int().min(0).max(100),
  rewardPoints: z.number().int().min(0).max(100_000),
  adaptiveDifficulty: z.boolean(),
  liveCoachTips: z.boolean(),
  followUpNudges: z.boolean(),
  feedbackTone: z.enum(["soft", "balanced", "direct"]),
});

export async function saveTrainingSettings(
  trainingId: string,
  data: z.infer<typeof SettingsSchema>,
) {
  const parsed = SettingsSchema.safeParse(data);
  if (!parsed.success) throw new Error("invalid input");
  const { training } = await requireAdminOwnsTraining(trainingId);

  // Reject self-referential prerequisites and any IDs from another tenant.
  const ids = parsed.data.prerequisiteIds.filter((id) => id !== trainingId);
  const owned = ids.length
    ? await prisma.training.findMany({
        where: { id: { in: ids }, companyId: training.companyId },
        select: { id: true },
      })
    : [];
  const safeIds = owned.map((t) => t.id);

  await prisma.training.update({
    where: { id: trainingId },
    data: {
      visibility: parsed.data.visibility,
      prerequisiteIds: safeIds,
      selfEnrollment: parsed.data.selfEnrollment,
      startAt: parsed.data.startAt ? new Date(parsed.data.startAt) : null,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      repeat: parsed.data.repeat,
      issueCertificate: parsed.data.issueCertificate,
      passingScore: parsed.data.passingScore,
      rewardPoints: parsed.data.rewardPoints,
      adaptiveDifficulty: parsed.data.adaptiveDifficulty,
      liveCoachTips: parsed.data.liveCoachTips,
      followUpNudges: parsed.data.followUpNudges,
      feedbackTone: parsed.data.feedbackTone,
    },
  });
  revalidatePath(`/admin/trainings/${trainingId}/edit`);
}

// ──────────── Step 4 — Publish ────────────

export async function publishTraining(trainingId: string) {
  const { user, training } = await requireAdminOwnsTraining(trainingId);
  await prisma.training.update({
    where: { id: trainingId },
    data: { status: "published" },
  });
  await audit({
    actorId: user.id,
    companyId: training.companyId,
    action: "training.publish",
    target: `training:${trainingId}`,
  });
  revalidatePath("/admin/trainings");
  redirect("/admin/trainings?tab=published");
}

export async function saveDraftAndExit(trainingId: string) {
  await requireAdminOwnsTraining(trainingId);
  revalidatePath("/admin/trainings");
  redirect("/admin/trainings?tab=draft");
}

// ──────────── Helpers ────────────

function defaultModuleName(type: ModuleType): string {
  switch (type) {
    case "video":
      return "New video module";
    case "roleplay":
      return "New roleplay scenario";
    case "quiz":
      return "New knowledge check";
    case "document":
      return "New document module";
    case "gamified":
      return "New gamified activity";
    case "evaluation":
      return "New evaluation module";
  }
}

// Minimal rubric so the seeded roleplay can score immediately.
const PLACEHOLDER_RUBRIC = {
  pass_score: 70,
  criteria: [
    {
      id: "discovery",
      label: "Discovery",
      weight: 0.5,
      description: "Asked open-ended questions to surface the buyer's problem.",
    },
    {
      id: "next_step",
      label: "Next step",
      weight: 0.5,
      description: "Closed with a concrete, time-boxed next action.",
    },
  ],
};

// Convert the admin-configured evaluationCriteria into the runtime
// rubric shape the AI scorer / hint / coach routes consume. The saved
// UI weight is 0–100 (%); the rubric contract wants 0–1 fractions.
// When the admin hasn't picked anything, we keep PLACEHOLDER_RUBRIC so
// existing modules continue to score the same way they did before this
// change.
function buildRuntimeRubric(
  criteria: z.infer<typeof EvalCriterionSchema>[],
): typeof PLACEHOLDER_RUBRIC {
  if (criteria.length === 0) return PLACEHOLDER_RUBRIC;
  const standardDesc: Record<string, string> = Object.fromEntries(
    STANDARD_CRITERIA.map((c) => [c.id, c.description]),
  );
  return {
    pass_score: 70,
    criteria: criteria.map((c) => ({
      id: c.id,
      label: c.label,
      weight: (c.weight ?? 0) / 100,
      description:
        standardDesc[c.id] ??
        (c.items.length > 0
          ? `Judge across: ${c.items.map((it) => it.label).join("; ")}`
          : `Rate the learner on ${c.label}.`),
    })),
  };
}
