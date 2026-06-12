// Super Admin · Credits & Billing  (02_SUPER_ADMIN.md §Credits & Billing)
//
// Per-tenant credit usage + billing surface. Credit totals come from the
// credit_ledger table (positive entries = granted, negative = used). Top
// up writes a positive ledger row + audit entry attributed to the operator.

import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { listBillingForSuper } from "@/lib/db/queries";
import { Icon, type IconName } from "@/components/ui/Icon";
import { TopUpModal } from "@/components/super/TopUpModal";
import { cn } from "@/lib/cn";

type Row = Awaited<ReturnType<typeof listBillingForSuper>>[number];

export default async function CreditsPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") return null;

  const rows = await listBillingForSuper();

  // Aggregates
  const totalMrrCents = rows.reduce((acc, r) => acc + r.mrrCents, 0);
  const totalAiCents = rows.reduce((acc, r) => acc + r.aiSpendCents, 0);
  const granted = rows.reduce((acc, r) => acc + r.creditsTotal, 0);
  const used = rows.reduce((acc, r) => acc + r.creditsUsed, 0);
  const utilizationPct =
    granted > 0 ? Math.round((used / granted) * 100) : 0;

  const pastDue = rows.filter((r) => r.subscriptionStatus === "past_due");
  const creditCritical = rows.filter(
    (r) =>
      r.creditsTotal > 0 && r.creditsUsed / r.creditsTotal >= 0.9,
  );
  const alerts = [...pastDue, ...creditCritical.filter((c) => !pastDue.find((p) => p.id === c.id))];

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1280px] space-y-5">
      <Header total={rows.length} />
      <KpiStrip
        mrrCents={totalMrrCents}
        aiCents={totalAiCents}
        utilizationPct={utilizationPct}
        granted={granted}
        used={used}
        pastDue={pastDue.length}
      />

      {alerts.length > 0 ? (
        <AttentionBanner
          alerts={alerts}
          pastDue={pastDue.length}
          critical={creditCritical.length}
        />
      ) : null}

      <SectionHead
        title="Tenants"
        sub="Click any company to drill in. Top up writes a positive ledger row."
      />
      <BillingTable rows={rows} />
    </div>
  );
}

// ─────────────── Header ───────────────

function Header({ total }: { total: number }) {
  return (
    <header className="space-y-2">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
          Credits &amp; Billing
        </h1>
        <span className="text-[12px] font-mono text-ink-3 mt-2">
          ({total} tenant{total === 1 ? "" : "s"})
        </span>
      </div>
      <p className="text-ink-2 text-[13.5px] max-w-[680px] leading-[1.5]">
        Plan, subscription, and AI-credit utilization for every tenant. MRR
        is plan price × seats; AI spend rolls up the metered cost we charge
        ourselves for completions.
      </p>
    </header>
  );
}

// ─────────────── KPI strip ───────────────

