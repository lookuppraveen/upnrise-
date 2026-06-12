// Shared guards for the D-ID Talks Streams relay routes. The browser
// holds a streamId + sessionId from /api/roleplay/streaming/session and
// posts each lifecycle step (sdp answer, trickled ICE, speak text,
// close) here. We resolve the tenant's default D-ID provider, verify it
// matches, then forward to D-ID with the server-held API key.
//
// Why per-step routes instead of one omnibus relay: each step has a
// distinct lifecycle (sdp once, ice many, speak many, close once) and
// keeping them separate keeps the request log readable when something
// goes wrong mid-session.

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

export type LoadedDidProvider = {
  apiKey: string;
};

export async function loadDidProviderOrRespond(): Promise<
  | { ok: true; provider: LoadedDidProvider }
  | { ok: false; response: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  if (user.role !== "trainee" && user.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  if (!user.companyId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "no tenant" }, { status: 400 }),
    };
  }
  const row = await prisma.videoProvider.findFirst({
    where: { companyId: user.companyId, isDefault: true, kind: "did" },
    select: { apiKey: true },
  });
  if (!row) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "no default D-ID provider — the session may have been minted under a different provider, or the default was changed mid-session. Restart the roleplay.",
        },
        { status: 412 },
      ),
    };
  }
  return { ok: true, provider: { apiKey: row.apiKey } };
}
