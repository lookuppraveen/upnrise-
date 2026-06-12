// POST /api/roleplay/streaming/did/sdp
// Body: { streamId, sessionId, answer: RTCSessionDescriptionInit }
//
// Browser → us → D-ID. Submitted once per session, right after the
// browser sets the remote offer and computes its local answer.

import { NextResponse } from "next/server";
import { z } from "zod";
import { submitAnswer } from "@/lib/video/providers/did-streaming";
import { loadDidProviderOrRespond } from "../_shared";

const Body = z.object({
  streamId: z.string().min(1),
  sessionId: z.string().min(1),
  answer: z.object({
    type: z.literal("answer"),
    sdp: z.string().min(1),
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
    await submitAnswer({
      apiKey: guard.provider.apiKey,
      streamId: parsed.data.streamId,
      sessionId: parsed.data.sessionId,
      answer: parsed.data.answer,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "submitAnswer failed" },
      { status: 502 },
    );
  }
}
