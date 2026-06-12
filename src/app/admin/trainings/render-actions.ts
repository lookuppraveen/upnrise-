"use server";

// Render-with-avatar action. Kicks off an avatar video render against
// the tenant's default VideoProvider, then stashes the job descriptor
// inside the module's body JSON. The trainee module page reads it to
// show a "Generating video…" placeholder; the webhook
// (/api/render/[provider]/webhook) flips the status to "ready" and
// writes the final URL into body.videoUrl.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDriver } from "@/lib/video";
import type { RenderJob } from "@/lib/video/types";

const Input = z.object({
  moduleId: z.string().uuid(),
});

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    throw new Error("forbidden");
  }
  return user;
}

export async function renderAvatarVideo(
  args: z.infer<typeof Input>,
): Promise<{ jobId: string; provider: string }> {
  const user = await requireAdmin();
  const { moduleId } = Input.parse(args);

  // 1. Verify the module belongs to the tenant + is video + has a script.
  const mod = await prisma.trainingModule.findFirst({
    where: {
      id: moduleId,
      training: { companyId: user.companyId! },
    },
    select: {
      id: true,
      type: true,
      name: true,
      body: true,
      trainingId: true,
    },
  });
  if (!mod) throw new Error("module not found");
  if (mod.type !== "video") throw new Error("only video modules can be rendered");

  const body =
    mod.body && typeof mod.body === "object" && !Array.isArray(mod.body)
      ? (mod.body as Record<string, unknown>)
      : {};
  const script =
    typeof body.videoScript === "string" ? body.videoScript : null;
  if (!script || script.trim().length < 20) {
    throw new Error("module has no video script to render");
  }

  // 2. Resolve the default provider for this tenant.
  const provider = await prisma.videoProvider.findFirst({
    where: { companyId: user.companyId!, isDefault: true },
    select: {
      id: true,
      kind: true,
      apiKey: true,
      avatarId: true,
      voiceId: true,
    },
  });
  if (!provider) {
    throw new Error(
      "no default video provider configured — add one at /admin/video-providers",
    );
  }

  // 3. Fire the render.
  const driver = getDriver(provider.kind);
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host");
  const callbackUrl = host
    ? `${proto}://${host}/api/render/${provider.kind}/webhook?moduleId=${moduleId}`
    : undefined;

  const { jobId } = await driver.createVideo({
    apiKey: provider.apiKey,
    avatarId: provider.avatarId,
    voiceId: provider.voiceId,
    script,
    title: mod.name,
    callbackUrl,
  });

  // 4. Stash the job descriptor on the module.
  const job: RenderJob = {
    provider: provider.kind,
    providerId: provider.id,
    jobId,
    status: "queued",
    startedAt: new Date().toISOString(),
  };
  await prisma.trainingModule.update({
    where: { id: moduleId },
    data: {
      body: { ...body, renderJob: job },
    },
  });

  revalidatePath(`/admin/trainings/${mod.trainingId}/edit`);
  revalidatePath(`/learn/trainings/${mod.trainingId}/modules/${moduleId}`);
  return { jobId, provider: provider.kind };
}

/**
 * Poll the provider for the current status and apply it to the module
 * body. Used by the "Refresh status" button in the wizard for providers
 * that don't fire webhooks (or while we're testing without a public URL).
 */
export async function refreshRenderStatus(
  moduleId: string,
): Promise<{ status: string; videoUrl?: string }> {
  const user = await requireAdmin();

  const mod = await prisma.trainingModule.findFirst({
    where: { id: moduleId, training: { companyId: user.companyId! } },
    select: { id: true, body: true, trainingId: true },
  });
  if (!mod) throw new Error("module not found");
  const body =
    mod.body && typeof mod.body === "object" && !Array.isArray(mod.body)
      ? (mod.body as Record<string, unknown>)
      : {};
  const job = (body.renderJob ?? null) as RenderJob | null;
  if (!job) return { status: "idle" };

  const provider = await prisma.videoProvider.findFirst({
    where: { id: job.providerId, companyId: user.companyId! },
    select: { kind: true, apiKey: true },
  });
  if (!provider) return { status: job.status };

  const driver = getDriver(provider.kind);
  const res = await driver.fetchStatus(job.jobId, provider.apiKey);

  const nextBody: Record<string, unknown> = { ...body };
  if (res.status === "ready" && res.videoUrl) {
    nextBody.videoUrl = res.videoUrl;
    delete nextBody.renderJob;
  } else {
    nextBody.renderJob = { ...job, status: res.status, error: res.error };
  }

  await prisma.trainingModule.update({
    where: { id: moduleId },
    data: { body: nextBody as Prisma.InputJsonValue },
  });
  revalidatePath(`/admin/trainings/${mod.trainingId}/edit`);
  revalidatePath(`/learn/trainings/${mod.trainingId}/modules/${moduleId}`);
  return { status: res.status, videoUrl: res.videoUrl };
}
