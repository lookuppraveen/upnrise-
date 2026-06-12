// HistoryView — client component for /learn/history.
//
// 3-card KPI row (AI summary + Sessions + Time practiced) + pill mode
// filter + timeline-style session list. Matches learn-05-history.png.
//
// AI summary is composed from real week-over-week deltas: this-week avg
// score vs the prior 7 days. Trend phrasing changes based on direction.
// We don't predict future scores (faked).

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import type { ModuleType } from "@prisma/client";
import { cn } from "@/lib/cn";

export type HistorySession = {
  id: string;
  score: number | null;
  priorScore: number | null;
  mode: "text" | "voice" | "video";
  durationSec: number | null;
  strongSkills: string[];
  weakSkills: string[];
  startedAt: Date;
  endedAt: Date | null;
  moduleId: string;
  module: {
    name: string;
    type: ModuleType;
    training: { id: string; title: string };
  };
};

type ModeFilter = "all" | "voice" | "text" | "video";

const MODE_TABS: Array<{ key: ModeFilter; label: string }> = [
  { key: "all", label: "All sessions" },
  { key: "voice", label: "Voice" },
  { key: "text", label: "Text" },
  { key: "video", label: "Video" },
];

export function HistoryView({
  history,
  aiBrief,
}: {
  history: HistorySession[];
  aiBrief?: string;
}) {
  const [mode, setMode] = useState<ModeFilter>("all");

  const filtered = useMemo(
    () => (mode === "all" ? history : history.filter((s) => s.mode === mode)),
    [history, mode],
  );

  const counts = useMemo(() => {
    return {
      all: history.length,
      voice: history.filter((s) => s.mode === "voice").length,
      text: history.filter((s) => s.mode === "text").length,
      video: history.filter((s) => s.mode === "video").length,
    };
  }, [history]);

  const totalMin = useMemo(
    () =>
      Math.round(
        history.reduce((s, x) => s + (x.durationSec ?? 0), 0) / 60,
      ),
    [history],
  );
  const avgMin =
    history.length > 0 ? Math.round(totalMin / history.length) : 0;

  const summary = useMemo(() => composeSummary(history), [history]);

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="font-display text-[36px] leading-[1.05] -tracking-[0.015em] text-accent">
          History
        </h1>
        <p className="text-ink-2 text-[13.5px]">
          Every session you&apos;ve practiced — the data your AI coach reasons
          over.
        </p>
      </header>

      {/* 3-card KPI row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[14px]">
        <AiSummaryCard summary={summary} aiBrief={aiBrief} />
        <KpiTile
          label="Sessions"
          value={String(history.length)}
          sub="in your history"
        />
        <KpiTile
          label="Time practiced"
          value={
            <>
              {totalMin}
              <span className="text-[20px] text-ink-3 font-display font-normal ml-1">
                min
              </span>
            </>
          }
          sub={history.length > 0 ? `avg ${avgMin} min/session` : "—"}
        />
      </div>

      {/* Mode pill tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {MODE_TABS.map((t) => {
          const active = t.key === mode;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setMode(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-[14px] py-[6px] rounded-full text-[12.5px] font-medium whitespace-nowrap transition-colors",
                active
                  ? "bg-ink text-white border border-ink"
                  : "bg-surface text-ink-2 border border-border hover:bg-surface-2",
              )}
            >
              {t.label}
              {!active && counts[t.key] > 0 ? (
                <span className="text-[11px] font-mono text-ink-3">
                  {counts[t.key]}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      {history.length === 0 ? (
        <Card pad="lg">
          <h2 className="font-display text-[22px]">No sessions yet</h2>
          <p className="text-ink-2 text-[13px] mt-2">
            Start a roleplay module to see your history here. Pick anything
            from{" "}
            <Link href="/learn/trainings" className="text-accent underline">
              Trainings
            </Link>
            .
          </p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card pad="lg">
          <p className="text-[13px] text-ink-2">
            No {mode} sessions yet.
          </p>
        </Card>
      ) : (
        <div className="relative">
          {/* Vertical timeline rail (decorative) */}
          <span
            aria-hidden
            className="absolute left-[148px] top-3 bottom-3 w-px bg-border"
          />
          <div className="space-y-3">
            {filtered.map((s) => (
              <TimelineRow key={s.id} s={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────── KPI tiles ───────────────

function KpiTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-[12px] px-[18px] py-4">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {label}
      </div>
      <div className="font-display text-[36px] leading-[1.05] -tracking-[0.01em] text-ink mt-1">
        {value}
      </div>
      <div className="text-[11.5px] text-ink-3 mt-1">{sub}</div>
    </div>
  );
}

// ─────────────── AI Summary card ───────────────

type Summary = {
  kind: "improving" | "steady" | "declining" | "first" | "empty";
  thisWeekAvg: number | null;
  priorWeekAvg: number | null;
  thisWeekSessions: number;
  strongTopSkill: string | null;
};

function AiSummaryCard({
  summary,
  aiBrief,
}: {
  summary: Summary;
  aiBrief?: string;
}) {
  const showJump =
    (summary.kind === "improving" || summary.kind === "declining") &&
    summary.thisWeekAvg != null &&
    summary.priorWeekAvg != null;

  return (
    <div
      className="rounded-[12px] p-[18px] border flex flex-col gap-1"
      style={{
        background: "linear-gradient(135deg, #f3eafa 0%, #fce8f0 100%)",
        borderColor: "#e6d2f1",
      }}
    >
      <div className="flex items-center gap-1.5 text-[11.5px]">
        <span
          className="w-[20px] h-[20px] grid place-items-center rounded-full text-white shrink-0"
          style={{
            background: "linear-gradient(135deg, #7c3aed, #b94e8d)",
            boxShadow: "0 2px 6px rgba(124,58,237,0.25)",
          }}
          aria-hidden
        >
          <Icon name="ai-sparkle" size={10} />
        </span>
        <span className="font-semibold text-ink">AI summary</span>
        <span className="text-ink-3">·</span>
        <span className="text-ink-2">this week</span>
      </div>
      <div className="font-display text-[22px] leading-[1.2] -tracking-[0.01em] mt-1">
        {summary.kind === "improving" && showJump ? (
          <>
            Your average jumped from{" "}
            <span className="text-bad font-semibold">
              {summary.priorWeekAvg}
            </span>{" "}
            <span className="text-ink-3">→</span>{" "}
            <span className="text-good font-semibold">
              {summary.thisWeekAvg}
            </span>
          </>
        ) : summary.kind === "declining" && showJump ? (
          <>
            Your average dipped from{" "}
            <span className="text-good font-semibold">
              {summary.priorWeekAvg}
            </span>{" "}
            <span className="text-ink-3">→</span>{" "}
            <span className="text-bad font-semibold">
              {summary.thisWeekAvg}
            </span>
          </>
        ) : summary.kind === "steady" && summary.thisWeekAvg != null ? (
          <>
            Holding steady at{" "}
            <span className="text-ink font-semibold">
              {summary.thisWeekAvg}
            </span>
          </>
        ) : summary.kind === "first" && summary.thisWeekAvg != null ? (
          <>
            Baseline:{" "}
            <span className="text-ink font-semibold">
              {summary.thisWeekAvg}
            </span>{" "}
            this week
          </>
        ) : (
          <span className="text-ink">Nothing this week yet.</span>
        )}
      </div>
      <div className="text-[12.5px] text-ink-2 mt-1.5 leading-[1.5]">
        {aiBrief ?? composeSummaryBody(summary)}
      </div>
    </div>
  );
}

function composeSummary(history: HistorySession[]): Summary {
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

  const topSkill = mostFrequent(
    thisWeek.flatMap((s) => s.strongSkills),
  );

  if (thisWeek.length === 0 && priorWeek.length === 0) {
    return {
      kind: "empty",
      thisWeekAvg: null,
      priorWeekAvg: null,
      thisWeekSessions: 0,
      strongTopSkill: null,
    };
  }
  if (thisAvg != null && priorAvg != null) {
    const delta = thisAvg - priorAvg;
    return {
      kind: delta >= 4 ? "improving" : delta <= -4 ? "declining" : "steady",
      thisWeekAvg: thisAvg,
      priorWeekAvg: priorAvg,
      thisWeekSessions: thisWeek.length,
      strongTopSkill: topSkill,
    };
  }
  if (thisAvg != null) {
    return {
      kind: "first",
      thisWeekAvg: thisAvg,
      priorWeekAvg: null,
      thisWeekSessions: thisWeek.length,
      strongTopSkill: topSkill,
    };
  }
  return {
    kind: "empty",
    thisWeekAvg: null,
    priorWeekAvg: null,
    thisWeekSessions: 0,
    strongTopSkill: null,
  };
}

function composeSummaryBody(s: Summary): string {
  if (s.kind === "empty") {
    return "Run a session this week to see the coach reason over it.";
  }
  const bits: string[] = [];
  bits.push(
    `${s.thisWeekSessions} ${s.thisWeekSessions === 1 ? "session" : "sessions"} this week.`,
  );
  if (s.strongTopSkill) {
    bits.push(`Strongest skill: ${s.strongTopSkill}.`);
  }
  if (s.kind === "improving") {
    bits.push("Keep this pace and you'll lock the gains in.");
  } else if (s.kind === "declining") {
    bits.push(
      "A focused run this week usually swings the trend back.",
    );
  } else if (s.kind === "steady") {
    bits.push("Try a stretch scenario to break through.");
  } else if (s.kind === "first") {
    bits.push("Your baseline is set — the coach starts tuning from here.");
  }
  return bits.join(" ");
}

// ─────────────── Timeline row ───────────────

function TimelineRow({ s }: { s: HistorySession }) {
  const delta =
    s.score != null && s.priorScore != null ? s.score - s.priorScore : null;
  const dur =
    s.durationSec != null
      ? `${Math.floor(s.durationSec / 60)}m ${s.durationSec % 60}s`
      : "—";
  const date = new Date(s.startedAt);

  const modIcon = MODULE_TYPE_ICON[s.module.type];
  const modTone = MODULE_TYPE_TONE[s.module.type];

  return (
    <Link
      href={`/learn/trainings/${s.module.training.id}/modules/${s.moduleId}/results/${s.id}`}
      className="block group"
    >
      <div className="flex items-stretch gap-4">
        {/* Date / time column */}
        <div className="w-[140px] shrink-0 text-right pt-2">
          <div className="text-[12px] text-ink font-medium">
            {fmtRelativeDate(date)}
          </div>
          <div className="text-[11px] text-ink-3 font-mono">
            {date.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </div>
        </div>

        {/* Timeline marker */}
        <div className="w-2 shrink-0 flex justify-center pt-[14px]">
          <span
            className={cn(
              "w-3 h-3 rounded-full border-2 border-surface",
              s.score != null && s.score >= 70
                ? "bg-good"
                : s.score != null && s.score < 50
                  ? "bg-bad"
                  : "bg-accent",
            )}
            style={{
              boxShadow: "0 0 0 1.5px var(--border)",
            }}
          />
        </div>

        {/* Session card */}
        <Card
          pad="md"
          className="flex-1 group-hover:border-ink transition-colors rounded-[12px]"
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "w-10 h-10 rounded-[10px] grid place-items-center shrink-0",
                modTone,
              )}
            >
              <Icon name={modIcon} size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-semibold text-[13.5px] text-ink truncate">
                  {s.module.name}
                </span>
                <span className="text-ink-3 text-[12px]">·</span>
                <span className="text-[12px] text-ink-2 truncate">
                  {s.module.training.title}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11.5px] text-ink-3 font-mono mt-1">
                <span className="uppercase tracking-[0.08em] font-semibold">
                  {s.mode}
                </span>
                <span>·</span>
                <span>{dur}</span>
              </div>
              {s.strongSkills.length > 0 || s.weakSkills.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-2">
                  {s.strongSkills.slice(0, 2).map((sk) => (
                    <Chip key={`s-${sk}`} tone="good">
                      + {sk}
                    </Chip>
                  ))}
                  {s.weakSkills.slice(0, 2).map((sk) => (
                    <Chip key={`w-${sk}`} tone="warn">
                      – {sk}
                    </Chip>
                  ))}
                </div>
              ) : null}
            </div>
            {/* Score block */}
            <div className="shrink-0 text-center min-w-[56px]">
              {s.score != null ? (
                <div className="font-display text-[28px] leading-none -tracking-[0.01em] text-ink">
                  {s.score}
                </div>
              ) : (
                <div className="font-mono text-[12px] text-ink-3">n/a</div>
              )}
              {delta != null ? (
                <div
                  className={cn(
                    "font-mono text-[10.5px] mt-1 inline-flex items-center gap-[2px]",
                    delta >= 0 ? "text-good" : "text-bad",
                  )}
                >
                  <span>{delta >= 0 ? "▲" : "▼"}</span>
                  <span>{Math.abs(delta)}</span>
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      </div>
    </Link>
  );
}

const MODULE_TYPE_ICON: Record<ModuleType, IconName> = {
  video: "play",
  roleplay: "mic",
  quiz: "clipboard",
  document: "book",
  gamified: "trophy",
  evaluation: "wand",
};

const MODULE_TYPE_TONE: Record<ModuleType, string> = {
  video: "bg-[#ede9fe] text-[#6d4ad9]",
  roleplay: "bg-accent-pale text-accent-strong",
  quiz: "bg-warn-pale text-warn",
  document: "bg-good-pale text-good",
  gamified: "bg-[#fef3c7] text-[#92400e]",
  evaluation: "bg-[#cffafe] text-[#155e75]",
};

function Chip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "good" | "warn";
}) {
  return (
    <span
      className={cn(
        "text-[11px] px-2 py-[2px] rounded-md border",
        tone === "good"
          ? "bg-good-pale border-good/20 text-good"
          : "bg-warn-pale border-warn/20 text-warn",
      )}
    >
      {children}
    </span>
  );
}

// ─────────────── helpers ───────────────

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
}

function mostFrequent(arr: string[]): string | null {
  if (arr.length === 0) return null;
  const m = new Map<string, number>();
  for (const s of arr) m.set(s, (m.get(s) ?? 0) + 1);
  let best = "";
  let bestN = 0;
  for (const [k, n] of m) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best || null;
}

function fmtRelativeDate(d: Date): string {
  const now = new Date();
  const startToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const t = d.getTime();
  const startYesterday = startToday - 24 * 60 * 60 * 1000;
  if (t >= startToday) return "Today";
  if (t >= startYesterday) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
