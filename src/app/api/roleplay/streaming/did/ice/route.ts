// POST /api/roleplay/streaming/did/ice
// Body: { streamId, sessionId, candidate: RTCIceCandidateInit }
//
// Trickled per ICE candidate the browser collects. Many per session.
// Fire-and-forget from the browser's perspective — we still report
// errors so the client can surface persistent failures.

import { NextResponse } from "next/server";
import { z } from "zod";
import { submitIceCandidate } from "@/lib/video/providers/did-streaming";
import { loadDidProviderOrRespond } from "../_shared";

const Body = z.object({
  streamId: z.string().min(1),
  sessionId: z.string().min(1),
  candidate: z.object({
    candidate: z.string(),
    sdpMid: z.string().nullable().optional(),
    sdpMLineIndex: z.number().int().nullable().optional(),
    usernameFragment: z.string().nullable().optional(),
  }),
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
    await submitIceCandidate({
      apiKey: guard.provider.apiKey,
      streamId: parsed.data.streamId,
      sessionId: parsed.data.sessionId,
      candidate: parsed.data.candidate,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "submitIce failed" },
      { status: 502 },
    );
  }
}
