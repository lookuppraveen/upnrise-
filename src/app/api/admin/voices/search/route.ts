// GET /api/admin/voices/search
//
// Query params:
//   q           — free-text search
//   gender      — "male" | "female" | "neutral"
//   language    — ISO 639-1 (e.g. "en", "hi")
//   accent      — e.g. "indian", "british"
//   category    — "premade" | "professional" | "cloned" (upstream terms)
//   pageSize    — max 100, default 30
//   page        — 1-indexed
//
// Resp: { voices: LibraryVoice[], hasMore: boolean }
//
// Auth: admins + super_admins only. Trainees don't touch this endpoint;
// their player uses the tenant-configured voice via /api/roleplay/tts.

import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import {
  searchSharedVoices,
  SharedVoicesError,
  type SharedVoicesQuery,
} from "@/lib/voice/elevenlabs-voices";

const Query = z.object({
  q: z.string().trim().max(120).optional(),
  gender: z.enum(["male", "female", "neutral"]).optional(),
  language: z.string().trim().max(8).optional(),
  accent: z.string().trim().max(40).optional(),
  category: z.string().trim().max(40).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).max(500).optional(),
});

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user)
    return json(401, { error: "unauthorized" });
  if (user.role !== "admin" && user.role !== "super_admin")
    return json(403, { error: "forbidden" });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return json(503, { error: "provider_disabled" });

  const url = new URL(req.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return json(400, { error: "bad_query" });

  const q: SharedVoicesQuery = {
    search: parsed.data.q,
    gender: parsed.data.gender,
    language: parsed.data.language,
    accent: parsed.data.accent,
    category: parsed.data.category,
    pageSize: parsed.data.pageSize,
    page: parsed.data.page,
  };

  try {
    const result = await searchSharedVoices(apiKey, q, req.signal);
    return json(200, result);
  } catch (err) {
    if (err instanceof SharedVoicesError) {
      console.error(
        `[admin/voices/search] upstream ${err.status}: ${err.upstreamBody}`,
      );
      return json(502, { error: "upstream_error", status: err.status });
    }
    console.error(
      "[admin/voices/search] search threw",
      err instanceof Error ? err.message : err,
    );
    return json(502, { error: "upstream_error" });
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
