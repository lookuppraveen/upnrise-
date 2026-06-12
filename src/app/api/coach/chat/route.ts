// POST /api/coach/chat  (streaming text response)
//
// Body: { messages: Array<{ role: "user"|"assistant", content }> }
// Stream: text/plain chunks of the coach's reply.
//
// The system prompt is rebuilt on every request from the learner's current
// stats + history + assignments, plus tenant overrides (Global Bot, Phase 3.5)
// and platform defaults (AI Config, Phase 4.4 / wired Phase 5.0).

import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { anthropic } from "@/lib/ai/client";
import { getAIConfig } from "@/lib/ai/config";
import { loadCoachContext, buildCoachSystemPrompt } from "@/lib/ai/coach";

const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  if (user.role !== "trainee")
    return new Response("trainee only", { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("bad body", { status: 400 });

  const [ctx, ai] = await Promise.all([
    loadCoachContext(user.id, user.companyId),
    getAIConfig(),
  ]);
  const systemPrompt = buildCoachSystemPrompt(
    ctx,
    user.name ?? "the learner",
    {
      defaultCoachPersona: ai.defaultCoachPersona,
      defaultCoachGuardrails: ai.defaultCoachGuardrails,
    },
  );

  const claudeStream = anthropic.messages.stream({
    model: ai.model,
    max_tokens: ai.maxTokensPerTurn,
    system: systemPrompt,
    messages: parsed.data.messages,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of claudeStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
