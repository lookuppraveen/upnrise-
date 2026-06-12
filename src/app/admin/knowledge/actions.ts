"use server";

// Knowledge Base ingestion actions.
//
// v1 supports three ingest paths:
//   - text  : admin pastes content directly into a textarea
//   - url   : we server-fetch, strip HTML, store the extracted plaintext
//   - file  : .txt / .md uploaded via FormData
//
// PDF ingestion is deferred. Everything is tenant-scoped (companyId);
// trainingId is left null when the source is added to the company-wide
// library. The AI generator pulls top-k sources by id and concatenates
// `content` as system context — no embeddings yet.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

const MAX_CONTENT_CHARS = 200_000;

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    throw new Error("forbidden");
  }
  return user;
}

const TextSchema = z.object({
  name: z.string().min(1).max(200),
  content: z.string().min(10).max(MAX_CONTENT_CHARS),
});

export async function createTextKbSource(
  data: z.infer<typeof TextSchema>,
): Promise<{ id: string }> {
  const user = await requireAdmin();
  const parsed = TextSchema.parse(data);
  const row = await prisma.kbSource.create({
    data: {
      companyId: user.companyId!,
      kind: "text",
      name: parsed.name,
      content: parsed.content,
      size: parsed.content.length,
      status: "ready",
    },
    select: { id: true },
  });
  revalidatePath("/admin/knowledge");
  return { id: row.id };
}

const UrlSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url().max(2000),
});

export async function createUrlKbSource(
  data: z.infer<typeof UrlSchema>,
): Promise<{ id: string }> {
  const user = await requireAdmin();
  const parsed = UrlSchema.parse(data);

  const text = await fetchUrlAsText(parsed.url);
  const row = await prisma.kbSource.create({
    data: {
      companyId: user.companyId!,
      kind: "url",
      name: parsed.name,
      sourceUrl: parsed.url,
      content: text,
      size: text.length,
      status: text.length > 0 ? "ready" : "failed",
    },
    select: { id: true },
  });
  revalidatePath("/admin/knowledge");
  return { id: row.id };
}

export async function createFileKbSource(
  formData: FormData,
): Promise<{ id: string }> {
  const user = await requireAdmin();
  const file = formData.get("file");
  const name = String(formData.get("name") ?? "").trim();
  // Optional — set by the wizard-side variant to attach the new source
  // to the training that's being authored. /admin/knowledge omits it
  // and the source lands in the library pool.
  const trainingId = String(formData.get("trainingId") ?? "").trim();
  if (!(file instanceof File)) throw new Error("missing file");
  if (!name) throw new Error("missing name");
  if (file.size > 20_000_000) {
    throw new Error("file too large (max 20 MB)");
  }

  const { text, kind } = await extractFileText(file);
  const trimmed = text.slice(0, MAX_CONTENT_CHARS);

  const row = await prisma.kbSource.create({
    data: {
      companyId: user.companyId!,
      kind,
      name,
      content: trimmed,
      size: trimmed.length,
      status: trimmed.length > 0 ? "ready" : "failed",
      ...(trainingId ? { trainingId } : {}),
    },
    select: { id: true },
  });
  revalidatePath("/admin/knowledge");
  if (trainingId) {
    revalidatePath(`/admin/trainings/${trainingId}/edit`);
  }
  return { id: row.id };
}

/**
 * Dispatch by file extension. Falls back to UTF-8 text decoding for
 * unknown types so a paste-as-file workflow still works. Throws when
 * the parser fails entirely so the UI can surface a real error.
 */
async function extractFileText(
  file: File,
): Promise<{ text: string; kind: "pdf" | "doc" | "text" }> {
  const lower = file.name.toLowerCase();
  const buf = await file.arrayBuffer();

  if (lower.endsWith(".pdf")) {
    const text = await parsePdf(buf);
    return { text, kind: "pdf" };
  }
  if (lower.endsWith(".docx")) {
    const text = await parseDocx(buf);
    return { text, kind: "doc" };
  }
  if (lower.endsWith(".doc")) {
    // .doc (legacy binary) needs OLE2 parsers we don't ship. Ask admins
    // to save as .docx or paste the text directly.
    throw new Error(
      "legacy .doc files aren't supported — save as .docx and try again",
    );
  }
  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    return {
      text: new TextDecoder("utf-8").decode(buf),
      kind: "text",
    };
  }
  throw new Error(
    "unsupported file type — pick a .pdf, .docx, .txt, or .md file",
  );
}

async function parsePdf(buf: ArrayBuffer): Promise<string> {
  // Use unpdf — purpose-built for serverless, no native bindings.
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : text;
}

async function parseDocx(buf: ArrayBuffer): Promise<string> {
  // mammoth is the standard DOCX → plain text/HTML parser. We take the
  // raw text path; the HTML path is heavier and we don't need the markup.
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({
    buffer: Buffer.from(buf),
  });
  return result.value;
}

export async function deleteKbSource(id: string) {
  const user = await requireAdmin();
  await prisma.kbSource.deleteMany({
    where: { id, companyId: user.companyId! },
  });
  revalidatePath("/admin/knowledge");
}

// ─────────────── URL → text helper ───────────────

/**
 * Fetch a URL and reduce its HTML to a rough plaintext extraction. We
 * strip <script>, <style>, and tags, collapse whitespace, and cap at
 * MAX_CONTENT_CHARS. Good enough to ground an LLM prompt; not a
 * production scraper.
 */
async function fetchUrlAsText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "UPnRise-KB-Ingester/1.0 (+admin-paste)",
        Accept: "text/html, text/plain, */*",
      },
      // Cap fetch time so a slow site doesn't hang the action.
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    if (ct.includes("text/plain")) {
      return raw.slice(0, MAX_CONTENT_CHARS);
    }
    return htmlToText(raw).slice(0, MAX_CONTENT_CHARS);
  } catch {
    return "";
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?(p|div|br|li|h[1-6]|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
