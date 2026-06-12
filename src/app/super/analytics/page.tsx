// Super Admin · Analytics  (02_SUPER_ADMIN.md §Analytics)
//
// Cross-tenant breakdowns: by region, by industry, plan mix, top AI spend.
// The design source has retention/cohort curves and a weekly login heatmap;
// those need per-day rollups we don't materialize, so we don't fabricate
// them. Drill-in links go to the relevant tenant or to /super/plans.

import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import {
  getAnalyticsBreakdownsForSuper,
  getPlatformStats,
  listPlansForSuper,
} from "@/lib/db/queries";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type Breakdown = Awaited<
  ReturnType<typeof getAnalyticsBreakdownsForSuper>
>["byRegion"][number];

type TopSpender = Awaited<
  ReturnType<typeof getAnalyticsBreakdownsForSuper>
>["topAiSpend"][number];

type Plan = Awaited<ReturnType<typeof listPlansForSuper>>[number];

export default async function AnalyticsPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") return null;

  const [stats, breakdowns, plans] = await Promise.all([
    getPlatformStats(),
    getAnalyticsBreakdownsForSuper(),
    listPlansForSuper(),
  ]);

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1280px] space-y-5">
      <Header />
      <KpiStrip
        mrrCents={stats.mrrCents}
        arrCents={stats.arrCents}
        sessions={stats.sessions}
        aiSpendCents={stats.aiSpendCents}
      />

      <InsightBanner
        byRegion={breakdowns.byRegion}
        byIndustry={breakdowns.byIndustry}
        topSpender={breakdowns.topAiSpend[0]}
        totalAiCents={stats.aiSpendCents}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <BreakdownCard
          title="By region"
          icon="globe"
          rows={breakdowns.byRegion}
        />
        <BreakdownCard
          title="By industry"
          icon="layers"
          rows={breakdowns.byIndustry}
        />
      </div>

      <PlanMixCard plans={plans} />

      <TopSpendCard rows={breakdowns.topAiSpend} />
    </div>
  );
}

// ─────────────── Header ───────────────

function Header() {
  return (
    <header className="space-y-2">
      <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
        Analytics
      </h1>
      <p className="text-ink-2 text-[13.5px] max-w-[680px] leading-[1.5]">
        Cross-tenant breakdowns and where the money lives. Click any row to
        drill into a tenant; plan-mix bars cross-link to{" "}
        <Link href="/super/plans" className="text-accent underline">
          Plans
        </Link>{" "}
        for edits.
      </p>
    </header>
  );
}

// ─────────────── KPI strip ───────────────

function KpiStrip({
  mrrCents,
  arrCents,
  sessions,
  aiSpendCents,
}: {
  mrrCents: number;
  arrCents: number;
  sessions: number;
  aiSpendCents: number;
}) {
  const grossMarginPct =
    mrrCents > 0
      ? Math.round(((mrrCents - aiSpendCents) / mrrCents) * 100)
      : null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-[14px]">
      <KpiTile
        label="MRR"
        value={mrrCents > 0 ? `$${fmtK(mrrCents / 100)}` : "—"}
        sub="monthly recurring · paid tenants"
        icon="credit-card"
        tone="accent"
      />
      <KpiTile
        label="ARR"
        value={mrrCents > 0 ? `$${fmtK(arrCents / 100)}` : "—"}
        sub="annual run-rate · MRR × 12"
        icon="chart"
        tone="good"
      />
      <KpiTile
        label="Sessions"
        value={sessions.toLocaleString()}
        sub={
          sessions === 0
            ? "no roleplays yet"
            : "completed roleplays · all tenants"
        }
        icon="activity"
        tone="violet"
      />
      <KpiTile
        label="AI spend"
        value={aiSpendCents > 0 ? `$${fmtK(aiSpendCents / 100)}` : "$0"}
        sub={
          grossMarginPct == null
            ? "no MRR baseline"
            : `${grossMarginPct}% gross margin`
        }
        icon="ai-sparkle"
        tone="warn"
      />
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: IconName;
  tone: "accent" | "good" | "warn" | "violet";
}) {
  const corner =
    tone === "accent"
      ? "bg-accent-pale text-accent-strong"
      : tone === "good"
        ? "bg-good-pale text-good"
        : tone === "warn"
          ? "bg-warn-pale text-warn"
          : "bg-[#ede9fe] text-[#6d4ad9]";
  return (
    <div className="relative bg-surface border border-border rounded-[12px] px-[18px] py-4 flex flex-col gap-1">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {label}
      </div>
      <div className="font-display text-[32px] leading-[1.05] -tracking-[0.01em] mt-1">
        {value}
      </div>
      <div className="text-[11.5px] text-ink-3 mt-[3px] truncate">{sub}</div>
      <div
        className={cn(
          "absolute top-[14px] right-[14px] w-[28px] h-[28px] rounded-[7px] grid place-items-center",
          corner,
        )}
      >
        <Icon name={icon} size={13} />
      </div>
    </div>
  );
}

