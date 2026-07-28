// POST /api/roleplay/hint  (non-streaming)
//
// Body: { sessionId, type: "complete" | "bullet" }
// Resp: { hint: string }
//
// Trainee-requested hint — fires when the learner clicks the "Hint"
// button in the player. Unlike /api/roleplay/coach (which gives
// coaching commentary), this route returns the LITERAL words the
// learner should say next, so they can read them aloud. Style depends
// on the admin's "Select Your Hint Type" setting:
//   - complete → one ready-to-speak reply (2-4 sentences, first person)
//   - bullet   → 2-4 short verbatim lines, one per bullet — the
//                learner can deliver them in sequence or pick one

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { anthropic } from "@/lib/ai/client";
import { getAIConfig } from "@/lib/ai/config";
import { loadSessionForUser } from "@/lib/ai/roleplay-access";
import { parseRubric } from "@/lib/ai/scoring";
import { prisma } from "@/lib/db/client";
import type { TranscriptTurn } from "@/lib/ai/roleplay";

const Body = z.object({
  sessionId: z.string().min(1).max(100),
  type: z.enum(["complete", "bullet"]).default("complete"),
  // auto=true → background refresh after each persona turn. We skip
  // the Feedback persist and the client skips the hintsUsed bump so
  // these auto-suggestions don't burn the trainee's hint allowance.
  auto: z.boolean().default(false),
});

const Out = z.object({
  // Cap at 350 chars — trainees hit the Hint button mid-conversation and
  // need a line they can deliver in one breath. Longer responses turn
  // the "teleprompter" into an essay. Below-min catches accidental empty
  // model responses; above-max hard-rejects verbose drift.
  hint: z.string().min(5).max(350),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "trainee" && user.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "bad body", issues: parsed.error.flatten() },
      { status: 400 },
    );

  const session = await loadSessionForUser(user, parsed.data.sessionId);
  if (!session || !session.module.roleplayConfig)
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  if (session.endedAt)
    return NextResponse.json({ error: "session ended" }, { status: 409 });

  const transcript = session.transcript as unknown as TranscriptTurn[];
  const cfg = session.module.roleplayConfig;
  const rubric = parseRubric(cfg.rubric);
  const criteria = rubric?.criteria
    .map((c) => `- ${c.label}: ${c.description}`)
    .join("\n");

  const recent = transcript.slice(-8);
  const transcriptBlock = recent.length
    ? recent
        .map(
          (t) =>
            `${t.role === "learner" ? "LEARNER" : "CUSTOMER"}: ${t.content}`,
        )
        .join("\n")
    : "(no turns yet — learner is about to open the conversation)";

  const formatRule =
    parsed.data.type === "bullet"
      ? "Format: 2-3 SHORT verbatim lines, one per bullet. Each line starts with '• '. Each line is 8-14 words — a single crisp sentence the learner delivers in one breath. First person only. No markdown asterisks, no preamble, no closing summary."
      : "Format: ONE line, 1-2 short sentences, 25 words max. Written in first person as the exact words the learner says. Plain text only, no headings, no bullets, no quotation marks around the whole reply, no coaching commentary. Short and punchy beats long and thorough — the learner has to say this aloud in the next second.";

  const system = [
    "You are a teleprompter for a sales learner mid-roleplay. They hit the Hint button and need the EXACT words to say back to the customer RIGHT NOW.",
    "",
    "Return ONLY the line the learner should speak next. First person. Short.",
    "",
    "Rules:",
    "- SHORT beats thorough. The learner has to say this in the next second — one crisp line is worth ten well-organized paragraphs.",
    "- Output is the SCRIPT, not coaching. No 'You should…', no 'Try to…', no 'Acknowledge their concern' — write the actual sentence.",
    "- Tie the response to the customer's most recent line. Address the specific question, objection, or moment directly.",
    "- Conversational, natural register. No marketing fluff, no jargon dumps, no over-qualifying.",
    "- Stay in character as a sales rep in this specific scenario.",
    "- Never include stage directions, brackets, or notes (no '[pause]', '[smile]', '(then ask…)').",
    "- Never name the speaker or prefix with 'Salesperson:' / 'Me:' — just the words.",
    "- If the transcript shows no turns yet (learner opens), produce a strong opening line that fits the scenario — same short-and-punchy rule applies.",
    "",
    formatRule,
  ].join("\n");

  const userMsg = [
    `## Scenario\n${cfg.scenario}`,
    `## Customer persona\n${cfg.persona}`,
    criteria ? `## What the learner is being scored on\n${criteria}` : "",
    `## Recent transcript\n${transcriptBlock}`,
    "",
    "Write the EXACT words the learner should say as their next line. Output only the script — nothing else.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const ai = await getAIConfig();
    const resp = await anthropic.messages.create({
      model: ai.fastModel,
      // Hard cap on generation length — 200 tokens ≈ 150 words at most.
      // Combined with the "25 words max" prompt rule and the 350-char
      // schema cap, this triangulates on short, deliverable hints.
      max_tokens: 200,
      system,
      messages: [{ role: "user", content: userMsg }],
    });
    const text = resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    const validated = Out.safeParse({ hint: text });
    if (!validated.success) {
      return NextResponse.json(
        { error: "malformed hint", issues: validated.error.flatten() },
        { status: 502 },
      );
    }
    // Manual hint requests count against the trainee's allowance and
    // surface on the results page. Auto-suggested replies (rendered
    // passively after every persona turn) do neither — they're just
    // teleprompter UX, not coaching the trainee asked for.
    if (!parsed.data.auto) {
      await prisma.feedback.create({
        data: {
          recipientId: user.id,
          sessionId: session.id,
          trainingId: session.module.training.id,
          kind: "ai",
          body: validated.data.hint,
          source: "hint",
        },
      });
    }
    return NextResponse.json(validated.data);
  } catch (e) {
    console.error("[hint] LLM error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI call failed" },
      { status: 502 },
    );
  }
}
