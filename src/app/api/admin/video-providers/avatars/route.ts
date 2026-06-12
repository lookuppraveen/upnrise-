// GET /api/admin/video-providers/avatars
//
// Proxies LiveAvatar's `/v1/avatars/public` endpoint so the admin
// Video Providers page can show a clickable picker instead of asking
// admins to paste a UUID they pulled from another tab. The upstream
// endpoint is unauthenticated, but we still gate this route behind an
// admin session — no reason to let trainees probe the proxy.
//
// Response shape (simplified for the UI):
//   { avatars: [{ id, name, previewUrl, voiceId, voiceName, status }] }

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";

const STREAMING_BASE =
  process.env.LIVEAVATAR_BASE ?? "https://api.liveavatar.com";

type RawAvatar = {
  id?: string;
  name?: string;
  preview_url?: string;
  status?: string;
  default_voice?: { id?: string; name?: string } | null;
};

type RawResponse = {
  data?: {
    results?: RawAvatar[];
    next?: string | null;
  };
};

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin" && user.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const page = url.searchParams.get("page") ?? "1";
  const pageSize = url.searchParams.get("page_size") ?? "60";

  try {
    const upstream = new URL(`${STREAMING_BASE}/v1/avatars/public`);
    upstream.searchParams.set("page", page);
    upstream.searchParams.set("page_size", pageSize);

    const res = await fetch(upstream.toString(), {
      method: "GET",
      // The upstream is unauthenticated. Same response for everyone,
      // so we let Next cache it for a few minutes to absorb repeat
      // opens of the picker.
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        {
          error: `upstream ${res.status}: ${text.slice(0, 200)}`,
        },
        { status: 502 },
      );
    }
    const data = (await res.json()) as RawResponse;
    const raw = data.data?.results ?? [];
    const avatars = raw
      .filter((a): a is RawAvatar & { id: string; name: string } =>
        typeof a.id === "string" && typeof a.name === "string",
      )
      // Hide avatars that aren't in a usable state — INIT/FAILED would
      // mint a token but error on createStartAvatar.
      .filter((a) => (a.status ?? "ACTIVE") === "ACTIVE")
      .map((a) => ({
        id: a.id,
        name: a.name,
        previewUrl: a.preview_url ?? null,
        voiceId: a.default_voice?.id ?? null,
        voiceName: a.default_voice?.name ?? null,
        status: a.status ?? "ACTIVE",
      }));

    return NextResponse.json({
      avatars,
      hasMore: Boolean(data.data?.next),
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Failed to fetch avatars",
      },
      { status: 502 },
    );
  }
}
