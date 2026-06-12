// AI Coach context + system prompt.
//
// The coach is grounded in the learner's actual practice data — not just a
// generic chatbot. We snapshot recent sessions, top weak skills, and open
// assignments into the system prompt every turn. That makes replies specific
// ("in your last session you skipped the budget question") instead of
// generic ("good sellers ask about budget").

import { prisma } from "@/lib/db/client";
import {
  getDashboardStatsForUser,
  getTopWeakSkillsForUser,
  getAssignmentsWithProgressForUser,
  getHistoryForUser,
} from "@/lib/db/queries";

export type CoachContext = {
  stats: Awaited<ReturnType<typeof getDashboardStatsForUser>>;
  recentSessions: Array<{
    trainingTitle: string;
    moduleName: string;
    score: number | null;
    priorScore: number | null;
    when: Date;
    strongSkills: string[];
    weakSkills: string[];
    summary: string | null;
  }>;
  topWeakSkills: Awaited<ReturnType<typeof getTopWeakSkillsForUser>>;
  assignments: Array<{
    title: string;
    priority: string;
    progress: number;
    dueAt: Date | null;
    aiReason: string | null;
    completed: boolean;
  }>;
  companyName: string | null;
  // Tenant Global Bot config (from /admin/global-bot). Null = use defaults.
  botPersona: string | null;
  botGuardrails: string | null;
};

const RECENT_SESSION_LIMIT = 5;

export async function loadCoachContext(
  userId: string,
  companyId: string | null,
): Promise<CoachContext> {
  const [stats, history, weak, assignments, company] = await Promise.all([
    getDashboardStatsForUser(userId),
    getHistoryForUser(userId),
    getTopWeakSkillsForUser(userId, 5),
    getAssignmentsWithProgressForUser(userId),
    companyId
      ? prisma.company.findUnique({
          where: { id: companyId },
          select: {
            name: true,
            botPersona: true,
            botGuardrails: true,
          },
        })
      : Promise.resolve(null),
  ]);

  const recentHistory = history.slice(0, RECENT_SESSION_LIMIT);
  const sessionIds = recentHistory.map((h) => h.id);

  // Load AI summaries for those sessions in one query.
  const summaries = sessionIds.length
    ? await prisma.feedback.findMany({
        where: { sessionId: { in: sessionIds }, kind: "ai" },
        orderBy: { createdAt: "desc" },
        select: { sessionId: true, body: true },
      })
    : [];
  const summaryBySession = new Map(summaries.map((s) => [s.sessionId!, s.body]));

  return {
    stats,
    recentSessions: recentHistory.map((h) => ({
      trainingTitle: h.module.training.title,
      moduleName: h.module.name,
      score: h.score,
      priorScore: h.priorScore,
      when: h.startedAt,
      strongSkills: h.strongSkills,
      weakSkills: h.weakSkills,
      summary: summaryBySession.get(h.id) ?? null,
    })),
    topWeakSkills: weak,
    assignments: assignments.map((a) => ({
      title: a.training.title,
      priority: a.priority,
      progress: a.computedProgress,
      dueAt: a.dueAt,
      aiReason: a.aiReason,
      completed: a.computedStatus === "completed",
    })),
    companyName: company?.name ?? null,
    botPersona: company?.botPersona ?? null,
    botGuardrails: company?.botGuardrails ?? null,
  };
}

// ────────── Prompt builder ──────────

