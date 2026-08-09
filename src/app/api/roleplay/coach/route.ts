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
    "Return JSON only:",
    `  { "hint": "...one sentence, max 25 words..." | null, "tone": "tip" | "warn" }`,
    "",
    "Return hint=null when:",
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
    "Return ONLY the JSON object, no prose.",
  ]
    .filter(Boolean)
    .join("\n");

  let raw = "";
  try {
    const ai = await getAIConfig();
    const resp = await anthropic.messages.create(
      {
        model: ai.fastModel,
        max_tokens: 200,
        system,
        messages: [{ role: "user", content: userMsg }],
      },
      // Coach is fire-and-forget from the client; a hung upstream
      // used to leave a promise pinned and delay the next tick.
      { signal: req.signal, timeout: 15_000 },
    );
    raw = resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
  } catch (err) {
    console.error("[coach] LLM error", err);
    return NextResponse.json({ hint: null, tone: "tip" });
  }

  // Strip any code-fence wrapper Claude occasionally adds.
  const jsonText = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsedOut;
  try {
    parsedOut = Out.parse(JSON.parse(jsonText));
  } catch {
    // Bad JSON → behave as "no hint" rather than break the player.
    return NextResponse.json({ hint: null, tone: "tip" });
  }

  return NextResponse.json(parsedOut);
}
