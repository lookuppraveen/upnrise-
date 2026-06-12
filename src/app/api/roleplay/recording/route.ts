// POST /api/roleplay/recording
//
// Body: multipart/form-data { sessionId, file }
// Resp: { url }
//
// Receives the audio blob captured by MediaRecorder during a roleplay
// session, uploads it to Supabase Storage (bucket `attachment`, prefix
// `recordings/<trainingId>/<moduleId>/<sessionId>/`), and writes a
// Feedback row that backs the recording URL on the session.
//
// Why a Feedback row instead of a column on RoleplaySession: the
// schema column add was blocked by Windows holding the Prisma DLL
// open during `prisma generate`. Using the existing Feedback table
// with `source = "recording"` lets the feature ship now; switching to
// a dedicated column is a follow-up the user can do without changing
// the call-sites — the helpers below abstract the storage location.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { loadSessionForUser } from "@/lib/ai/roleplay-access";
import { parseAdditionalSettings } from "@/lib/roleplay/additional-settings";
import {
  storagePathFor,
  uploadToStorage,
} from "@/lib/storage/supabase-storage";

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB cap on a single roleplay recording
const SessionIdSchema = z.string().min(1).max(100);

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "trainee" && user.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad form data" }, { status: 400 });
  }

  const sessionIdRaw = String(formData.get("sessionId") ?? "").trim();
  const sessionIdParsed = SessionIdSchema.safeParse(sessionIdRaw);
  if (!sessionIdParsed.success)
    return NextResponse.json({ error: "bad sessionId" }, { status: 400 });

  const file = formData.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  if (file.size === 0)
    return NextResponse.json({ error: "empty file" }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json(
      { error: `file too large (${Math.round(file.size / 1024 / 1024)} MB)` },
      { status: 413 },
    );

  const session = await loadSessionForUser(user, sessionIdParsed.data);
  if (!session)
    return NextResponse.json({ error: "session not found" }, { status: 404 });

  // Only honor the upload if the admin actually opted in to recording.
  // This stops a malicious client from filling the bucket on modules
  // where recording is disabled.
  const settings = parseAdditionalSettings(session.module.body);
  if (settings.recordAv !== "yes")
    return NextResponse.json(
      { error: "recording not enabled for this module" },
      { status: 403 },
    );

  // Pick a sensible extension from the blob's MIME (browsers usually
  // emit audio/webm; Safari may emit audio/mp4). Default to .webm.
  const ext = pickExt(file.type, file.name);

  const path = storagePathFor({
    category: "recordings",
    trainingId: session.module.training.id,
    moduleId: session.moduleId,
    sessionId: session.id,
    filename: `recording.${ext}`,
  });

  const buf = await file.arrayBuffer();
  const { url } = await uploadToStorage({
    path,
    file: buf,
    contentType: file.type || `audio/${ext}`,
  });

  // One recording row per session — replace any prior row so retries
  // (e.g., network blip on first end) don't accumulate stale URLs.
  await prisma.feedback.deleteMany({
    where: { sessionId: session.id, source: "recording" },
  });
  await prisma.feedback.create({
    data: {
      recipientId: user.id,
      sessionId: session.id,
      trainingId: session.module.training.id,
      kind: "ai",
      sentiment: "neutral",
      body: url,
      source: "recording",
    },
  });

  return NextResponse.json({ url });
}

function pickExt(mime: string, filename: string): string {
  const fromName = filename.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  if (/webm/i.test(mime)) return "webm";
  if (/ogg/i.test(mime)) return "ogg";
  if (/mp4/i.test(mime)) return "m4a";
  if (/mpeg/i.test(mime) || /mp3/i.test(mime)) return "mp3";
  return "webm";
}