function fmtDate(d: Date): string {
  const days = Math.round(
    (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return d.toISOString().slice(0, 10);
}

export function buildCoachSystemPrompt(
  ctx: CoachContext,
  learnerName: string,
  platformDefaults?: {
    defaultCoachPersona: string | null;
    defaultCoachGuardrails: string | null;
  },
): string {
  const lines: string[] = [];

  lines.push(
    `You are an AI sales coach for ${learnerName}${ctx.companyName ? ` at ${ctx.companyName}` : ""}.`,
    "",
    "## Your job",
    "Help them get better at sales. Reason from their actual practice data below — never give generic advice that ignores what's happened.",
    "",
    "## Rules of engagement",
    "- Be specific. Reference real sessions and real skill gaps. Bad: 'work on rapport.' Good: 'in your discovery session 2 days ago, you opened with a feature pitch — try mirroring their language first.'",
    "- Be honest. Don't praise weak performance. If their avg is 55, don't tell them they're crushing it.",
    "- Default to 2–3 sentence replies. Use lists ONLY if they explicitly ask for a plan or a list.",
    "- Always offer one concrete next move at the end (a specific module to retry, a skill to focus on, a quiz question to answer).",
    "- If they ask you to quiz them, ask ONE specific question grounded in a real concept they struggle with. Wait for their answer; don't fire-hose.",
    "- Talk to them as 'you', warmly but professionally.",
    "- If they ask about something outside sales training, redirect briefly and bring them back.",
    "- Never quote internal database IDs. Never paste raw transcripts. Refer to sessions by training + module name + when.",
  );

  // Voice / Guardrails resolution (Phase 5.0):
  //   • Tenant override takes precedence (set via /admin/global-bot).
  //   • Platform default kicks in when no tenant override.
  //   • Neither set → platform-wide baseline rules above are all we use.
  const voiceLines =
    ctx.botPersona ?? platformDefaults?.defaultCoachPersona ?? null;
  const voiceSource = ctx.botPersona
    ? "tenant override"
    : platformDefaults?.defaultCoachPersona
      ? "platform default"
      : null;
  if (voiceLines && voiceSource) {
    lines.push("", `## Voice (${voiceSource})`, voiceLines);
  }
  const guardrailLines =
    ctx.botGuardrails ?? platformDefaults?.defaultCoachGuardrails ?? null;
  const guardSource = ctx.botGuardrails
    ? "tenant"
    : platformDefaults?.defaultCoachGuardrails
      ? "platform"
      : null;
  if (guardrailLines && guardSource) {
    lines.push("", `## Guardrails (${guardSource})`, guardrailLines);
  }

  lines.push("", "## Their snapshot");

  if (ctx.stats.sessions === 0) {
    lines.push(
      "They haven't practiced yet. Be encouraging, ask what they want to work on, and suggest browsing trainings or starting their assigned one.",
    );
  } else {
    lines.push(
      `- Sessions: ${ctx.stats.sessions}`,
      `- Avg score: ${ctx.stats.avgScore ?? "n/a"}, Best: ${ctx.stats.bestScore ?? "n/a"}`,
      `- Minutes practiced: ${ctx.stats.minutesPracticed}`,
    );
  }

  if (ctx.recentSessions.length > 0) {
    lines.push("", "## Recent sessions (newest first)");
    for (const s of ctx.recentSessions) {
      const delta =
        s.score != null && s.priorScore != null
          ? `, Δ ${s.score - s.priorScore >= 0 ? "+" : ""}${s.score - s.priorScore} vs prior`
          : "";
      lines.push(
        `- ${fmtDate(s.when)} · "${s.trainingTitle}" → "${s.moduleName}" — score ${s.score ?? "n/a"}${delta}`,
      );
      if (s.weakSkills.length) {
        lines.push(`    weak: ${s.weakSkills.join("; ")}`);
      }
      if (s.strongSkills.length) {
        lines.push(`    strong: ${s.strongSkills.join("; ")}`);
      }
      if (s.summary) {
        lines.push(`    coach's note: ${s.summary}`);
      }
    }
  }

  if (ctx.topWeakSkills.length > 0) {
    lines.push(
      "",
      "## Recurring weak skills (across last 20 sessions)",
      ...ctx.topWeakSkills.map((w) => `- ${w.skill}  (×${w.count})`),
    );
  }

  const openAssignments = ctx.assignments.filter((a) => !a.completed);
  if (openAssignments.length > 0) {
    lines.push("", "## Open assignments");
    for (const a of openAssignments) {
      const due = a.dueAt ? ` due ${fmtDate(a.dueAt)}` : "";
      lines.push(
        `- [${a.priority.toUpperCase()}] "${a.title}" — ${a.progress}% done${due}`,
      );
      if (a.aiReason) {
        lines.push(`    why: ${a.aiReason}`);
      }
    }
  }

  return lines.join("\n");
}
