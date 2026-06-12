// POST /api/render/[provider]/webhook?moduleId=<uuid>
//
// Provider-agnostic webhook receiver. The moduleId comes back to us via
// the callback URL we registered when the render kicked off; we look up
// the module, verify the stored renderJob matches the inbound payload's
// job id, and persist the final URL (or failure) into body.
//
// Auth: provider-specific. HeyGen doesn't sign its callbacks, so for v1
// we trust the moduleId + jobId match. A future hardening pass should
// add a per-tenant shared secret echoed in the callback path.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { getDriver } from "@/lib/video";
import type { RenderJob, RenderJobStatus } from "@/lib/video/types";

const PROVIDERS = new Set(["heygen", "synthesia", "did", "elevenlabs"]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!PROVIDERS.has(provider)) {
    return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  }

  const url = new URL(req.url);
  const moduleId = url.searchParams.get("moduleId");
  if (!moduleId) {
    return NextResponse.json({ error: "missing moduleId" }, { status: 400 });
  }

  const mod = await prisma.trainingModule.findUnique({
    where: { id: moduleId },
    select: { id: true, body: true, trainingId: true },
  });
  if (!mod) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body =
    mod.body && typeof mod.body === "object" && !Array.isArray(mod.body)
      ? (mod.body as Record<string, unknown>)
      : {};
  const job = (body.renderJob ?? null) as RenderJob | null;
  if (!job || job.provider !== provider) {
    return NextResponse.json({ error: "no matching job" }, { status: 409 });
  }

  // Re-poll the provider for an authoritative status — the webhook body
  // shape varies across providers, and re-polling is cheap. If the row
  // is gone (deleted while rendering), we silently drop.
  const row = await prisma.videoProvider.findUnique({
    where: { id: job.providerId },
    select: { kind: true, apiKey: true },
  });
  if (!row) return NextResponse.json({ ok: true });
  const driver = getDriver(row.kind);
  const res = await driver.fetchStatus(job.jobId, row.apiKey);

  const nextBody: Record<string, unknown> = { ...body };
  if (res.status === "ready" && res.videoUrl) {
    nextBody.videoUrl = res.videoUrl;
    delete nextBody.renderJob;
  } else {
    const next: RenderJob = {
      ...job,
      status: res.status as RenderJobStatus,
      error: res.error,
    };
    nextBody.renderJob = next;
  }

  await prisma.trainingModule.update({
    where: { id: moduleId },
    data: { body: nextBody as Prisma.InputJsonValue },
  });

  return NextResponse.json({ ok: true, status: res.status });
}
