// POST /api/roleplay/streaming/did/speak
// Body: { streamId, sessionId, text, voiceId? }
//
// Push a chunk of text for the avatar to speak. Many per session — once
// per AI turn. voiceId override is optional; the route falls back to
// the provider's default voice when not supplied.

import { NextResponse } from "next/server";
import { z } from "zod";
import { submitSpeak } from "@/lib/video/providers/did-streaming";
import { loadDidProviderOrRespond } from "../_shared";

const Body = z.object({
  streamId: z.string().min(1),
  sessionId: z.string().min(1),
  text: z.string().trim().min(1).max(1000),
  voiceId: z.string().trim().min(1).optional(),
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
    await submitSpeak({
      apiKey: guard.provider.apiKey,
      streamId: parsed.data.streamId,
      sessionId: parsed.data.sessionId,
      text: parsed.data.text,
      voiceId: parsed.data.voiceId ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "submitSpeak failed" },
      { status: 502 },
    );
  }
}
