// Feed-post auto-draft pipeline. Reads real activity signals for a tenant
// and asks the fast model to compose 1-3 short posts the admin can publish
// straight to the feed. Drafts are NEVER persisted by this helper — that
// only happens when the admin clicks "Publish" in the UI.

import { prisma } from "@/lib/db/client";
import { anthropic } from "@/lib/ai/client";
import { getAIConfig } from "@/lib/ai/config";

type SignalKind = "win" | "streak" | "milestone" | "at_risk";

type Signal = {
  kind: SignalKind;
  // Human-readable explanation of why the draft was suggested.
  reason: string;
  // Names mentioned so we can preserve them through Claude exactly.
  subjects: string[];
};

export type DraftKind = "announcement" | "win" | "ai_nudge";

export type Draft = {
  kind: DraftKind;
  body: string;
  reason: string;
};

/**
 * Build 1-3 draft posts for a tenant, grounded in real activity signals.
 * Returns an empty array when there's nothing worth saying.
 */
export async function buildDraftsForCompany(
  companyId: string,
): Promise<Draft[]> {
  const signals = await collectSignals(companyId);
  if (signals.length === 0) return [];

  const drafted = await Promise.all(
    signals.slice(0, 3).map((s) => draftPostFor(s)),
  );
  return drafted.filter((d): d is Draft => d != null);
}

// ─────────────── Signal collection ───────────────

async function collectSignals(companyId: string): Promise<Signal[]> {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const since14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const signals: Signal[] = [];

  // 1. WIN — anyone scored ≥90 in the last 7 days?
  const topScored = await prisma.roleplaySession.findFirst({
    where: {
      user: { companyId, role: "trainee" },
      score: { gte: 90 },
      endedAt: { gte: since7d },
    },
    orderBy: { score: "desc" },
    select: {
      score: true,
      user: { select: { name: true, email: true } },
      module: {
        select: {
          name: true,
          training: { select: { title: true } },
        },
      },
    },
  });
  if (topScored?.user && topScored.score != null) {
    const name =
      topScored.user.name ?? topScored.user.email.split("@")[0];
    signals.push({
      kind: "win",
      reason: `${name} scored ${topScored.score} on ${topScored.module.training.title}`,
      subjects: [name],
    });
  }

  // 2. STREAK — anyone has earned the 5-day streak this week?
  const streakEarning = await prisma.rewardEarning.findFirst({
    where: {
      companyId,
      action: "streak_5_days",
      awardedAt: { gte: since7d },
    },
    orderBy: { awardedAt: "desc" },
    select: {
      points: true,
      user: { select: { name: true, email: true } },
    },
  });
  if (streakEarning) {
    const name =
      streakEarning.user.name ?? streakEarning.user.email.split("@")[0];
    signals.push({
      kind: "streak",
      reason: `${name} hit a 5-day practice streak (+${streakEarning.points} pts)`,
      subjects: [name],
    });
  }

  // 3. MILESTONE — anyone completed a training this week?
  const completedTraining = await prisma.rewardEarning.findFirst({
    where: {
      companyId,
      action: "complete_training",
      awardedAt: { gte: since7d },
    },
    orderBy: { awardedAt: "desc" },
    select: {
      sourceId: true,
      user: { select: { name: true, email: true } },
    },
  });
  if (completedTraining) {
    const [name, title] = await Promise.all([
      Promise.resolve(
        completedTraining.user.name ??
          completedTraining.user.email.split("@")[0],
      ),
      prisma.training
        .findUnique({
          where: { id: completedTraining.sourceId },
          select: { title: true },
        })
        .then((t) => t?.title ?? "a training"),
    ]);
    signals.push({
      kind: "milestone",
      reason: `${name} finished every module of "${title}"`,
      subjects: [name],
    });
  }

  // 4. AT-RISK — learners with 3+ sessions averaging <60 in the last 14d.
  //    Use a group-by + filter pattern; cap to one nudge to keep output
  //    actionable rather than alarmist.
  const lowScoreGroups = await prisma.roleplaySession.groupBy({
    by: ["userId"],
    where: {
      user: { companyId, role: "trainee" },
      score: { not: null },
      endedAt: { gte: since14d },
    },
    _avg: { score: true },
    _count: { _all: true },
    having: { score: { _avg: { lt: 60 } } },
  });
  const struggling = lowScoreGroups.filter((g) => g._count._all >= 3);
  if (struggling.length > 0) {
    signals.push({
      kind: "at_risk",
      reason: `${struggling.length} learner${struggling.length === 1 ? "" : "s"} averaging below 60 over the last 14 days`,
      subjects: [],
    });
  }

  return signals;
}

// ─────────────── Draft composition ───────────────

const KIND_MAP: Record<SignalKind, DraftKind> = {
  win: "win",
  streak: "win",
  milestone: "win",
  at_risk: "ai_nudge",
};

async function draftPostFor(signal: Signal): Promise<Draft | null> {
  const kind = KIND_MAP[signal.kind];

  const system = [
    "You write short, warm, in-house corporate-learning announcements.",
    "Keep posts to 1-3 sentences and under 280 characters.",
    "Use the names provided verbatim — do not invent or alter them.",
    "No exclamation points back-to-back. No hashtags. No emoji except one optional opener.",
    "Tone shifts by post kind:",
    "  - win        → celebratory shout-out, name the person and what they did",
    "  - announcement → informational, professional",
    "  - ai_nudge   → encouraging coaching note from the team, NOT alarmist; suggest a small action",
    "Return ONLY the post body — no quotes, no preamble.",
  ].join("\n");

  const subjectsBlock =
    signal.subjects.length > 0
      ? `Subjects (use exactly these names): ${signal.subjects.join(", ")}\n`
      : "";

  const userMsg = [
    `Signal: ${signal.reason}`,
    `Post kind: ${kind}`,
    subjectsBlock,
    "Compose the post body now.",
  ].join("\n");

  let body = "";
  try {
    const ai = await getAIConfig();
    const resp = await anthropic.messages.create({
      model: ai.fastModel,
      max_tokens: 200,
      system,
      messages: [{ role: "user", content: userMsg }],
    });
    body = resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()
      // Strip wrapping quotes if Claude adds them.
      .replace(/^["']|["']$/g, "")
      .trim();
  } catch (err) {
    console.error("[feeds.autodraft] LLM error", err);
    return null;
  }

  if (!body || body.length > 1000) return null;

  return { kind, body, reason: signal.reason };
}
