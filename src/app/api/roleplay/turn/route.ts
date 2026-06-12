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
import { getAIConfig } from "@/lib/ai/config";
import { loadSessionForUser } from "@/lib/ai/roleplay-access";
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

  const ai = await getAIConfig();
  const claudeStream = anthropic.messages.stream({
    model: ai.model,
    max_tokens: 600,
    system: systemPrompt,
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
