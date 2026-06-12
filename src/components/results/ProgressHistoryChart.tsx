// ProgressHistoryChart — Overall / Skills tabbed SVG line chart that
// renders the learner's attempt history for one module. Drawn inline
// (no chart lib) so this stays tiny and never blocks Roleplay results
// from rendering on a missing CDN dep.
//
// Y axis: 0–100. X axis: each attempt's index (1..N). Each rubric
// criterion becomes a series in the Skills tab.

"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";

export type AttemptPoint = {
  /** 1-based attempt index. */
  index: number;
  /** Overall 0–100. */
  score: number | null;
  /** Per-criterion id → 0–100. */
  rubric: Record<string, number>;
  /** Auto-failed (below min duration). Excluded from the chart so the
   *  trend line isn't pulled to 0 by junk runs. */
  autoFailed: boolean;
};

export type SkillSeries = {
  id: string;
  label: string;
  color: string;
};

export function ProgressHistoryChart({
  attempts,
  skills,
}: {
  attempts: AttemptPoint[];
  skills: SkillSeries[];
}) {
  const [tab, setTab] = useState<"overall" | "skills">("overall");
  // Filter to attempts with a numeric score AND not auto-failed so the
  // chart isn't pulled to 0 by junk runs or in-progress sessions.
  const scoredAttempts = useMemo(
    () => attempts.filter((a) => !a.autoFailed && a.score != null),
    [attempts],
  );
  const overallSeries = useMemo(
    () => scoredAttempts.map((a) => ({ x: a.index, y: a.score as number })),
    [scoredAttempts],
  );

  if (attempts.length === 0) {
    return <EmptyState message="No prior attempts yet." />;
  }
  // First-attempt empty state: one dot is not a trend. Tell the trainee
  // the chart populates from their next attempt.
  if (scoredAttempts.length <= 1) {
    return (
      <EmptyState message="First scored attempt — the chart populates from your next completed run." />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setTab("overall")}
          suppressHydrationWarning
          className={cn(
            "text-[13px] font-semibold pb-1.5 border-b-2 transition-colors",
            tab === "overall"
              ? "border-accent text-accent"
              : "border-transparent text-ink-3 hover:text-ink",
          )}
        >
          Overall
        </button>
        <button
          type="button"
          onClick={() => setTab("skills")}
          suppressHydrationWarning
          className={cn(
            "text-[13px] font-semibold pb-1.5 border-b-2 transition-colors",
            tab === "skills"
              ? "border-accent text-accent"
              : "border-transparent text-ink-3 hover:text-ink",
          )}
        >
          Skills
        </button>
      </div>

      {tab === "overall" ? (
        <ChartSvg
          series={[
            {
              label: "Overall",
              color: "var(--accent, #7c5cd6)",
              points: overallSeries,
            },
          ]}
          xMax={Math.max(2, attempts.length)}
          showLegend={false}
        />
      ) : skills.length === 0 ? (
        <EmptyState message="No skill rubric configured on this module." />
      ) : (
        <ChartSvg
          series={skills.map((s) => ({
            label: s.label,
            color: s.color,
            points: scoredAttempts
              .filter((a) => typeof a.rubric[s.id] === "number")
              .map((a) => ({ x: a.index, y: a.rubric[s.id] })),
          }))}
          xMax={Math.max(2, attempts.length)}
          showLegend
        />
      )}

      <div className="text-[10.5px] text-ink-3 text-center font-mono mt-1">
        Latest Attempts
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-[260px] grid place-items-center text-[12.5px] text-ink-3">
      {message}
    </div>
  );
}

type Series = {
  label: string;
  color: string;
  points: { x: number; y: number }[];
};

function ChartSvg({
  series,
  xMax,
  showLegend,
}: {
  series: Series[];
  xMax: number;
  showLegend: boolean;
}) {
  // Use a viewBox so the chart scales to whatever container width.
  // Padding leaves room for Y labels (left) and a 1-row legend (top).
  const W = 600;
  const H = 240;
  const padL = 32;
  const padR = 12;
  const padT = 8;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xToPx = (x: number) =>
    padL + ((x - 1) / Math.max(1, xMax - 1)) * innerW;
  const yToPx = (y: number) => padT + (1 - y / 100) * innerH;

  const yTicks = [0, 20, 40, 60, 80, 100];

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-[240px]"
        role="img"
        aria-label="Progress history chart"
      >
        {/* Y grid + labels */}
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              y1={yToPx(t)}
              x2={W - padR}
              y2={yToPx(t)}
              stroke="var(--border, #e5e5ec)"
              strokeDasharray={t === 0 || t === 100 ? "0" : "3 3"}
            />
            <text
              x={padL - 6}
              y={yToPx(t) + 3}
              textAnchor="end"
              fontSize="9"
              fill="var(--ink-3, #888)"
              fontFamily="var(--font-jetbrains, monospace)"
            >
              {t}%
            </text>
          </g>
        ))}

        {/* Each series — polyline + dots */}
        {series.map((s) => {
          if (s.points.length === 0) return null;
          const d = s.points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${xToPx(p.x)} ${yToPx(p.y)}`)
            .join(" ");
          return (
            <g key={s.label}>
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.points.map((p) => (
                <circle
                  key={`${p.x}-${p.y}`}
                  cx={xToPx(p.x)}
                  cy={yToPx(p.y)}
                  r="3"
                  fill={s.color}
                />
              ))}
            </g>
          );
        })}
      </svg>

      {showLegend ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 px-1">
          {series.map((s) => (
            <span
              key={s.label}
              className="inline-flex items-center gap-1.5 text-[11px] text-ink-2"
            >
              <span
                aria-hidden
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ background: s.color }}
              />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Deterministic palette so the same rubric criterion always gets the
// same swatch across the page. Imported by the page when it maps
// rubric criteria → SkillSeries.
export const SKILL_COLORS = [
  "#7c5cd6",
  "#e85d3a",
  "#2a7d4f",
  "#2f80f5",
  "#c97a1b",
  "#b94e8d",
];
