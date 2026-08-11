// POST /api/roleplay/coach  (non-streaming)
//
// Body: { sessionId }
// Resp: { hint: string | null, tone: "tip" | "warn" }
//
// Mid-conversation live coaching. Reads the recent transcript + rubric and
// asks the fast model whether the learner's most recent turn deserves a
// short, in-the-moment nudge. Returns null when nothing useful to say —
// so the UI only surfaces a card when there's real signal.
//
// Cheap by design: max 200 tokens, fast model, called at most once every
// 2 learner turns by the client.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { anthropic } from "@/lib/ai/client";
import { getAIConfig } from "@/lib/ai/config";
import { loadSessionForUser } from "@/lib/ai/roleplay-access";
import { parseRubric } from "@/lib/ai/scoring";
import type { TranscriptTurn } from "@/lib/ai/roleplay";

const Body = z.object({ sessionId: z.string().uuid() });

const Out = z.object({
  // null means "no hint this turn — stay quiet"
  hint: z.string().min(1).max(200).nullable(),
  tone: z.enum(["tip", "warn"]),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "trainee" && user.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad body" }, { status: 400 });

  const session = await loadSessionForUser(user, parsed.data.sessionId);
  if (!session || !session.module.roleplayConfig)
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  if (session.endedAt)
    return NextResponse.json(
      { hint: null, tone: "tip" satisfies "tip" },
      { status: 200 },
    );

  const transcript = session.transcript as unknown as TranscriptTurn[];
  if (transcript.length < 2) {
    return NextResponse.json({ hint: null, tone: "tip" });
  }

  const cfg = session.module.roleplayConfig;
  const rubric = parseRubric(cfg.rubric);
  const criteria = rubric?.criteria
    .map((c) => `- ${c.label}: ${c.description}`)
    .join("\n");

  // Last 6 turns is enough context for in-the-moment coaching.
  const recent = transcript.slice(-6);
  const transcriptBlock = recent
    .map(
      (t) =>
        `${t.role === "learner" ? "LEARNER" : "CUSTOMER"}: ${t.content}`,
    )
    .join("\n");

  const system = [
    "You are a silent coach watching a live sales roleplay.",
    "Your job is to give the learner ONE short in-the-moment nudge — but only when it would meaningfully change their next reply.",
    "",
    "You MUST respond by calling the `emit_coaching` tool exactly once. Do not write any other output.",
    "",
    "Set hint=null (and tone still required, use 'tip' as default) when:",
    "- The learner just did well; nothing to add.",
    "- The conversation is going fine and a comment would be noise.",
    "- The customer just spoke and the learner hasn't responded yet.",
    "",
    "Use tone='warn' when the learner just made a clear error (interrupting, missing an objection, oversharing pricing).",
    "Use tone='tip' for gentle improvements (deeper discovery, mirror their concern, ask for the meeting).",
    "Never coach in vague generalities. Tie the hint to what just happened.",
  ].join("\n");

  const userMsg = [
    criteria ? `## Rubric we're scoring on\n${criteria}\n` : "",
    `## Recent transcript\n${transcriptBlock}`,
    "",
    "Call emit_coaching with your judgment for the learner's most recent turn.",
  ]
    .filter(Boolean)
    .join("\n");

  // Tool-use guarantees structured output. Previous version asked the
  // model to return raw JSON in a text block; ~5% of the time it added
  // prose framing or hit the 200-token cap mid-JSON, and the parse
  // fell back to "no hint" — silently swallowing what may have been
  // a useful nudge. With tool_choice forced, Anthropic returns a
  // tool_use content block whose `input` is already-parsed JSON that
  // conforms to the input_schema. No manual JSON.parse, no code-fence
  // stripping, no truncation risk.
  const emitCoachingTool = {
    name: "emit_coaching" as const,
    description:
      "Emit a single in-the-moment coaching signal for the learner's most recent turn. Pass hint=null when no nudge is warranted.",
    input_schema: {
      type: "object" as const,
      properties: {
        hint: {
          type: ["string", "null"] as const,
          description:
            "One-sentence nudge tied to what just happened in the transcript. Max 25 words, max 200 chars. null when no nudge is warranted.",
          maxLength: 200,
        },
        tone: {
          type: "string" as const,
          enum: ["tip", "warn"] as const,
          description:
            "'warn' for clear errors (interrupting, missing an objection, oversharing pricing); 'tip' for gentle improvements. Required even when hint is null (use 'tip').",
        },
      },
      required: ["hint", "tone"],
    },
  };

  let toolInput: unknown;
  try {
    const ai = await getAIConfig();
    const resp = await anthropic.messages.create(
      {
        model: ai.fastModel,
        // 300 tokens leaves comfortable headroom for the tool_use
        // wrapper + the small JSON payload; the 200-char schema cap
        // keeps the hint itself short regardless.
        max_tokens: 300,
        system,
        messages: [{ role: "user", content: userMsg }],
        tools: [emitCoachingTool],
        tool_choice: { type: "tool", name: emitCoachingTool.name },
      },
      { signal: req.signal, timeout: 15_000 },
    );
    const toolUse = resp.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      // Shouldn't happen with tool_choice forced, but degrade gracefully.
      console.warn("[coach] no tool_use in response");
      return NextResponse.json({ hint: null, tone: "tip" });
    }
    toolInput = toolUse.input;
  } catch (err) {
    console.error("[coach] LLM error", err);
    return NextResponse.json({ hint: null, tone: "tip" });
  }

  const parsedOut = Out.safeParse(toolInput);
  if (!parsedOut.success) {
    // Model violated the schema despite tool_use — treat as no-op.
    console.warn(
      "[coach] tool input failed schema",
      parsedOut.error.flatten(),
    );
    return NextResponse.json({ hint: null, tone: "tip" });
  }

  return NextResponse.json(parsedOut.data);
}
