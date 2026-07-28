// Server-side helper for the ElevenLabs voice library.
//
// The admin voice picker doesn't ship all ~3000 shared voices as a
// static catalog — it queries this endpoint on demand so admins can
// search, filter by language / accent / gender, and pick anything
// their subscription unlocks (Starter+ can use library voices via API).
//
// Endpoint:
//   GET https://api.elevenlabs.io/v1/shared-voices
//     ?page_size=…&category=…&gender=…&language=…&accent=…&search=…
//
// Response is heavy (each voice has ~15 fields + preview_url). We map
// down to the small shape the client actually renders so we're not
// shipping stray metadata to every browser.

const ELEVENLABS_BASE = "https://api.elevenlabs.io";

/** Narrowed shape returned to the admin UI. */
export type LibraryVoice = {
  id: string;
  name: string;
  gender: "male" | "female" | "neutral";
  accent: string | null;
  language: string | null;
  category: string | null;
  description: string | null;
  /** ElevenLabs's own preview mp3 URL. We don't strictly need it —
   *  the admin uses /api/roleplay/tts to generate a fresh sample —
   *  but pass it through in case a future UI wants instant playback. */
  previewUrl: string | null;
};

export type SharedVoicesQuery = {
  search?: string;
  gender?: "male" | "female" | "neutral";
  language?: string; // ISO 639-1 e.g. "en", "hi"
  accent?: string; // e.g. "indian", "british"
  category?: string; // "premade", "professional", etc.
  pageSize?: number;
  page?: number;
};

/**
 * Query the ElevenLabs shared-voices library.
 * Throws on non-2xx so the caller can surface a specific error.
 */
export async function searchSharedVoices(
  apiKey: string,
  q: SharedVoicesQuery,
  signal?: AbortSignal,
): Promise<{ voices: LibraryVoice[]; hasMore: boolean }> {
  const params = new URLSearchParams();
  params.set("page_size", String(Math.min(q.pageSize ?? 30, 100)));
  if (q.page && q.page > 0) params.set("page", String(q.page));
  if (q.search) params.set("search", q.search);
  if (q.gender) params.set("gender", q.gender);
  if (q.language) params.set("language", q.language);
  if (q.accent) params.set("accent", q.accent);
  if (q.category) params.set("category", q.category);

  const res = await fetch(
    `${ELEVENLABS_BASE}/v1/shared-voices?${params.toString()}`,
    {
      method: "GET",
      headers: {
        "xi-api-key": apiKey,
        Accept: "application/json",
      },
      signal: signal ?? AbortSignal.timeout(15_000),
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new SharedVoicesError(res.status, body.slice(0, 400));
  }

  const data = (await res.json()) as {
    voices?: RawSharedVoice[];
    has_more?: boolean;
  };
  const voices = (data.voices ?? []).map(mapVoice);
  return { voices, hasMore: !!data.has_more };
}

export class SharedVoicesError extends Error {
  status: number;
  upstreamBody: string;
  constructor(status: number, upstreamBody: string) {
    super(`elevenlabs_shared_voices_${status}`);
    this.status = status;
    this.upstreamBody = upstreamBody;
  }
}

// The upstream JSON has many more fields; we grab only what the UI
// renders. Voice objects vary by category (public library vs cloned
// vs professional) so most fields are defensive.
type RawSharedVoice = {
  voice_id?: string;
  name?: string;
  gender?: string;
  accent?: string;
  language?: string;
  category?: string;
  description?: string;
  preview_url?: string;
  labels?: Record<string, string>;
};

function mapVoice(r: RawSharedVoice): LibraryVoice {
  const rawGender = (r.gender ?? r.labels?.gender ?? "").toLowerCase();
  const gender: LibraryVoice["gender"] =
    rawGender === "male" || rawGender === "female" ? rawGender : "neutral";
  return {
    id: r.voice_id ?? "",
    name: r.name ?? "Unnamed voice",
    gender,
    accent: (r.accent ?? r.labels?.accent ?? null) || null,
    language: (r.language ?? r.labels?.language ?? null) || null,
    category: r.category ?? r.labels?.category ?? null,
    description: r.description ?? r.labels?.description ?? null,
    previewUrl: r.preview_url ?? null,
  };
}