function KpiStrip({
  mrrCents,
  aiCents,
  utilizationPct,
  granted,
  used,
  pastDue,
}: {
  mrrCents: number;
  aiCents: number;
  utilizationPct: number;
  granted: number;
  used: number;
  pastDue: number;
}) {
  const marginPct =
    mrrCents > 0
      ? Math.round(((mrrCents - aiCents) / mrrCents) * 100)
      : null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-[14px]">
      <KpiTile
        label="MRR"
        value={mrrCents > 0 ? `$${fmtK(mrrCents / 100)}` : "—"}
        sub={
          mrrCents === 0
            ? "no paying tenants yet"
            : "monthly recurring · all tenants"
        }
        icon="credit-card"
        tone="accent"
      />
      <KpiTile
        label="AI spend"
        value={aiCents > 0 ? `$${fmtK(aiCents / 100)}` : "$0"}
        sub={
          marginPct == null
            ? "no MRR to compare"
            : `${marginPct}% gross margin`
        }
        icon="ai-sparkle"
        tone="violet"
      />
      <KpiTile
        label="Credit utilization"
        value={granted > 0 ? `${utilizationPct}%` : "—"}
        sub={
          granted === 0
            ? "no credits granted yet"
            : `${used.toLocaleString()} / ${granted.toLocaleString()} used`
        }
        icon="chart"
        tone={
          granted === 0 || utilizationPct < 70
            ? "good"
            : utilizationPct < 90
              ? "warn"
              : "warn"
        }
      />
      <KpiTile
        label="Past due"
        value={String(pastDue)}
        sub={
          pastDue === 0
            ? "no payment failures"
            : pastDue === 1
              ? "one tenant flagged"
              : `${pastDue} tenants flagged`
        }
        icon="alert"
        tone={pastDue > 0 ? "warn" : "good"}
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

// ─────────────── Attention banner ───────────────

function AttentionBanner({
  alerts,
  pastDue,
  critical,
}: {
  alerts: Row[];
  pastDue: number;
  critical: number;
}) {
  const parts: string[] = [];
  if (pastDue > 0)
    parts.push(`${pastDue} past due`);
  if (critical > 0)
    parts.push(`${critical} above 90% credits`);

  return (
    <div
      className="rounded-[12px] border px-5 py-4 space-y-3"
      style={{
        background: "linear-gradient(135deg, #f3eafa, #fce8f0)",
        borderColor: "#e6d2f1",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-[32px] h-[32px] rounded-[8px] grid place-items-center text-white shrink-0"
          style={{ background: "linear-gradient(135deg, #a855f7, #ec4899)" }}
        >
          <Icon name="ai-sparkle" size={14} />
        </div>
        <div className="min-w-0 space-y-1 flex-1">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#6d4ad9]">
            UPnRise AI · Billing watch
          </div>
          <p className="text-[13px] text-ink leading-[1.55]">
            <span className="font-semibold">
              {alerts.length} tenant{alerts.length === 1 ? "" : "s"}
            </span>{" "}
            need a look — {parts.join(" · ")}. Past-due will auto-suspend
            on the next billing cycle; high-credit tenants should be a
            top-up or upgrade conversation.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {alerts.map((a) => {
          const pct =
            a.creditsTotal > 0
              ? Math.round((a.creditsUsed / a.creditsTotal) * 100)
              : 0;
          const isPastDue = a.subscriptionStatus === "past_due";
          return (
            <Link
              key={a.id}
              href={`/super/companies/${a.id}`}
              className={cn(
                "inline-flex items-center gap-2 bg-surface border rounded-full px-3 py-1.5 text-[12px] hover:border-border-strong transition-colors",
                isPastDue ? "border-bad/40" : "border-warn/40",
              )}
            >
              <div
                className="w-5 h-5 grid place-items-center rounded text-white font-display font-bold text-[9.5px]"
                style={{ backgroundColor: a.brandColor }}
              >
                {a.logoInitials}
              </div>
              <span className="text-ink font-semibold">{a.name}</span>
              <span
                className={cn(
                  "text-[10.5px] font-bold font-mono uppercase",
                  isPastDue ? "text-bad" : "text-warn",
                )}
              >
                {isPastDue ? "Past due" : `${pct}% credits`}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────── Section head ───────────────

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="space-y-1 pt-1">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
        {title}
      </div>
      <p className="text-[12.5px] text-ink-2 leading-[1.5]">{sub}</p>
    </div>
  );
}

// ─────────────── Table ───────────────

function BillingTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-[12px] p-10 text-center">
        <p className="text-[13px] text-ink-2">
          No tenants on the platform yet.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-surface border border-border rounded-[12px] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-surface-2 border-b border-border">
            <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
              <th className="px-5 py-3">Company</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 w-[240px]">Credits</th>
              <th className="px-4 py-3 text-right">AI spend</th>
              <th className="px-4 py-3 text-right">MRR</th>
              <th className="px-4 py-3">Renewal</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <BillingRow key={r.id} r={r} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BillingRow({ r }: { r: Row }) {
  const pct =
    r.creditsTotal > 0
      ? Math.round((r.creditsUsed / r.creditsTotal) * 100)
      : 0;
  const critical =
    r.subscriptionStatus === "past_due" ||
    (r.creditsTotal > 0 && pct >= 90);
  return (
    <tr
      className={cn(
        "border-b border-border last:border-b-0 hover:bg-surface-2 align-middle",
        critical && "bg-bad-pale/40",
      )}
    >
      <td className="px-5 py-3">
        <Link
          href={`/super/companies/${r.id}`}
          className="flex items-center gap-3 group/c"
        >
          <div
            className="w-8 h-8 grid place-items-center rounded-[6px] text-white font-display font-bold text-[11px] shrink-0"
            style={{ backgroundColor: r.brandColor }}
          >
            {r.logoInitials}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-ink truncate group-hover/c:underline">
              {r.name}
            </div>
            <div className="text-[11px] text-ink-3 font-mono">
              {r.users} users / {r.seats} seats
            </div>
          </div>
        </Link>
      </td>
      <td className="px-4 py-3">
        {r.planName ? (
          <span
            className="text-[10.5px] font-bold uppercase tracking-[0.08em] px-2 py-1 rounded-[6px] text-white whitespace-nowrap"
            style={{ backgroundColor: r.planColor ?? "#1a1a1a" }}
          >
            {r.planName}
          </span>
        ) : (
          <span className="text-ink-3 text-[12px]">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {r.subscriptionStatus ? (
          <SubStatusPill status={r.subscriptionStatus} />
        ) : (
          <span className="text-ink-3 text-[12px]">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {r.creditsTotal > 0 ? (
          <CreditsBar
            used={r.creditsUsed}
            total={r.creditsTotal}
            pct={pct}
          />
        ) : (
          <span className="text-ink-3 text-[12px] font-mono">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <span className="font-mono text-ink-2 text-[12.5px]">
          ${fmtK(r.aiSpendCents / 100)}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        {r.mrrCents > 0 ? (
          <span className="font-display text-[18px] leading-none tabular-nums text-ink">
            ${fmtK(r.mrrCents / 100)}
          </span>
        ) : (
          <span className="text-ink-3 text-[12px]">—</span>
        )}
      </td>
      <td className="px-4 py-3 font-mono text-[11.5px] text-ink-2 whitespace-nowrap">
        {r.renewalAt
          ? new Date(r.renewalAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "—"}
      </td>
      <td className="px-5 py-3 text-right">
        <TopUpModal
          companyId={r.id}
          companyName={r.name}
          size="sm"
        />
      </td>
    </tr>
  );
}

function CreditsBar({
  used,
  total,
  pct,
}: {
  used: number;
  total: number;
  pct: number;
}) {
  const tone =
    pct >= 90 ? "bg-bad" : pct >= 70 ? "bg-warn" : "bg-accent";
  const pctTone =
    pct >= 90
      ? "text-bad"
      : pct >= 70
        ? "text-warn"
        : "text-ink-3";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[11.5px] font-mono">
        <span className="text-ink">{used.toLocaleString()}</span>
        <span className="text-ink-3">/</span>
        <span className="text-ink-3">{total.toLocaleString()}</span>
        <span className={cn("ml-auto font-bold", pctTone)}>{pct}%</span>
      </div>
      <div className="h-[6px] rounded-full bg-surface-2 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", tone)}
          style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}

function SubStatusPill({
  status,
}: {
  status: "trialing" | "active" | "past_due" | "cancelled";
}) {
  const cfg = {
    trialing: { label: "Trial", dot: "bg-ink-3", cls: "text-ink-2" },
    active: { label: "Active", dot: "bg-good", cls: "text-good" },
    past_due: { label: "Past due", dot: "bg-bad", cls: "text-bad" },
    cancelled: { label: "Cancelled", dot: "bg-ink-3", cls: "text-ink-3" },
  } as const;
  const c = cfg[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] whitespace-nowrap",
        c.cls,
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", c.dot)} />
      {c.label}
    </span>
  );
}

// ─────────────── Helpers ───────────────

function fmtK(dollars: number): string {
  if (dollars >= 1_000_000) return `${(dollars / 1_000_000).toFixed(2)}M`;
  if (dollars >= 1_000) return `${(dollars / 1000).toFixed(1)}k`;
  return dollars.toFixed(0);
}
