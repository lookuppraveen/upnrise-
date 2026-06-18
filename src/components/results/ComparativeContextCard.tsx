// Tier-3 comparative context card on the Roleplay Results page.
//
// Shows the trainee how their current score stacks up against:
//   • the module's tenant-wide peer average
//   • their own personal best for this module
//   • their recent trend (slope across last 5 attempts)
//   • the percentile they sit in vs peers
//
// Every row gracefully hides itself when the underlying metric is
// null (typical for the very first run of a module, or modules
// nobody else has touched yet).

import { Icon, type IconName } from "@/components/ui/Icon";
import type { ComparativeStats } from "@/lib/roleplay/comparative-stats";

export function ComparativeContextCard({
  currentScore,
  stats,
}: {
  currentScore: number | null;
  stats: ComparativeStats;
}) {
  const hasAny =
    stats.moduleAvgScore != null ||
    stats.modulePercentile != null ||
    stats.personalBest != null ||
    stats.trend != null;

  if (!hasAny) {
    return (
      <p className="text-[12px] text-ink-3 italic">
        Not enough history yet — comparisons appear once a few more
        attempts (yours or your teammates&apos;) land in this module.
      </p>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {stats.moduleAvgScore != null ? (
        <DeltaTile
          icon="users"
          label="Module average"
          value={`${stats.moduleAvgScore}`}
          peerLabel={`avg of ${stats.modulePeerCount - 1} peer${
            stats.modulePeerCount - 1 === 1 ? "" : "s"
          }`}
          delta={
            currentScore != null ? currentScore - stats.moduleAvgScore : null
          }
        />
      ) : null}

      {stats.modulePercentile != null ? (
        <PercentileTile percentile={stats.modulePercentile} />
      ) : null}

      {stats.personalBest != null ? (
        <DeltaTile
          icon="trophy"
          label="Your personal best"
          value={`${stats.personalBest}`}
          peerLabel="across all your attempts"
          delta={
            currentScore != null ? currentScore - stats.personalBest : null
          }
          badge={stats.isPersonalBest ? "NEW BEST" : undefined}
        />
      ) : null}

      {stats.trend != null ? (
        <TrendTile trend={stats.trend} slope={stats.trendSlope} />
      ) : null}
    </div>
  );
}

function DeltaTile({
  icon,
  label,
  value,
  peerLabel,
  delta,
  badge,
}: {
  icon: IconName;
  label: string;
  value: string;
  peerLabel: string;
  delta: number | null;
  badge?: string;
}) {
  const tone =
    delta == null
      ? "neutral"
      : delta > 0
        ? "good"
        : delta < 0
          ? "bad"
          : "neutral";

  const ring =
    tone === "good"
      ? "border-good/25"
      : tone === "bad"
        ? "border-bad/25"
        : "border-border";

  return (
    <div
      className={`rounded-[var(--r-md)] border ${ring} bg-surface p-4 flex flex-col gap-1.5`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-3">
          <Icon name={icon} size={11} />
          {label}
        </div>
        {badge ? (
          <span
            className="text-[9.5px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full bg-good text-white"
          >
            {badge}
          </span>
        ) : null}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[26px] leading-none text-ink tabular-nums">
          {value}
        </span>
        {delta != null && delta !== 0 ? (
          <DeltaPill delta={delta} />
        ) : null}
      </div>
      <div className="text-[10.5px] text-ink-3">{peerLabel}</div>
    </div>
  );
}

function PercentileTile({ percentile }: { percentile: number }) {
  // Top-decile gets a special "top X%" framing because "92nd percentile"
  // reads weirdly to a non-statistician.
  const topPct = 100 - percentile;
  const display =
    percentile >= 90 ? `Top ${Math.max(1, topPct)}%` : `${percentile}th`;
  const tone =
    percentile >= 75 ? "good" : percentile >= 40 ? "warn" : "bad";

  const ring =
    tone === "good"
      ? "border-good/25"
      : tone === "warn"
        ? "border-warn/25"
        : "border-bad/25";
  const text =
    tone === "good"
      ? "text-good"
      : tone === "warn"
        ? "text-warn"
        : "text-bad";

  return (
    <div
      className={`rounded-[var(--r-md)] border ${ring} bg-surface p-4 flex flex-col gap-1.5`}
    >
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-3">
        <Icon name="chart" size={11} />
        Peer percentile
      </div>
      <div className={`font-display text-[26px] leading-none tabular-nums ${text}`}>
        {display}
      </div>
      <div className="text-[10.5px] text-ink-3">
        {percentile >= 90
          ? "ahead of nearly everyone in this module"
          : `you scored better than ${percentile}% of peers`}
      </div>
    </div>
  );
}

function TrendTile({
  trend,
  slope,
}: {
  trend: "improving" | "flat" | "declining";
  slope: number | null;
}) {
  const tone =
    trend === "improving" ? "good" : trend === "declining" ? "bad" : "neutral";
  const ring =
    tone === "good"
      ? "border-good/25"
      : tone === "bad"
        ? "border-bad/25"
        : "border-border";
  const text =
    tone === "good"
      ? "text-good"
      : tone === "bad"
        ? "text-bad"
        : "text-ink";
  const label =
    trend === "improving"
      ? "Improving"
      : trend === "declining"
        ? "Declining"
        : "Holding steady";
  const arrow =
    trend === "improving" ? "▲" : trend === "declining" ? "▼" : "■";

  return (
    <div
      className={`rounded-[var(--r-md)] border ${ring} bg-surface p-4 flex flex-col gap-1.5`}
    >
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-3">
        <Icon name="activity" size={11} />
        Recent trend
      </div>
      <div className={`font-display text-[22px] leading-none ${text}`}>
        <span className="mr-1.5 text-[14px] align-middle">{arrow}</span>
        {label}
      </div>
      <div className="text-[10.5px] text-ink-3">
        {slope != null && slope !== 0
          ? `${slope > 0 ? "+" : ""}${slope} pts / attempt over last 5`
          : "across your last 5 attempts"}
      </div>
    </div>
  );
}

function DeltaPill({ delta }: { delta: number }) {
  const isUp = delta > 0;
  const sign = isUp ? "+" : "";
  return (
    <span
      className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md ${
        isUp ? "bg-good-pale text-good" : "bg-bad-pale text-bad"
      }`}
    >
      {sign}
      {delta}
    </span>
  );
}