// ─────────────── Insight banner ───────────────
//
// Composes one paragraph from the real breakdowns — names the leading
// region, the densest industry, and the top AI spender's share.

function InsightBanner({
  byRegion,
  byIndustry,
  topSpender,
  totalAiCents,
}: {
  byRegion: Breakdown[];
  byIndustry: Breakdown[];
  topSpender: TopSpender | undefined;
  totalAiCents: number;
}) {
  if (byRegion.length === 0 && byIndustry.length === 0) {
    return null;
  }

  const totalMrr = byRegion.reduce((acc, r) => acc + r.mrrCents, 0);
  const leadingRegion = byRegion[0];
  const regionShare =
    leadingRegion && totalMrr > 0
      ? Math.round((leadingRegion.mrrCents / totalMrr) * 100)
      : null;

  const densestIndustry = byIndustry.length > 0
    ? [...byIndustry].sort((a, b) => b.seats - a.seats)[0]
    : null;

  const spenderShare =
    topSpender && totalAiCents > 0
      ? Math.round((topSpender.aiSpendCents / totalAiCents) * 100)
      : null;

  return (
    <div
      className="rounded-[12px] border px-5 py-4 flex items-start gap-3"
      style={{
        background: "linear-gradient(135deg, #f3eafa, #fce8f0)",
        borderColor: "#e6d2f1",
      }}
    >
      <div
        className="w-[32px] h-[32px] rounded-[8px] grid place-items-center text-white shrink-0"
        style={{ background: "linear-gradient(135deg, #a855f7, #ec4899)" }}
      >
        <Icon name="ai-sparkle" size={14} />
      </div>
      <div className="min-w-0 space-y-1 flex-1">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#6d4ad9]">
          UPnRise AI · Portfolio brief
        </div>
        <p className="text-[13px] text-ink leading-[1.55]">
          {leadingRegion && regionShare != null ? (
            <>
              <span className="font-semibold">{leadingRegion.key}</span> leads
              MRR with{" "}
              <span className="font-semibold text-good">{regionShare}%</span>{" "}
              of the book ($
              {fmtK(leadingRegion.mrrCents / 100)}).
            </>
          ) : null}
          {densestIndustry ? (
            <>
              {" "}
              <span className="font-semibold">
                {densestIndustry.key}
              </span>{" "}
              is the densest industry at{" "}
              <span className="font-semibold">
                {densestIndustry.seats.toLocaleString()} seats
              </span>{" "}
              across {densestIndustry.count} tenant
              {densestIndustry.count === 1 ? "" : "s"}.
            </>
          ) : null}
          {topSpender && spenderShare != null ? (
            <>
              {" "}
              <span className="font-semibold">{topSpender.name}</span> drives{" "}
              <span
                className={cn(
                  "font-semibold",
                  spenderShare >= 30 ? "text-bad" : "text-warn",
                )}
              >
                {spenderShare}%
              </span>{" "}
              of platform AI spend —{" "}
              {spenderShare >= 30
                ? "concentration risk worth talking through."
                : "noteworthy but distributed."}
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

// ─────────────── Breakdown card ───────────────

function BreakdownCard({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: IconName;
  rows: Breakdown[];
}) {
  const max = Math.max(...rows.map((r) => r.mrrCents), 1);
  const totalMrr = rows.reduce((acc, r) => acc + r.mrrCents, 0);
  return (
    <div className="bg-surface border border-border rounded-[12px] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-[28px] h-[28px] rounded-[7px] bg-accent-pale text-accent-strong grid place-items-center">
            <Icon name={icon} size={13} />
          </div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
            {title}
          </div>
        </div>
        <span className="text-[10.5px] font-mono text-ink-3">
          ${fmtK(totalMrr / 100)} MRR
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-ink-3">No tenants yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r, i) => {
            const pct = Math.round((r.mrrCents / max) * 100);
            const share =
              totalMrr > 0
                ? Math.round((r.mrrCents / totalMrr) * 100)
                : 0;
            const leader = i === 0;
            return (
              <li key={r.key} className="space-y-1">
                <div className="flex items-center gap-2 text-[12.5px]">
                  <span
                    className={cn(
                      "font-semibold truncate",
                      leader ? "text-ink" : "text-ink-2",
                    )}
                  >
                    {r.key}
                  </span>
                  <span className="text-[10.5px] font-mono text-ink-3 shrink-0">
                    {r.count} co · {r.seats.toLocaleString()} seats
                  </span>
                  <span className="ml-auto font-display text-[16px] leading-none tabular-nums text-ink">
                    ${fmtK(r.mrrCents / 100)}
                  </span>
                  <span className="font-mono text-[10.5px] text-ink-3 w-[34px] text-right shrink-0">
                    {share}%
                  </span>
                </div>
                <div className="h-[6px] rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      leader ? "bg-accent" : "bg-accent/55",
                    )}
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─────────────── Plan mix ───────────────

function PlanMixCard({ plans }: { plans: Plan[] }) {
  const totalMrr = plans.reduce((acc, p) => acc + p.mrrCents, 0);
  return (
    <div className="bg-surface border border-border rounded-[12px] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-[28px] h-[28px] rounded-[7px] bg-[#ede9fe] text-[#6d4ad9] grid place-items-center">
            <Icon name="layers" size={13} />
          </div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
            Plan mix
          </div>
        </div>
        <Link
          href="/super/plans"
          className="text-[12px] font-semibold text-accent hover:text-accent-strong inline-flex items-center gap-1"
        >
          Edit plans
          <Icon name="chevron-right" size={11} />
        </Link>
      </div>
      {plans.length === 0 ? (
        <p className="text-[12.5px] text-ink-3">No plans defined yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {plans.map((p) => {
            const share =
              totalMrr > 0
                ? Math.round((p.mrrCents / totalMrr) * 100)
                : 0;
            return (
              <div
                key={p.id}
                className="relative bg-surface-2/40 border border-border rounded-[10px] p-4 overflow-hidden"
              >
                <div
                  className="absolute left-0 top-0 bottom-0 w-[4px]"
                  style={{ backgroundColor: p.color }}
                  aria-hidden
                />
                <div className="pl-1 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="font-semibold text-[13px] text-ink">
                      {p.name}
                    </span>
                  </div>
                  <div className="font-display text-[24px] leading-none -tracking-[0.005em] text-ink">
                    ${fmtK(p.mrrCents / 100)}
                  </div>
                  <div className="text-[11px] font-mono text-ink-3">
                    {p.companies} compan{p.companies === 1 ? "y" : "ies"} ·{" "}
                    {share}% of mix
                  </div>
                  <div className="h-[5px] rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(2, share)}%`,
                        backgroundColor: p.color,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────── Top AI spend ───────────────

function TopSpendCard({ rows }: { rows: TopSpender[] }) {
  return (
    <div className="bg-surface border border-border rounded-[12px] p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-[28px] h-[28px] rounded-[7px] bg-warn-pale text-warn grid place-items-center">
          <Icon name="alert" size={13} />
        </div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
          Top AI spend
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-ink-3">No AI spend yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((t, i) => {
            const max = rows[0].aiSpendCents || 1;
            const pct = Math.round((t.aiSpendCents / max) * 100);
            return (
              <li key={t.id}>
                <Link
                  href={`/super/companies/${t.id}`}
                  className="flex items-center gap-3 py-3 hover:bg-surface-2 px-2 -mx-2 rounded-md transition-colors"
                >
                  <span className="w-5 text-[11px] font-mono text-ink-3 shrink-0 text-right">
                    {i + 1}.
                  </span>
                  <div
                    className="w-8 h-8 grid place-items-center rounded-[6px] text-white font-display font-bold text-[11px] shrink-0"
                    style={{ backgroundColor: t.brandColor }}
                  >
                    {t.logoInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="font-semibold text-ink truncate">
                        {t.name}
                      </span>
                      <span className="font-display text-[18px] leading-none tabular-nums text-ink shrink-0">
                        ${fmtK(t.aiSpendCents / 100)}
                      </span>
                    </div>
                    <div className="h-[5px] rounded-full bg-surface-2 overflow-hidden mt-1.5">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          i === 0 ? "bg-warn" : "bg-accent",
                        )}
                        style={{ width: `${Math.max(3, pct)}%` }}
                      />
                    </div>
                  </div>
                  {t.plan ? (
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] px-2 py-1 rounded-[6px] bg-surface-2 text-ink-2 shrink-0">
                      {t.plan}
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-ink-3 shrink-0">
                      —
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─────────────── Helpers ───────────────

function fmtK(dollars: number): string {
  if (dollars >= 1_000_000) return `${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `${(dollars / 1000).toFixed(1)}k`;
  return dollars.toFixed(0);
}
