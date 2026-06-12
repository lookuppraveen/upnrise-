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
});

const Out = z.object({
  hint: z.string().min(5).max(800),
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
      ? "Format: 2-4 short verbatim lines the learner can say. Each line starts with '• ' (bullet character). Each bullet is a complete, ready-to-speak sentence in first person — NOT coaching advice. No markdown asterisks. No preamble. No closing summary."
      : "Format: one ready-to-speak reply, 2-4 sentences, written in first person as if the learner is speaking it aloud. Plain text only. No headings. No bullets. No quotation marks around the whole reply. No coaching commentary — just the words to say.";

  const system = [
    "You are a teleprompter for a sales learner who is mid-roleplay. They just hit the Hint button and need the EXACT words to say back to the customer.",
    "",
    "Return ONLY the line the learner should speak next. Write it in first person, as if they are reading it aloud to the customer right now.",
    "",
    "Rules:",
    "- Output is the SCRIPT, not coaching. No 'You should…', no 'Try to…', no 'Acknowledge their concern' — write the actual sentence the learner says.",
    "- Tie the response to the customer's most recent line. Address their specific question, objection, or moment directly.",
    "- Match the persona's register: professional, concise, conversational. No marketing fluff.",
    "- Stay in character as a sales rep talking to this specific customer in this specific scenario.",
    "- Never include stage directions, brackets, or notes (e.g. no '[pause]', '[smile]', '(then ask…)').",
    "- Never name the speaker or prefix with 'Salesperson:' / 'Me:' — just the words.",
    "- If the transcript shows no turns yet (learner opens), produce a strong opening line that fits the scenario.",
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
      max_tokens: 400,
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
    // Persist the hint as a Feedback row so the results page can count
    // hints used and show the "HINT USED" badge. source="hint" keeps it
    // out of the AI coaching feedback card (results query already
    // excludes rows where source !== claude/etc).
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
    return NextResponse.json(validated.data);
  } catch (e) {
    console.error("[hint] LLM error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI call failed" },
      { status: 502 },
    );
  }
}
