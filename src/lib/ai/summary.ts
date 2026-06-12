// AI prose generators for the weekly summaries on /learn/history and the
// admin dashboard's "Weekly brief". Both pages already compute the real
// stats (sessions, deltas, top skills). This helper takes those stats and
// asks the fast model to compose a friendlier paragraph with a small
// forward-looking nudge — still grounded in real numbers.
//
// In-memory TTL cache keyed by a signal fingerprint, so repeat renders
// during the same hour don't re-pay Claude. The fallback path always
// returns deterministic prose, so the UI never breaks if the LLM call
// fails.

import "server-only";
import { anthropic } from "@/lib/ai/client";
import { getAIConfig } from "@/lib/ai/config";

type CacheEntry = { value: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60 * 60 * 1000; // 1 hour

async function generateProse(args: {
  cacheKey: string;
  system: string;
  user: string;
  fallback: string;
}): Promise<string> {
  const hit = cache.get(args.cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  let prose = "";
  try {
    const ai = await getAIConfig();
    const resp = await anthropic.messages.create({
      model: ai.fastModel,
      max_tokens: 220,
      system: args.system,
      messages: [{ role: "user", content: args.user }],
    });
    prose = resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()
      .replace(/^["']|["']$/g, "")
      .trim();
  } catch (err) {
    console.error("[ai.summary] LLM error", err);
  }
  if (!prose) return args.fallback;
  cache.set(args.cacheKey, {
    value: prose,
    expiresAt: Date.now() + TTL_MS,
  });
  return prose;
}

// ─────────────── Trainee · Weekly history brief ───────────────

export type TraineeWeeklySignal = {
  kind: "improving" | "steady" | "declining" | "first" | "empty";
  thisWeekSessions: number;
  thisWeekAvg: number | null;
  priorWeekAvg: number | null;
  topSkill: string | null;
};

/**
 * 1-3 sentence brief for the trainee's history page. Tone shifts with
 * trend kind. Returns deterministic fallback when LLM is unavailable.
 */
export async function generateTraineeWeeklyBrief(input: {
  userId: string;
  signal: TraineeWeeklySignal;
}): Promise<string> {
  const s = input.signal;
  const fallback = deterministicTraineeBrief(s);
  if (s.kind === "empty") return fallback;

  const cacheKey = [
    "trainee-weekly",
    input.userId,
    s.kind,
    s.thisWeekSessions,
    s.thisWeekAvg ?? "x",
    s.priorWeekAvg ?? "x",
    s.topSkill ?? "x",
  ].join("|");

  const system = [
    "You write short, warm coaching summaries for a sales-rep training app.",
    "Style: 2-3 short sentences, max 60 words, no lists, no headings.",
    "Open with a concrete observation about this week's numbers, then offer ONE specific next-step nudge.",
    "Use the trend direction faithfully — never claim improvement when the data says decline.",
    "Don't predict specific future scores. Forward language stays directional ('keep going', 'a focused session', 'try a stretch scenario').",
    "Return ONLY the paragraph — no preamble, no quotes.",
  ].join("\n");

  const userMsg = traineeSignalToPrompt(s);

  return generateProse({ cacheKey, system, user: userMsg, fallback });
}

function traineeSignalToPrompt(s: TraineeWeeklySignal): string {
  const lines: string[] = [];
  lines.push(`Trend: ${s.kind}`);
  lines.push(`Sessions this week: ${s.thisWeekSessions}`);
  if (s.thisWeekAvg != null)
    lines.push(`Avg score this week: ${s.thisWeekAvg}`);
  if (s.priorWeekAvg != null)
    lines.push(`Avg score prior week: ${s.priorWeekAvg}`);
  if (s.topSkill) lines.push(`Strongest skill this week: ${s.topSkill}`);
  lines.push("");
  lines.push("Compose the weekly brief now.");
  return lines.join("\n");
}

function deterministicTraineeBrief(s: TraineeWeeklySignal): string {
  if (s.kind === "empty")
    return "Run a session this week to see the coach reason over it.";
  const bits: string[] = [];
  bits.push(
    `${s.thisWeekSessions} ${s.thisWeekSessions === 1 ? "session" : "sessions"} this week.`,
  );
  if (s.topSkill) bits.push(`Strongest skill: ${s.topSkill}.`);
  if (s.kind === "improving")
    bits.push("Keep this pace and you'll lock the gains in.");
  else if (s.kind === "declining")
    bits.push("A focused run this week usually swings the trend back.");
  else if (s.kind === "steady")
    bits.push("Try a stretch scenario to break through.");
  else if (s.kind === "first")
    bits.push("Your baseline is set — the coach starts tuning from here.");
  return bits.join(" ");
}

// ─────────────── Admin · Weekly tenant brief ───────────────

export type AdminWeeklySignal = {
  learners: number;
  activeTrainings: number;
  sessions: number;
  avgScore: number | null;
  completionPct: number | null;
  topPerformerName: string | null;
  topPerformerScore: number | null;
  strugglingCount: number;
};

/**
 * 2-4 sentence weekly brief for the admin dashboard. Names the headline
 * win, a watch-out, and a small next step. Returns deterministic fallback
 * when LLM is unavailable.
 */
export async function generateAdminWeeklyBrief(input: {
  companyId: string;
  signal: AdminWeeklySignal;
}): Promise<string> {
  const s = input.signal;
  const fallback = deterministicAdminBrief(s);
  if (s.sessions === 0) return fallback;

  const cacheKey = [
    "admin-weekly",
    input.companyId,
    s.sessions,
    s.avgScore ?? "x",
    s.completionPct ?? "x",
    s.topPerformerName ?? "x",
    s.topPerformerScore ?? "x",
    s.strugglingCount,
  ].join("|");

  const system = [
    "You write short, candid weekly briefs for a corporate-learning admin.",
    "Style: 2-4 short sentences, max 80 words, no lists, no headings, no exclamation points.",
    "Lead with the headline win, then name a watch-out, then suggest ONE concrete next step.",
    "Use exact numbers and names the data provides. Never invent metrics.",
    "Don't predict specific future scores. Forward language stays directional.",
    "Return ONLY the brief — no preamble, no quotes.",
  ].join("\n");

  const userMsg = adminSignalToPrompt(s);
  return generateProse({ cacheKey, system, user: userMsg, fallback });
}

function adminSignalToPrompt(s: AdminWeeklySignal): string {
  const lines: string[] = [];
  lines.push(`Learners: ${s.learners}`);
  lines.push(`Active trainings: ${s.activeTrainings}`);
  lines.push(`Sessions: ${s.sessions}`);
  if (s.avgScore != null) lines.push(`Avg score across tenant: ${s.avgScore}`);
  if (s.completionPct != null)
    lines.push(`Assignment completion: ${s.completionPct}%`);
  if (s.topPerformerName && s.topPerformerScore != null) {
    lines.push(
      `Top performer: ${s.topPerformerName} (${s.topPerformerScore} avg)`,
    );
  }
  lines.push(`Learners below 60 avg: ${s.strugglingCount}`);
  lines.push("");
  lines.push("Compose the admin weekly brief now.");
  return lines.join("\n");
}

function deterministicAdminBrief(s: AdminWeeklySignal): string {
  if (s.sessions === 0) {
    return "No roleplays have run this week — once trainees start practising, the numbers below will fill in.";
  }
  const bits: string[] = [];
  if (s.avgScore != null) {
    bits.push(
      `Org average is ${s.avgScore} across ${s.sessions} session${s.sessions === 1 ? "" : "s"}${s.completionPct != null ? `, with assignments at ${s.completionPct}% complete` : ""}.`,
    );
  }
  if (s.topPerformerName && s.topPerformerScore != null) {
    bits.push(
      `${s.topPerformerName} is pacing the leaderboard at ${s.topPerformerScore}.`,
    );
  }
  if (s.strugglingCount > 0) {
    bits.push(
      `${s.strugglingCount} learner${s.strugglingCount === 1 ? " is" : "s are"} averaging below 60 — worth a coaching pass.`,
    );
  } else {
    bits.push("No-one is averaging below 60 right now.");
  }
  return bits.join(" ");
}
