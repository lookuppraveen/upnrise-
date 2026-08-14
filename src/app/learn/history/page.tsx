// Trainee · History  (03_TRAINEE.md §History)
//
// Server fetches the learner's ended sessions and hands off to the client
// HistoryView which renders the 3-card KPI row + mode filter pills +
// timeline. The weekly AI brief is generated server-side from real
// week-over-week stats and passed in as prose.

import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth/session";
import { getHistoryForUser } from "@/lib/db/queries";
import {
  HistoryView,
  type HistorySession,
} from "@/components/learn/HistoryView";
import {
  generateTraineeWeeklyBrief,
  type TraineeWeeklySignal,
} from "@/lib/ai/summary";

export default async function HistoryPage() {
  const user = (await getSessionUser())!;
  const history = await getHistoryForUser(user.id);

  const rows: HistorySession[] = history.map((s) => ({
    id: s.id,
    score: s.score,
    priorScore: s.priorScore,
    mode: s.mode,
    durationSec: s.durationSec,
    strongSkills: s.strongSkills,
    weakSkills: s.weakSkills,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    moduleId: s.moduleId,
    module: {
      name: s.module.name,
      type: s.module.type,
      training: s.module.training,
    },
  }));

  const signal = buildSignal(rows);

  // Weekly brief hits Claude — cold ~1–3s. It's now streamed via
  // <Suspense> so the KPI row + timeline render immediately. The
  // AiSummaryCard falls back to its deterministic summary body while
  // the brief resolves; the brief swaps in when ready.
  return (
    <div className="px-7 pt-6 pb-20 max-w-[1100px]">
      <HistoryView
        history={rows}
        aiBrief={
          <Suspense fallback={<HistoryBriefFallback />}>
            <HistoryBriefText
              userId={user.id}
              companyId={user.companyId ?? null}
              signal={signal}
            />
          </Suspense>
        }
      />
    </div>
  );
}

async function HistoryBriefText({
  userId,
  companyId,
  signal,
}: {
  userId: string;
  companyId: string | null;
  signal: TraineeWeeklySignal;
}) {
  const text = await generateTraineeWeeklyBrief({ userId, companyId, signal });
  return <>{text}</>;
}

function HistoryBriefFallback() {
  return (
    <span className="inline-flex items-center gap-2 text-ink-3">
      <span
        aria-hidden
        className="inline-block w-3 h-3 rounded-full border-2 border-ink-3/40 border-r-transparent animate-spin"
      />
      Reading your week…
    </span>
  );
}

// Same shape the client component computes; we run it server-side so the
// generator gets fed deterministic numbers.
function buildSignal(history: HistorySession[]): TraineeWeeklySignal {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const thisWeek = history.filter(
    (s) =>
      s.score != null && now - new Date(s.startedAt).getTime() <= 7 * day,
  );
  const priorWeek = history.filter((s) => {
    if (s.score == null) return false;
    const t = now - new Date(s.startedAt).getTime();
    return t > 7 * day && t <= 14 * day;
  });

  const thisAvg = avg(thisWeek.map((s) => s.score!));
  const priorAvg = avg(priorWeek.map((s) => s.score!));
  const topSkill = mostFrequent(thisWeek.flatMap((s) => s.strongSkills));

  if (thisWeek.length === 0 && priorWeek.length === 0) {
    return {
      kind: "empty",
      thisWeekSessions: 0,
      thisWeekAvg: null,
      priorWeekAvg: null,
      topSkill: null,
    };
  }
  if (thisAvg != null && priorAvg != null) {
    const delta = thisAvg - priorAvg;
    return {
      kind:
        delta >= 4 ? "improving" : delta <= -4 ? "declining" : "steady",
      thisWeekSessions: thisWeek.length,
      thisWeekAvg: thisAvg,
      priorWeekAvg: priorAvg,
      topSkill,
    };
  }
  if (thisAvg != null) {
    return {
      kind: "first",
      thisWeekSessions: thisWeek.length,
      thisWeekAvg: thisAvg,
      priorWeekAvg: null,
      topSkill,
    };
  }
  return {
    kind: "empty",
    thisWeekSessions: 0,
    thisWeekAvg: null,
    priorWeekAvg: null,
    topSkill: null,
  };
}

function avg(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}

function mostFrequent(xs: string[]): string | null {
  if (xs.length === 0) return null;
  const counts = new Map<string, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best: string | null = null;
  let bestN = -1;
  for (const [k, v] of counts) if (v > bestN) ((best = k), (bestN = v));
  return best;
}
