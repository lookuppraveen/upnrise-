// POST /api/roleplay/end
//
// Body: { sessionId }
// Resp: { redirect }
//
//   1. Verifies the session belongs to the user.
//   2. Marks endedAt + durationSec.
//   3. Runs scoreSession() — inline, blocking. May take 3–10s; the player
//      shows an "Ending…" state via React useTransition while we wait.
//   4. Persists score, rubric_scores, strong/weak skills.
//   5. Inserts an `feedback` row with the AI coaching summary (kind=ai).
//   6. Returns the results-page URL.
//
// If scoring fails (Claude error, malformed tool output), session is still
// marked ended and the results page renders the transcript without scores.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { loadSessionForUser } from "@/lib/ai/roleplay-access";
import type { TranscriptTurn } from "@/lib/ai/roleplay";
import { parseRubric, scoreSession } from "@/lib/ai/scoring";
import { awardForSession } from "@/lib/rewards/award";
import { parseAdditionalSettings } from "@/lib/roleplay/additional-settings";

const Body = z.object({ sessionId: z.string().min(1).max(100) });

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "trainee" && user.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad body" }, { status: 400 });

  const session = await loadSessionForUser(user, parsed.data.sessionId);
  if (!session)
    return NextResponse.json({ error: "session not found" }, { status: 404 });

  // 1. Mark ended (only on first end call).
  let durationSec =
    session.durationSec ??
    Math.max(
      0,
      Math.round((Date.now() - session.startedAt.getTime()) / 1000),
    );
  if (!session.endedAt) {
    const now = new Date();
    durationSec = Math.max(
      0,
      Math.round((now.getTime() - session.startedAt.getTime()) / 1000),
    );
    await prisma.roleplaySession.update({
      where: { id: session.id },
      data: { endedAt: now, durationSec },
    });
  }

  // 2. If already scored, just return the redirect.
  if (session.score != null) {
    return NextResponse.json({
      redirect: resultsUrl(session.module.training.id, session.moduleId, session.id),
    });
  }

  // 3. Honor the "Fail if below minimum duration" setting: skip the
  // (expensive) AI scoring call when the trainee ended too early and
  // the admin opted in. We write score=0 + an explanatory feedback row
  // so the results page shows a clear "below pass" outcome with the
  // reason, and skip rewards. Admins previewing still get this gate so
  // the behaviour matches what trainees see.
  const settings = parseAdditionalSettings(session.module.body);
  const minSec = settings.minDurationMin * 60;
  if (
    settings.failBelowMinDuration &&
    durationSec < minSec &&
    user.role === "trainee"
  ) {
    await prisma.$transaction([
      prisma.roleplaySession.update({
        where: { id: session.id },
        data: { score: 0, strongSkills: [], weakSkills: [] },
      }),
      prisma.feedback.create({
        data: {
          recipientId: user.id,
          sessionId: session.id,
          trainingId: session.module.training.id,
          kind: "ai",
          sentiment: "negative",
          body: `Session ended after ${durationSec}s — below the ${settings.minDurationMin}-minute minimum your trainer set. Marked as failed; please retry and stay in the conversation long enough to demonstrate the full flow.`,
          source: "system",
        },
      }),
    ]);
    return NextResponse.json({
      redirect: resultsUrl(
        session.module.training.id,
        session.moduleId,
        session.id,
      ),
    });
  }

  // 4. Score.
  const cfg = session.module.roleplayConfig;
  const rubric = cfg ? parseRubric(cfg.rubric) : null;
  const transcript = session.transcript as unknown as TranscriptTurn[];

  if (cfg && rubric) {
    const result = await scoreSession({
      transcript,
      rubric,
      persona: cfg.persona,
      scenario: cfg.scenario,
      feedbackTone: (session.module.training.feedbackTone as "soft" | "balanced" | "direct") ?? "balanced",
    });

    if (result) {
      const passingScore = session.module.training.passingScore ?? rubric.pass_score ?? 70;
      await prisma.$transaction([
        prisma.roleplaySession.update({
          where: { id: session.id },
          data: {
            score: result.overall,
            rubricScores: result.rubric_scores,
            strongSkills: result.strong_skills,
            weakSkills: result.weak_skills,
          },
        }),
        prisma.feedback.create({
          data: {
            recipientId: user.id,
            sessionId: session.id,
            trainingId: session.module.training.id,
            kind: "ai",
            sentiment:
              result.overall >= passingScore
                ? "positive"
                : result.overall >= 50
                  ? "neutral"
                  : "negative",
            body: result.summary,
            source: process.env.ANTHROPIC_MODEL_FAST ?? "claude",
          },
        }),
      ]);

      // Reward triggers — must run AFTER the score is persisted so the
      // completed-session counts include this one. Failures are swallowed
      // so a rewards bug never blocks the learner getting their results.
      if (user.companyId) {
        try {
          await awardForSession({
            userId: user.id,
            companyId: user.companyId,
            sessionId: session.id,
            moduleId: session.moduleId,
            trainingId: session.module.training.id,
            score: result.overall,
          });
        } catch (err) {
          console.error("[rewards] awardForSession failed", err);
        }
      }
    }
  }

  // Admins previewing a module don't get a /learn/.../results page —
  // they're not trainees, the route would redirect them out. Send
  // them back to the admin preview entry point so they can re-run
  // or close the tab. Trainees get the normal results redirect.
  const redirect =
    user.role === "admin"
      ? adminPreviewUrl(session.module.training.id, session.moduleId)
      : resultsUrl(session.module.training.id, session.moduleId, session.id);

  return NextResponse.json({ redirect });
}

function resultsUrl(trainingId: string, moduleId: string, sessionId: string) {
  return `/learn/trainings/${trainingId}/modules/${moduleId}/results/${sessionId}`;
}

function adminPreviewUrl(trainingId: string, moduleId: string) {
  return `/admin/preview/trainings/${trainingId}/modules/${moduleId}/play?ended=1`;
}
