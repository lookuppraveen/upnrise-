// Super Admin · Platform Overview  (02_SUPER_ADMIN.md §Platform Overview)
//
// Pixel-perfect pass matches the prototype screenshot:
//   - Accent-orange display title + date-aware status subtitle
//   - KPI tiles with corner labels + display values (sparklines omitted —
//     we don't track per-day rollups yet)
//   - "AI Alerts" section: rich alert cards driven by real signals
//     (churn risk ≥ 70, credit usage ≥ 85%)
//   - At-risk accounts + recent activity in the two-column footer

import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import {
  getAtRiskCompaniesForSuper,
  getPlatformStats,
  getRecentPlatformActivity,
  listBillingForSuper,
} from "@/lib/db/queries";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

const CHURN_ALERT_THRESHOLD = 70;
const CREDIT_ALERT_THRESHOLD = 85;
const MAX_ALERT_CARDS = 4;

export default async function SuperOverview() {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") return null;

  const [stats, atRisk, activity, billing] = await Promise.all([
    getPlatformStats(),
    getAtRiskCompaniesForSuper(),
    getRecentPlatformActivity(10),
    listBillingForSuper(),
  ]);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const alerts = buildAlerts(atRisk, billing);

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1280px] space-y-6">
      {/* Header */}
      <header>
        <h1 className="font-display text-[36px] leading-[1.05] -tracking-[0.015em] text-accent">
          Platform Overview
        </h1>
        <p className="text-ink-2 text-[13.5px] mt-2">
          {today} · {stats.companies}{" "}
          {stats.companies === 1 ? "company" : "companies"} ·{" "}
          <SystemStatus />
        </p>
      </header>

      {/* KPI row — .akpi pattern (corner icon + display value) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-[14px]">
        <Kpi
          label="MRR"
          value={`$${fmtK(stats.mrrCents / 100)}`}
          sub={`$${fmtK(stats.arrCents / 100)} ARR`}
          tone="accent"
          icon="credit-card"
        />
        <Kpi
          label="Companies"
          value={String(stats.companies)}
          tone="good"
          icon="layers"
        />
        <Kpi
          label="Users"
          value={stats.users.toLocaleString()}
          tone="violet"
          icon="users"
        />
        <Kpi
          label="Sessions"
          value={stats.sessions.toLocaleString()}
          tone="warn"
          icon="training"
        />
        <Kpi
          label="AI spend"
          value={`$${fmtK(stats.aiSpendCents / 100)}`}
          sub="this period"
          tone="accent"
          icon="bot"
        />
        <Kpi
          label="Plans"
          value={String(stats.activePlans)}
          sub="active"
          tone="good"
          icon="credit-card"
        />
      </div>

      {/* AI Alerts */}
      <section className="space-y-3">
        <div className="flex items-baseline gap-2">
          <h2 className="font-display text-[22px] leading-none -tracking-[0.01em]">
            AI Alerts
          </h2>
          <span className="text-[12px] text-ink-3 font-mono">
            · auto-derived from latest signals
          </span>
        </div>
        {alerts.length === 0 ? (
          <Card pad="md" className="text-[13px] text-ink-2">
            No high-priority alerts right now. All tenants are within healthy
            thresholds.
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alerts.map((a) => (
              <AlertCard key={a.id} a={a} />
            ))}
          </div>
        )}
      </section>

      {/* Footer two-column */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card pad="md" className="lg:col-span-2 space-y-3 rounded-[12px]">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
              At-risk accounts
            </div>
            <Link
              href="/super/companies"
              className="text-[12px] text-ink-2 hover:text-ink"
            >
              See all →
            </Link>
          </div>
          {atRisk.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">No risk signals yet.</p>
          ) : (
            <div className="space-y-1.5">
              {atRisk.map((c) => (
                <Link
                  key={c.id}
                  href={`/super/companies/${c.id}`}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-surface-2"
                >
                  <div
                    className="w-9 h-9 grid place-items-center rounded-full text-white font-display font-normal text-[12px] shrink-0"
                    style={{ backgroundColor: c.brandColor }}
                  >
                    {c.logoInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[13px] truncate">
                      {c.name}
                    </div>
                    <div className="text-[11px] text-ink-3 font-mono truncate">
                      {c.plan ?? "—"} · {c.csm ?? "no CSM"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={cn(
                        "font-mono font-semibold text-[13px]",
                        (c.churnRisk ?? 0) >= 70 ? "text-bad" : "text-warn",
                      )}
                    >
                      {c.churnRisk}%
                    </div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                      churn
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-[13px] text-ink">
                      ${fmtK(c.mrrCents / 100)}
                    </div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                      MRR
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card pad="md" className="space-y-3 rounded-[12px]">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
            Recent platform activity
          </div>
          {activity.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">
              Nothing yet. Actions across all tenants will appear here.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {activity.map((e) => (
                <li key={e.id} className="text-[12px] flex items-start gap-2">
                  {e.company ? (
                    <div
                      className="w-5 h-5 grid place-items-center rounded text-white text-[9px] font-display shrink-0 mt-0.5"
                      style={{ backgroundColor: e.company.brandColor }}
                    >
                      {e.company.logoInitials}
                    </div>
                  ) : (
                    <div className="w-5 h-5 grid place-items-center rounded bg-surface-2 text-ink-3 text-[10px] shrink-0 mt-0.5">
                      ★
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-ink truncate">
                      <span className="font-mono text-ink-3 text-[11px]">
                        {e.action}
                      </span>
                      {e.actor ? (
                        <span className="ml-1">
                          · {e.actor.email.split("@")[0]}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-ink-3 font-mono truncate">
                      {fmtAgo(e.createdAt)}
                      {e.company ? ` · ${e.company.name}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─────────────── KPI tile ───────────────
// .akpi pattern from admin.css: 12px radius, corner icon chip top-right,
// label / display value / optional sub.

function Kpi({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "accent" | "good" | "warn" | "violet";
  icon: IconName;
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
      <div className="font-display text-[28px] leading-[1.05] -tracking-[0.01em] mt-1">
        {value}
      </div>
      {sub ? (
        <div className="text-[10.5px] text-ink-3 font-mono">{sub}</div>
      ) : null}
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

// ─────────────── System status ───────────────

function SystemStatus() {
  // Placeholder — wire to a real status check when we add a healthcheck rollup.
  return (
    <span className="inline-flex items-center gap-[6px]">
      <span className="w-[7px] h-[7px] rounded-full bg-good" />
      <span className="text-good font-semibold">all systems operational</span>
    </span>
  );
}

// ─────────────── AI Alert card ───────────────

type AlertItem = {
  id: string;
  severity: "critical" | "warn";
  kind: "churn" | "credits";
  title: string;
  body: string;
  companyId: string;
  cta: string;
};

function buildAlerts(
  atRisk: Awaited<ReturnType<typeof getAtRiskCompaniesForSuper>>,
  billing: Awaited<ReturnType<typeof listBillingForSuper>>,
): AlertItem[] {
  const out: AlertItem[] = [];

  for (const c of atRisk) {
    if ((c.churnRisk ?? 0) < CHURN_ALERT_THRESHOLD) continue;
    out.push({
      id: `churn:${c.id}`,
      kind: "churn",
      severity: "critical",
      title: `${c.name} — ${c.churnRisk}% churn risk`,
      body: `On ${c.plan ?? "no plan"} at ${c.csm ? `${c.csm}` : "no assigned CSM"}. Recommend an intervention call this week.`,
      companyId: c.id,
      cta: "Open tenant",
    });
  }

  for (const b of billing) {
    if (b.creditsTotal <= 0) continue;
    const pct = Math.round((b.creditsUsed / b.creditsTotal) * 100);
    if (pct < CREDIT_ALERT_THRESHOLD) continue;
    out.push({
      id: `credits:${b.id}`,
      kind: "credits",
      severity: pct >= 95 ? "critical" : "warn",
      title: `${b.name} — ${pct}% credits used`,
      body: `${b.creditsUsed.toLocaleString()} of ${b.creditsTotal.toLocaleString()} credits consumed. Top up or upgrade the plan before exhaustion.`,
      companyId: b.id,
      cta: "Review credits",
    });
  }

  // Critical first, then warn; cap to keep the section compact.
  return out
    .sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1,
    )
    .slice(0, MAX_ALERT_CARDS);
}

function AlertCard({ a }: { a: AlertItem }) {
  const palette =
    a.severity === "critical"
      ? {
          bg: "bg-bad-pale",
          border: "border-bad/30",
          icon: "bg-bad/15 text-bad",
        }
      : {
          bg: "bg-warn-pale",
          border: "border-warn/30",
          icon: "bg-warn/15 text-warn",
        };
  const glyph: IconName = a.kind === "churn" ? "alert" : "credit-card";
  return (
    <div
      className={cn(
        "rounded-[12px] p-[14px] border flex items-start gap-3 relative",
        palette.bg,
        palette.border,
      )}
    >
      <div
        className={cn(
          "w-9 h-9 grid place-items-center rounded-full shrink-0",
          palette.icon,
        )}
      >
        <Icon name={glyph} size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[13.5px] text-ink leading-snug">
          {a.title}
        </div>
        <p className="text-[12px] text-ink-2 mt-1 leading-[1.5]">{a.body}</p>
        <div className="mt-2 flex items-center gap-2">
          <Link
            href={
              a.kind === "credits"
                ? `/super/companies/${a.companyId}`
                : `/super/companies/${a.companyId}`
            }
            className={cn(
              "inline-flex items-center gap-1 text-[12px] font-semibold px-[10px] py-[5px] rounded-[7px]",
              "bg-ink text-white hover:bg-[#2a2a2a]",
            )}
          >
            {a.cta}
            <Icon name="chevron-right" size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function fmtK(dollars: number): string {
  if (dollars >= 1_000_000) return `${(dollars / 1_000_000).toFixed(2)}M`;
  if (dollars >= 1_000) return `${(dollars / 1000).toFixed(1)}k`;
  return dollars.toFixed(0);
}

function fmtAgo(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
