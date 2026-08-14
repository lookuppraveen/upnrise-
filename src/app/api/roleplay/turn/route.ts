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

// Default model for in-character roleplay turns. Sonnet 4.6 is the
// sweet spot: ~3× faster than Opus with no meaningful quality loss.
// Override globally with ANTHROPIC_MODEL_ROLEPLAY, or per-module by
// enabling `additionalSettings.fastMode` in the admin editor — that
// swaps in Haiku 4.5 for ~2× faster turns at the cost of some nuance.
const ROLEPLAY_MODEL =
  process.env.ANTHROPIC_MODEL_ROLEPLAY ?? "claude-sonnet-4-6";
const ROLEPLAY_MODEL_FAST =
  process.env.ANTHROPIC_MODEL_ROLEPLAY_FAST ??
  "claude-haiku-4-5-20251001";
import {
  appendTurn,
  buildSystemPrompt,
  toClaudeMessages,
  type DifficultyTier,
  type TranscriptTurn,
} from "@/lib/ai/roleplay";
import { parseAdditionalSettings } from "@/lib/roleplay/additional-settings";

const Body = z.object({
  sessionId: z.string().uuid(),
  userMessage: z.string().min(1).max(2000),
});

export async function POST(req: Request) {
  const tHandlerStart = performance.now();
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
  // Adaptive difficulty — recompute the tier so the system prompt
  // matches what /start built (crucial for the Anthropic system-block
  // cache to hit). Rolling avg over the SAME sample won't shift
  // mid-conversation because the current session isn't yet scored.
  let difficultyTier: DifficultyTier | undefined;
  if (
    session.module.training.adaptiveDifficulty &&
    user.role === "trainee"
  ) {
    const { getDifficultyTierForUser } = await import(
      "@/lib/roleplay/adaptive-difficulty"
    );
    difficultyTier = await getDifficultyTierForUser({
      userId: user.id,
      trainingId: session.module.training.id,
    });
  }

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
      difficultyTier,
    },
  );

  // Client-abort AND upstream stall both need to unblock the reader.
  // req.signal fires when the trainee closes the tab or navigates away;
  // the 45s cap catches a wedged Anthropic connection (Sonnet 4.6 rarely
  // exceeds ~15s for a 380-token reply, so 45s is generous headroom).
  const upstreamAbort = new AbortController();
  const upstreamTimer = setTimeout(() => upstreamAbort.abort(), 45_000);
  const onClientAbort = () => upstreamAbort.abort();
  req.signal.addEventListener("abort", onClientAbort);

  // Admin per-module opt-in for the Haiku fast path. The env override
  // ROLEPLAY_MODEL still wins when set globally.
  const modelToUse =
    process.env.ANTHROPIC_MODEL_ROLEPLAY
      ? ROLEPLAY_MODEL
      : settings.fastMode
        ? ROLEPLAY_MODEL_FAST
        : ROLEPLAY_MODEL;

  const claudeStream = anthropic.messages.stream(
    {
      model: modelToUse,
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
    },
    { signal: upstreamAbort.signal },
  );

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
      } finally {
        clearTimeout(upstreamTimer);
        req.signal.removeEventListener("abort", onClientAbort);
      }
    },
    cancel() {
      // Reader was released client-side (fetch aborted, tab closed).
      // Tear down the upstream so we don't keep pulling tokens the
      // trainee will never see.
      upstreamAbort.abort();
    },
  });

  // Server-side setup time = everything up to the point we hand the
  // stream off. Client-side TTFB minus this = pure Anthropic latency +
  // network. Handy signal for whether slow turns are the model or us.
  const setupMs = Math.round(performance.now() - tHandlerStart);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no", // disable proxy buffering
      "X-Handler-Setup-Ms": String(setupMs),
    },
  });
}
