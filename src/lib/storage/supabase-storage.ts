// Supabase Storage admin client + upload helper.
//
// Used only by trusted server-side code (server actions / route
// handlers). All writes go through the service-role key so RLS on
// the bucket can stay simple (public read, no public write) and the
// tenant/ownership check happens once in the calling action.
//
// All files live in a single bucket — `attachment` — keyed by a
// category path prefix:
//
//   thumbnails/{trainingId}/{fileId}.{ext}
//   documents/{trainingId}/{moduleId}/{fileId}.{ext}
//   scorm/{trainingId}/{moduleId}/{fileId}.zip
//   videos/{trainingId}/{moduleId}/{fileId}.{ext}
//   visual-aids/{trainingId}/{moduleId}/{fileId}.{ext}
//   gifs/{trainingId}/{moduleId}/{fileId}.gif
//
// See prisma/STORAGE_setup.md for one-time Supabase bucket setup.

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let client: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient {
  if (!SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local " +
        "from your Supabase project settings (Settings → API → service_role).",
    );
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export const STORAGE_BUCKET = "attachment";

/**
 * Upload a file to Supabase Storage. Returns the public URL.
 *
 * Caller is responsible for validating the user owns whatever entity
 * the path references (training, module, etc.) — this helper only
 * performs the upload.
 */
export async function uploadToStorage(args: {
  path: string;
  file: ArrayBuffer | Buffer | Uint8Array;
  contentType: string;
  upsert?: boolean;
}): Promise<{ url: string; path: string }> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(args.path, args.file, {
      contentType: args.contentType,
      upsert: args.upsert ?? true,
      cacheControl: "31536000",
    });
  if (error || !data) {
    throw new Error(`storage upload failed: ${error?.message ?? "unknown"}`);
  }
  const { data: pub } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(data.path);
  return { url: pub.publicUrl, path: data.path };
}

/**
 * Delete a single object by its bucket-relative path. Idempotent —
 * missing files don't throw.
 */
export async function deleteFromStorage(path: string): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([path]);
  if (error && !/not found/i.test(error.message)) {
    throw new Error(`storage delete failed: ${error.message}`);
  }
}

/**
 * Build the bucket-relative path for a given category. Each path
 * gets a 12-char random suffix so re-uploads of the same filename
 * don't clobber prior versions until we explicitly upsert.
 */
export function storagePathFor(args: {
  category:
    | "thumbnails"
    | "documents"
    | "scorm"
    | "videos"
    | "visual-aids"
    | "gifs"
    | "recordings"
    | "narrations";
  trainingId: string;
  moduleId?: string;
  sessionId?: string;
  filename: string;
}): string {
  const ext = extensionOf(args.filename);
  const safeName = sanitize(args.filename.replace(/\.[^.]+$/, ""));
  const rand = randomSuffix();
  const base =
    args.category === "thumbnails"
      ? `thumbnails/${args.trainingId}`
      : args.category === "recordings"
        ? `recordings/${args.trainingId}/${args.moduleId ?? "shared"}/${args.sessionId ?? "shared"}`
        : `${args.category}/${args.trainingId}/${args.moduleId ?? "shared"}`;
  return `${base}/${safeName}-${rand}${ext ? "." + ext : ""}`;
}

function extensionOf(filename: string): string {
  const m = filename.match(/\.([a-z0-9]{1,8})$/i);
  return m ? m[1].toLowerCase() : "";
}

function sanitize(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9_\-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "file"
  );
}

function randomSuffix(): string {
  // 12 hex chars (~48 bits) — enough to avoid collisions in this tier.
  const bytes = new Uint8Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
