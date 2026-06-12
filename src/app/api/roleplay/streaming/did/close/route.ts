// POST /api/roleplay/streaming/did/close
// Body: { streamId, sessionId }
//
// Called on player unmount. Best-effort — D-ID GCs idle streams server
// side after a few minutes, but explicit close prevents the tenant
// from being billed for the warm-up window.

import { NextResponse } from "next/server";
import { z } from "zod";
import { submitClose } from "@/lib/video/providers/did-streaming";
import { loadDidProviderOrRespond } from "../_shared";

const Body = z.object({
  streamId: z.string().min(1),
  sessionId: z.string().min(1),
});

export async function POST(req: Request) {
  const guard = await loadDidProviderOrRespond();
  if (!guard.ok) return guard.response;

  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    await submitClose({
      apiKey: guard.provider.apiKey,
      streamId: parsed.data.streamId,
      sessionId: parsed.data.sessionId,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "submitClose failed" },
      { status: 502 },
    );
  }
}
