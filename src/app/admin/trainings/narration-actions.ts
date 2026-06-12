"use server";

// Narration module server actions.
//
// Persistence convention follows Coach/Scorm: ModuleType.narration isn't
// in the Prisma enum yet, so narration modules persist as `document`
// with `body.kind: "narration"`. Promote to a real ModuleType once the
// audio-module surface is generally shipping.
//
// Body shape:
//   {
//     kind: "narration",
//     script: string,
//     voiceId: string | null,
//     audioUrl: string | null,
//     audioPath: string | null,    // bucket-relative; used to delete on regen
//     renderedAt: ISO string | null,
//   }

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { renderNarrationAudio } from "@/lib/video/providers/elevenlabs-tts";
import {
  deleteFromStorage,
  storagePathFor,
  uploadToStorage,
} from "@/lib/storage/supabase-storage";
import { readNarrationBody, type NarrationBody } from "./narration-body";

async function requireAdminOwnsTraining(trainingId: string) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    throw new Error("forbidden");
  }
  const t = await prisma.training.findFirst({
    where: { id: trainingId, companyId: user.companyId },
    select: { id: true, companyId: true },
  });
  if (!t) throw new Error("not found");
  return { user, training: t };
}

async function requireAdminOwnsModule(moduleId: string) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    throw new Error("forbidden");
  }
  const m = await prisma.trainingModule.findFirst({
    where: { id: moduleId, training: { companyId: user.companyId } },
    select: { id: true, trainingId: true, body: true, type: true },
  });
  if (!m) throw new Error("not found");
  return { user, module: m };
}

// ──────────── Create ────────────

export async function createNarrationModule(
  trainingId: string,
): Promise<{ id: string }> {
  await requireAdminOwnsTraining(trainingId);

  const order = await prisma.trainingModule.count({ where: { trainingId } });
  const created = await prisma.trainingModule.create({
    data: {
      trainingId,
      name: "New narration",
      type: "document",
      order,
      published: false,
      body: {
        kind: "narration",
        script: "",
        voiceId: null,
        audioUrl: null,
        audioPath: null,
        renderedAt: null,
      },
    },
    select: { id: true },
  });
  revalidatePath(`/admin/trainings/${trainingId}/edit`);
  return { id: created.id };
}

// ──────────── Save draft (no render) ────────────

const SaveSchema = z.object({
  moduleId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  published: z.boolean(),
  script: z.string().trim().max(20_000),
  voiceId: z.string().trim().max(120).nullable(),
});

export async function saveNarrationModule(
  input: z.infer<typeof SaveSchema>,
): Promise<void> {
  const parsed = SaveSchema.parse(input);
  const { module: m } = await requireAdminOwnsModule(parsed.moduleId);
  const body = readNarrationBody(m.body);

  const nextBody: NarrationBody = {
    ...body,
    kind: "narration",
    script: parsed.script,
    voiceId: parsed.voiceId,
  };

  await prisma.trainingModule.update({
    where: { id: parsed.moduleId },
    data: {
      name: parsed.name,
      published: parsed.published,
      body: nextBody as unknown as Prisma.InputJsonValue,
    },
  });
  revalidatePath(`/admin/trainings/${m.trainingId}/edit`);
}

// ──────────── Render audio via ElevenLabs ────────────

const RenderSchema = z.object({
  moduleId: z.string().uuid(),
  script: z.string().trim().min(1).max(20_000),
  voiceId: z.string().trim().max(120).nullable(),
});

export async function renderNarrationModule(
  input: z.infer<typeof RenderSchema>,
): Promise<{ audioUrl: string }> {
  const parsed = RenderSchema.parse(input);
  const { user, module: m } = await requireAdminOwnsModule(parsed.moduleId);

  // ElevenLabs key lives on the company's VideoProvider row with
  // kind=elevenlabs. The row doesn't have to be marked default —
  // narration uses any available ElevenLabs row for the tenant.
  const provider = await prisma.videoProvider.findFirst({
    where: { companyId: user.companyId!, kind: "elevenlabs" },
    select: { apiKey: true, voiceId: true },
    orderBy: { isDefault: "desc" },
  });
  if (!provider) {
    throw new Error(
      "No ElevenLabs provider configured. Add one at /admin/video-providers — paste your xi-api-key and (optionally) a default voice id.",
    );
  }
  const voiceId = parsed.voiceId ?? provider.voiceId;

  const { bytes, contentType } = await renderNarrationAudio({
    apiKey: provider.apiKey,
    voiceId,
    script: parsed.script,
  });

  const existing = readNarrationBody(m.body);
  // Drop the prior file once the new upload lands — keeps the bucket
  // tidy and avoids paying for orphaned binaries.
  if (existing.audioPath) {
    void deleteFromStorage(existing.audioPath).catch(() => {});
  }

  const path = storagePathFor({
    category: "narrations",
    trainingId: m.trainingId,
    moduleId: m.id,
    filename: `narration-${Date.now()}.mp3`,
  });
  const { url, path: uploadedPath } = await uploadToStorage({
    path,
    file: bytes,
    contentType,
    upsert: true,
  });

  const nextBody: NarrationBody = {
    ...existing,
    kind: "narration",
    script: parsed.script,
    voiceId,
    audioUrl: url,
    audioPath: uploadedPath,
    renderedAt: new Date().toISOString(),
  };
  await prisma.trainingModule.update({
    where: { id: parsed.moduleId },
    data: { body: nextBody as unknown as Prisma.InputJsonValue },
  });
  revalidatePath(`/admin/trainings/${m.trainingId}/edit`);
  return { audioUrl: url };
}

