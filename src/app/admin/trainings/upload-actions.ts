"use server";

// Server actions for trainee/admin file uploads. Wraps
// uploadToStorage with per-category validation and tenant ownership
// checks so editor components can just FormData-POST a file and get
// back a permanent URL.

import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import {
  storagePathFor,
  uploadToStorage,
  deleteFromStorage,
} from "@/lib/storage/supabase-storage";

// ─────────────── Category limits + MIME allow-list ───────────────

type Category =
  | "thumbnails"
  | "documents"
  | "scorm"
  | "videos"
  | "visual-aids"
  | "gifs";

const LIMITS: Record<
  Category,
  { maxBytes: number; mimes: Set<string>; extensions: string[] }
> = {
  thumbnails: {
    maxBytes: 4 * 1024 * 1024,
    mimes: new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]),
    extensions: ["png", "jpg", "jpeg", "webp"],
  },
  documents: {
    maxBytes: 25 * 1024 * 1024,
    mimes: new Set([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ]),
    extensions: ["pdf", "docx", "pptx"],
  },
  scorm: {
    maxBytes: 1024 * 1024 * 1024,
    mimes: new Set([
      "application/zip",
      "application/x-zip-compressed",
      "application/octet-stream",
    ]),
    extensions: ["zip"],
  },
  videos: {
    maxBytes: 1024 * 1024 * 1024,
    mimes: new Set([
      "video/mp4",
      "video/quicktime",
      "video/x-m4v",
      "application/octet-stream",
    ]),
    extensions: ["mp4", "mov", "m4v"],
  },
  "visual-aids": {
    maxBytes: 8 * 1024 * 1024,
    mimes: new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]),
    extensions: ["png", "jpg", "jpeg", "webp"],
  },
  gifs: {
    maxBytes: 20 * 1024 * 1024,
    mimes: new Set(["image/gif"]),
    extensions: ["gif"],
  },
};

const CategorySchema = z.enum([
  "thumbnails",
  "documents",
  "scorm",
  "videos",
  "visual-aids",
  "gifs",
]);

// ─────────────── Ownership + auth ───────────────

async function requireAdminOwnsTraining(trainingId: string) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    throw new Error("forbidden");
  }
  const t = await prisma.training.findFirst({
    where: { id: trainingId, companyId: user.companyId },
    select: { id: true },
  });
  if (!t) throw new Error("training not found");
}

async function requireAdminOwnsModule(trainingId: string, moduleId: string) {
  await requireAdminOwnsTraining(trainingId);
  const m = await prisma.trainingModule.findFirst({
    where: { id: moduleId, trainingId },
    select: { id: true },
  });
  if (!m) throw new Error("module not found");
}

// ─────────────── Upload action ───────────────

/**
 * Upload a single file. The caller posts a FormData with:
 *   - file        : File
 *   - category    : "thumbnails" | "documents" | "scorm" | …
 *   - trainingId  : uuid
 *   - moduleId?   : uuid (required except for "thumbnails")
 *
 * Returns the permanent public URL + storage path. The path is
 * persisted alongside the URL so the row can be reliably deleted
 * later via deleteAttachment.
 */
export async function uploadAttachment(formData: FormData): Promise<{
  url: string;
  path: string;
  name: string;
  size: number;
  contentType: string;
}> {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("missing file");

  const categoryRaw = String(formData.get("category") ?? "").trim();
  const category = CategorySchema.parse(categoryRaw) as Category;

  const trainingId = String(formData.get("trainingId") ?? "").trim();
  if (!trainingId) throw new Error("missing trainingId");

  const moduleIdRaw = formData.get("moduleId");
  const moduleId =
    typeof moduleIdRaw === "string" && moduleIdRaw.trim().length > 0
      ? moduleIdRaw.trim()
      : null;

  if (category !== "thumbnails" && !moduleId) {
    throw new Error("missing moduleId for non-thumbnail upload");
  }

  // Auth + ownership.
  if (moduleId) {
    await requireAdminOwnsModule(trainingId, moduleId);
  } else {
    await requireAdminOwnsTraining(trainingId);
  }

  // Per-category validation.
  const limits = LIMITS[category];
  if (file.size > limits.maxBytes) {
    throw new Error(
      `File too large (${Math.round(file.size / 1024 / 1024)} MB). Max: ${Math.round(limits.maxBytes / 1024 / 1024)} MB.`,
    );
  }
  const ext = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "";
  // Accept either correct MIME or correct extension — browser MIME
  // sniffing is inconsistent for .docx/.pptx/.zip across OSes.
  const mimeOk = limits.mimes.has(file.type);
  const extOk = limits.extensions.includes(ext);
  if (!mimeOk && !extOk) {
    throw new Error(
      `File type ${file.type || ext || "?"} not allowed for ${category}.`,
    );
  }

  const path = storagePathFor({
    category,
    trainingId,
    moduleId: moduleId ?? undefined,
    filename: file.name,
  });

  const buf = await file.arrayBuffer();
  const { url } = await uploadToStorage({
    path,
    file: buf,
    contentType: file.type || guessContentType(category, ext),
  });

  return {
    url,
    path,
    name: file.name,
    size: file.size,
    contentType: file.type || guessContentType(category, ext),
  };
}

/**
 * Delete an uploaded file by its bucket-relative path. Used when the
 * admin removes a doc/SCORM/GIF/thumbnail from a module so the storage
 * doesn't leak.
 *
 * Caller must pass trainingId so we can still authorise — paths
 * include the trainingId by construction so we check it matches.
 */
export async function deleteAttachment(
  trainingId: string,
  path: string,
): Promise<void> {
  await requireAdminOwnsTraining(trainingId);
  // Cheap path-injection guard: the path must contain the trainingId.
  // We trust the caller to supply a path our actions previously returned;
  // this prevents a curious admin from deleting a peer-tenant's file
  // by hand-crafting a path.
  if (!path.includes(trainingId)) {
    throw new Error("path does not belong to this training");
  }
  await deleteFromStorage(path);
}

function guessContentType(category: Category, ext: string): string {
  if (category === "thumbnails" || category === "visual-aids") {
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    return "image/jpeg";
  }
  if (category === "documents") {
    if (ext === "pdf") return "application/pdf";
    if (ext === "docx")
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (ext === "pptx")
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    return "application/octet-stream";
  }
  if (category === "scorm") return "application/zip";
  if (category === "videos") {
    if (ext === "mov") return "video/quicktime";
    return "video/mp4";
  }
  if (category === "gifs") return "image/gif";
  return "application/octet-stream";
}
