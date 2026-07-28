// POST /api/roleplay/start
//
// Body: { moduleId: string }
// Resp: { sessionId, opening: string }
//
// Creates a fresh roleplay_session, asks Claude for the persona's opening
// line, persists it as the first transcript turn. Subsequent turns go through
// /api/roleplay/turn (streaming).

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { anthropic } from "@/lib/ai/client";
import { loadModuleForUser } from "@/lib/ai/roleplay-access";

// Match the turn route — Sonnet 4.6 for speed without quality loss.
// Override with ANTHROPIC_MODEL_ROLEPLAY to switch (e.g. Haiku 4.5).
const ROLEPLAY_MODEL =
  process.env.ANTHROPIC_MODEL_ROLEPLAY ?? "claude-sonnet-4-6";
import {
  appendTurn,
  buildSystemPrompt,
  type TranscriptTurn,
} from "@/lib/ai/roleplay";
import { parseAdditionalSettings } from "@/lib/roleplay/additional-settings";

const Body = z.object({
  moduleId: z.string().min(1).max(100),
  // The trainee's chosen language at the pre-session gate. Cap to a
  // reasonable display length (e.g. "English", "हिन्दी", "en-US").
  // Persisted on the session so the results page shows what was used,
  // not what the persona was *configured* for.
  language: z.string().trim().min(1).max(40).optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Trainees + admins (the latter for /admin/preview/...) can both
  // run a roleplay. loadModuleForUser enforces tenant ownership and
  // adapts the published-gate by role.
  if (user.role !== "trainee" && user.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad body" }, { status: 400 });

  const mod = await loadModuleForUser(user, parsed.data.moduleId);
  if (!mod || !mod.roleplayConfig)
    return NextResponse.json({ error: "module not found" }, { status: 404 });

  // Enforce the admin's attempts cap. Trainees are blocked once they
  // hit the limit; admins (using the "Preview as trainee" path) bypass
  // the gate so they can keep testing.
  const settings = parseAdditionalSettings(mod.body);
  if (user.role === "trainee" && settings.attempts.kind === "limited") {
    const used = await prisma.roleplaySession.count({
      where: { userId: user.id, moduleId: mod.id },
    });
    if (used >= settings.attempts.limit) {
      return NextResponse.json(
        {
          error: "attempt_limit_reached",
          used,
          limit: settings.attempts.limit,
        },
        { status: 403 },
      );
    }
  }

  // Enforce startAt / dueAt scheduling gates. Admins bypass so they
  // can preview at any time. Trainees are blocked if the training
  // hasn't opened yet or has already closed.
  if (user.role === "trainee") {
    const now = new Date();
    const { startAt, dueAt } = mod.training;
    if (startAt && now < startAt) {
      return NextResponse.json(
        {
          error: "not_open_yet",
          opensAt: startAt.toISOString(),
        },
        { status: 403 },
      );
    }
    if (dueAt && now > dueAt) {
      return NextResponse.json(
        {
          error: "past_due",
          dueAt: dueAt.toISOString(),
        },
        { status: 403 },
      );
    }
  }

  // Read the ideal conversation off module.body so the system prompt
  // can lean on it when the admin enabled "Follow Ideal conversation".
  const idealConversation =
    mod.body &&
    typeof mod.body === "object" &&
    !Array.isArray(mod.body) &&
    typeof (mod.body as Record<string, unknown>).idealConversation === "string"
      ? ((mod.body as Record<string, unknown>).idealConversation as string)
      : null;

  // Look up prior best to record on the session row.
  const priorBest = await prisma.roleplaySession.aggregate({
    where: { userId: user.id, moduleId: mod.id, score: { not: null } },
    _max: { score: true },
  });

  const cfg = mod.roleplayConfig;
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

  // When the admin set "Start Roleplay By" = User, we skip the AI
  // primer — the trainee composes the first message and the persona
  // only responds via /api/roleplay/turn. Empty transcript signals
  // "you go first" to the player.
  let opening: string | null = null;
  let transcript: TranscriptTurn[] = [];

  if (settings.startRoleplayBy !== "user") {
    // Ask Claude for the persona's opening line. Empty messages array
    // means "you go first" — we instruct it via a primer user message.
    // Cache the system block; the very next /turn call will hit it.
    //
    // The opening sets the tone for the entire roleplay. Generic "Hi,
    // how can I help you?" openings waste the trainee's first turn on
    // a boilerplate exchange. We steer toward openings that:
    //   • Anchor to the scenario (why we're talking today)
    //   • Give the trainee something concrete to engage with
    //   • Sound like a real person, not a receptionist script
    const completion = await anthropic.messages.create({
      model: ROLEPLAY_MODEL,
      max_tokens: 180,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content:
            "[The learner has just connected and is waiting for you to speak. Open the conversation in character with a single line, 1–2 sentences (25 words max total). Ground the opening in THIS specific scenario — reference what brought you here, what you're looking for, or a specific concern you have — so the learner has something concrete to respond to. Avoid empty pleasantries like 'How can I help you?' or 'Nice to meet you'; get to the point quickly. Speak like a real person, not a script.]",
        },
      ],
    });

    const openingBlock = completion.content.find((b) => b.type === "text");
    opening =
      openingBlock && openingBlock.type === "text"
        ? openingBlock.text.trim()
        : "(silence)";
    transcript = appendTurn([], "persona", opening);
  }

  const session = await prisma.roleplaySession.create({
    data: {
      userId: user.id,
      moduleId: mod.id,
      mode: cfg.mode,
      language: parsed.data.language ?? null,
      priorScore: priorBest._max.score,
      transcript,
    },
    select: { id: true },
  });

  return NextResponse.json({ sessionId: session.id, opening });
}
