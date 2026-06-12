"use server";

// Server actions for tenant feed posts. Admin only.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { buildDraftsForCompany, type Draft } from "@/lib/feeds/auto-draft";

const PostSchema = z.object({
  kind: z.enum(["announcement", "win"]),
  body: z.string().min(2).max(2000).trim(),
});

export async function createFeedPost(data: z.infer<typeof PostSchema>) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    throw new Error("forbidden");
  }
  const parsed = PostSchema.parse(data);
  await prisma.feedPost.create({
    data: {
      companyId: user.companyId,
      authorId: user.id,
      kind: parsed.kind,
      body: parsed.body,
    },
  });
  revalidatePath("/admin/feeds");
  revalidatePath("/learn/feeds");
}

// Generate fresh drafts on-demand from real tenant activity. Returns up to
// 3 posts; admin chooses what to publish via publishDraftedPost().
export async function generateDrafts(): Promise<Draft[]> {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    throw new Error("forbidden");
  }
  return buildDraftsForCompany(user.companyId);
}

const DraftPublishSchema = z.object({
  kind: z.enum(["announcement", "win", "ai_nudge"]),
  body: z.string().min(2).max(2000).trim(),
});

// Publish a Copilot-drafted post. authorId is null so the post renders
// with the AI-grad gradient in FeedPostRow.
export async function publishDraftedPost(
  data: z.infer<typeof DraftPublishSchema>,
) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    throw new Error("forbidden");
  }
  const parsed = DraftPublishSchema.parse(data);
  await prisma.feedPost.create({
    data: {
      companyId: user.companyId,
      authorId: null,
      kind: parsed.kind,
      body: parsed.body,
    },
  });
  revalidatePath("/admin/feeds");
  revalidatePath("/learn/feeds");
}

export async function deleteFeedPost(id: string) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    throw new Error("forbidden");
  }
  const existing = await prisma.feedPost.findFirst({
    where: { id, companyId: user.companyId },
    select: { id: true },
  });
  if (!existing) throw new Error("not found");
  await prisma.feedPost.delete({ where: { id } });
  revalidatePath("/admin/feeds");
  revalidatePath("/learn/feeds");
}
