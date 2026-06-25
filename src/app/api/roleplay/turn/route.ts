// POST /api/roleplay/turn  (streaming text response)
//
// Body: { sessionId, userMessage }
// Stream: plain text/plain delta chunks of the persona's reply.
//
// On stream completion, persists both the learner turn and the assistant
// reply to roleplay_sessions.transcript. The client appends the streamed
// chunks to its local transcript as they arrive.

import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { anthropic } from "@/lib/ai/client";
import { loadSessionForUser } from "@/lib/ai/roleplay-access";

// Sonnet 4.6 is the sweet spot for in-character roleplay turns: ~3× faster than
// Opus with no meaningful quality loss for conversational scenes. Override with
// ANTHROPIC_MODEL_ROLEPLAY (e.g. "claude-haiku-4-5-20251001" for max speed).
const ROLEPLAY_MODEL =
  process.env.ANTHROPIC_MODEL_ROLEPLAY ?? "claude-sonnet-4-6";
import {
  appendTurn,
  buildSystemPrompt,
  toClaudeMessages,
  type TranscriptTurn,
} from "@/lib/ai/roleplay";
import { parseAdditionalSettings } from "@/lib/roleplay/additional-settings";

const Body = z.object({
  sessionId: z.string().uuid(),
  userMessage: z.string().min(1).max(2000),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  if (user.role !== "trainee" && user.role !== "admin")
    return new Response("forbidden", { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("bad body", { status: 400 });

  const session = await loadSessionForUser(user, parsed.data.sessionId);
  if (!session || !session.module.roleplayConfig)
    return new Response("session not found", { status: 404 });
  if (session.endedAt)
    return new Response("session ended", { status: 409 });

  // Append learner turn locally; we persist both after stream completes.
  const existing = session.transcript as unknown as TranscriptTurn[];
  const withLearner = appendTurn(existing, "learner", parsed.data.userMessage);

  const cfg = session.module.roleplayConfig;
  const settings = parseAdditionalSettings(session.module.body);
  const idealConversation =
    session.module.body &&
    typeof session.module.body === "object" &&
    !Array.isArray(session.module.body) &&
    typeof (session.module.body as Record<string, unknown>).idealConversation ===
      "string"
      ? ((session.module.body as Record<string, unknown>)
          .idealConversation as string)
      : null;
  const systemPrompt = buildSystemPrompt(
    {
      persona: cfg.persona,
      scenario: cfg.scenario,
      systemPrompt: cfg.systemPrompt,
      rubric: cfg.rubric,
    },
    {
      idealConversation,
      followIdealConversation: settings.followIdealConversation,
      endRoleplayBy: settings.endRoleplayBy,
    },
  );

  const claudeStream = anthropic.messages.stream({
    model: ROLEPLAY_MODEL,
    // 380 = comfortable headroom for the "1-4 sentences" rule without
    // letting the model ramble. Lower values risk truncating a reply
    // mid-sentence which is jarring during voice playback.
    max_tokens: 380,
    // Cache the system block so turns 2+ in the same session skip
    // re-processing persona + scenario + ideal conversation. 5-min
    // ephemeral cache is a natural fit for a single roleplay session.
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: toClaudeMessages(withLearner),
  });

  const encoder = new TextEncoder();
  const sessionId = session.id;
  let assistantText = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of claudeStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            assistantText += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        // Persist both new turns atomically.
        const fullTranscript = appendTurn(
          withLearner,
          "persona",
          assistantText.trim(),
        );
        await prisma.roleplaySession.update({
          where: { id: sessionId },
          data: { transcript: fullTranscript },
        });
        controller.close();
      } catch (err) {
        // Best-effort persist of what we got so far.
        try {
          if (assistantText.trim()) {
            const partial = appendTurn(
              withLearner,
              "persona",
              assistantText.trim(),
            );
            await prisma.roleplaySession.update({
              where: { id: sessionId },
              data: { transcript: partial },
            });
          }
        } catch {
          // ignore secondary failure
        }
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no", // disable proxy buffering
    },
  });
}
