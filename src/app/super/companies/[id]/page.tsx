// Super Admin · Company Detail  (02_SUPER_ADMIN.md §Company Detail)
//
// Pixel-perfect pass matches super-03-company-detail.png:
//   - Soft-gradient hero with 80px brand logo, big display title, inline
//     meta (industry · region · since), plan chip, health pill with score,
//     and CSM line below
//   - Anchor tabs (Overview / Health / Credits / Activity / AI Insights)
//     scroll to in-page sections — separate /users /billing sub-routes
//     don't exist yet, so anchors keep the affordance without faking new pages
//   - "AI-generated quarterly business review" — purple-soft hero with
//     contextual prose composed from real tenant data
//   - Existing KPI strip + Health/Commercial/Owner three-col + Credits
//     ledger preserved; new per-tenant Activity timeline below

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import {
  getCompanyDetailForSuper,
  getCompanyCreditsForSuper,
} from "@/lib/db/queries";
import { prisma } from "@/lib/db/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { ImpersonateModal } from "@/components/super/ImpersonateModal";
import { TopUpModal } from "@/components/super/TopUpModal";
import { cn } from "@/lib/cn";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") notFound();

  const c = await getCompanyDetailForSuper(id);
  if (!c) notFound();

  const credits = await getCompanyCreditsForSuper(id);
  const recentActivity = await prisma.auditLog.findMany({
    where: { companyId: id },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: {
      actor: { select: { email: true, name: true } },
    },
  });

  const monthlyMrr = c.mrrCents;
  const annualizedRevenue = monthlyMrr * 12;
  const renewal = c.subscription?.renewalAt;
  const sub = c.subscription;
  const plan = sub?.plan;
  const pricePerSeatCents = sub?.priceOverrideCents ?? plan?.priceCents ?? 0;
  const usedPct =
    credits.granted > 0
      ? Math.round((credits.used / credits.granted) * 100)
      : 0;
  const healthScore = computeHealthScore(c.churnRisk, c.expandScore);
  const brief = composeQbr({
    name: c.name,
    sessions: c.sessionsCount,
    avgScore: c.avgScore,
    userCount: c.userCount,
    seats: c.seats,
    trainings: c.trainingCount,
    churnRisk: c.churnRisk,
    expandScore: c.expandScore,
    growthPct: c.growthPct,
    creditsUsedPct: usedPct,
  });

  return (
    <div className="px-7 pt-5 pb-20 max-w-[1280px] space-y-5">
      <Link
        href="/super/companies"
        className="inline-flex items-center gap-1 text-[12.5px] text-ink-2 hover:text-ink"
      >
        <Icon name="chevron-right" size={14} className="rotate-180" />
        Back to companies
      </Link>

      {/* Hero — soft gradient card */}
      <div
        className="relative rounded-[14px] border p-7 flex items-start gap-6 flex-wrap"
        style={{
          background:
            "linear-gradient(135deg, #fdf6f3 0%, #fdebe4 60%, #fbe9eb 100%)",
          borderColor: "#f5cdb8",
        }}
      >
        <div
          className="w-[80px] h-[80px] grid place-items-center rounded-[14px] text-white font-display font-normal text-[36px] shrink-0"
          style={{
            backgroundColor: c.brandColor,
            boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
          }}
        >
          {c.logoInitials}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <h1 className="font-display text-[34px] leading-[1.05] -tracking-[0.015em]">
            {c.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
            {c.industry ? <span>{c.industry}</span> : null}
            {c.region ? (
              <>
                <span className="text-ink-3">·</span>
                <span>{c.region}</span>
              </>
            ) : null}
            {c.since ? (
              <>
                <span className="text-ink-3">·</span>
                <span>
                  Since{" "}
                  {c.since.toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </>
            ) : null}
            {plan ? (
              <span
                className="text-[10.5px] font-semibold uppercase tracking-[0.08em] px-[7px] py-[2px] rounded-sm text-white whitespace-nowrap"
                style={{ backgroundColor: plan.color }}
              >
                {plan.name}
              </span>
            ) : null}
            <HealthPill health={c.health} score={healthScore} />
          </div>
          {c.csm ? (
            <div className="text-[13px] text-ink-2 pt-1">
              <span className="text-ink-3">CSM:</span>{" "}
              <span className="font-semibold text-ink">{c.csm}</span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="md">
            Manage plan
          </Button>
          <TopUpModal
            companyId={c.id}
            companyName={c.name}
            trigger="primary"
            size="md"
          />
          <ImpersonateModal companyId={c.id} companyName={c.name} />
        </div>
      </div>

      {/* Anchor tabs */}
      <AnchorTabs
        items={[
          { id: "overview", label: "Overview" },
          { id: "health", label: "Health" },
          { id: "credits", label: "Credits" },
          { id: "activity", label: "Activity" },
          { id: "ai-insights", label: "AI Insights" },
        ]}
      />

      {/* KPIs */}
      <Section id="overview">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-[14px]">
          <Kpi
            label="MRR"
            value={c.mrrCents === 0 ? "—" : `$${fmtCents(monthlyMrr)}`}
            sub={c.mrrCents === 0 ? "—" : `$${fmtCents(annualizedRevenue)} ARR`}
            icon="credit-card"
            tone="accent"
          />
          <Kpi
            label="Users / Seats"
            value={`${c.userCount} / ${c.seats}`}
            sub={
              c.seats > 0
                ? `${Math.round((c.userCount / c.seats) * 100)}% utilized`
                : ""
            }
            icon="users"
            tone="violet"
          />
          <Kpi
            label="Sessions"
            value={String(c.sessionsCount)}
            sub={c.avgScore != null ? `avg ${c.avgScore}` : ""}
            icon="training"
            tone="good"
          />
          <Kpi
            label="AI spend"
            value={`$${fmtCents(c.aiSpendCents)}`}
            sub="this period"
            icon="bot"
            tone="warn"
          />
        </div>
      </Section>

      {/* AI Quarterly Business Review */}
      <Section id="ai-insights">
        <QbrBrief brief={brief} companyName={c.name} />
      </Section>

      {/* Three-column: Health / Commercial / Owner */}
      <Section id="health">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card pad="md" className="space-y-3 rounded-[12px]">
            <SectionLabel>Health</SectionLabel>
            <div className="space-y-2">
              <Meter label="Churn risk" value={c.churnRisk} tone="bad" />
              <Meter label="Expand score" value={c.expandScore} tone="good" />
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11.5px] text-ink-3">Growth</span>
                <span
                  className={cn(
                    "font-mono text-[12.5px] font-semibold",
                    (c.growthPct ?? 0) >= 0 ? "text-good" : "text-bad",
                  )}
                >
                  {c.growthPct != null
                    ? `${c.growthPct >= 0 ? "+" : ""}${c.growthPct}%`
                    : "—"}
                </span>
              </div>
            </div>
          </Card>

          <Card pad="md" className="space-y-3 rounded-[12px]">
            <SectionLabel>Commercial</SectionLabel>
            <div className="text-[12.5px] space-y-1.5">
              <Row label="Plan" value={plan?.name ?? "—"} />
              <Row label="Status" value={sub?.status ?? "—"} mono />
              <Row
                label="Seats"
                value={sub ? `${sub.seats.toLocaleString()}` : "—"}
                mono
              />
              <Row
                label="Per seat"
                value={
                  pricePerSeatCents > 0
                    ? `$${(pricePerSeatCents / 100).toFixed(0)} / ${plan?.cycle ?? "mo"}`
                    : "Custom"
                }
                mono
              />
              <Row
                label="Renewal"
                value={
                  renewal
                    ? renewal.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—"
                }
                mono
              />
            </div>
          </Card>

          <Card pad="md" className="space-y-3 rounded-[12px]">
            <SectionLabel>Owner</SectionLabel>
            <div className="text-[12.5px] space-y-1.5">
              <Row label="CSM" value={c.csm ?? "—"} mono />
              <Row
                label="Since"
                value={
                  c.since
                    ? c.since.toLocaleDateString("en-US", {
                        month: "short",
                        year: "numeric",
                      })
                    : "—"
                }
                mono
              />
              <Row label="Trainings" value={String(c.trainingCount)} mono />
            </div>
          </Card>
        </div>
      </Section>

      {/* Credits */}
      <Section id="credits">
        <Card pad="md" className="space-y-3 rounded-[12px]">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <SectionLabel>Credits</SectionLabel>
              <p className="text-[12px] text-ink-3">
                Append-only ledger. Top ups, setup grants, and AI consumption.
              </p>
            </div>
            <TopUpModal
              companyId={c.id}
              companyName={c.name}
              trigger="button"
              size="sm"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Stat label="Granted" value={credits.granted.toLocaleString()} />
            <Stat label="Used" value={credits.used.toLocaleString()} />
            <Stat
              label="Balance"
              value={credits.balance.toLocaleString()}
              tone={credits.balance <= 0 ? "bad" : "good"}
            />
          </div>

          {credits.granted > 0 ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11.5px] font-mono">
                <span className="text-ink-3">{usedPct}% used</span>
                <span className="text-ink-3">
                  {credits.used.toLocaleString()} /{" "}
                  {credits.granted.toLocaleString()}
                </span>
              </div>
              <div className="h-[6px] rounded-full bg-surface-2 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    usedPct >= 90
                      ? "bg-bad"
                      : usedPct >= 70
                        ? "bg-warn"
                        : "bg-accent",
                  )}
                  style={{
                    width: `${Math.max(2, Math.min(100, usedPct))}%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          {credits.recent.length === 0 ? (
            <p className="text-[12px] text-ink-3 font-mono">
              No ledger entries yet.
            </p>
          ) : (
            <div className="border-t border-border pt-2">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3 mb-1.5">
                Recent ledger
              </div>
              <table className="w-full text-[12.5px]">
                <tbody>
                  {credits.recent.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="py-1.5 pr-3">
                        <LedgerKindPill kind={e.kind} />
                      </td>
                      <td className="py-1.5 pr-3 text-ink-2 truncate max-w-[420px]">
                        {e.reason ?? (
                          <span className="text-ink-3 italic">—</span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "py-1.5 pr-3 font-mono text-right whitespace-nowrap",
                          e.amount >= 0 ? "text-good" : "text-ink-2",
                        )}
                      >
                        {e.amount >= 0
                          ? `+${e.amount.toLocaleString()}`
                          : e.amount.toLocaleString()}
                      </td>
                      <td className="py-1.5 text-ink-3 font-mono text-[11px] whitespace-nowrap">
                        {e.createdAt.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Section>

      {/* Activity */}
      <Section id="activity">
        <Card pad="md" className="space-y-3 rounded-[12px]">
          <SectionLabel>Recent activity</SectionLabel>
          {recentActivity.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">
              No actions logged yet for this tenant.
            </p>
          ) : (
            <ul className="space-y-2">
              {recentActivity.map((e) => (
                <li key={e.id} className="flex items-start gap-3 text-[12.5px]">
                  <div className="w-[6px] h-[6px] rounded-full bg-accent mt-[7px] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-ink">
                      <span className="font-mono text-[11.5px] text-ink-3">
                        {e.action}
                      </span>
                      {e.actor ? (
                        <span className="ml-2 text-ink-2">
                          by {e.actor.name ?? e.actor.email.split("@")[0]}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-ink-3 font-mono">
                      {e.createdAt.toLocaleString()}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>
    </div>
  );
}

// ─────────────── Anchor tabs ───────────────

function AnchorTabs({
  items,
}: {
  items: Array<{ id: string; label: string }>;
}) {
  return (
    <div
      className="flex items-center gap-1 border-b border-border overflow-x-auto sticky bg-bg z-[2]"
      style={{ top: 60 }}
    >
      {items.map((it) => (
        <a
          key={it.id}
          href={`#${it.id}`}
          className={cn(
            "inline-flex items-center gap-1.5 px-[14px] py-[10px] text-[13px] -mb-px border-b-2 whitespace-nowrap",
            "border-transparent text-ink-2 hover:text-ink",
            "first:text-ink first:font-semibold first:border-accent",
          )}
        >
          {it.label}
        </a>
      ))}
    </div>
  );
}

function Section({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ scrollMarginTop: 120 }}>
      {children}
    </section>
  );
}

// ─────────────── QBR brief ───────────────

type Qbr = { title: string; body: React.ReactNode };

function QbrBrief({
  brief,
  companyName,
}: {
  brief: Qbr;
  companyName: string;
}) {
  return (
    <div
      className="rounded-[14px] p-7 border"
      style={{
        background: "linear-gradient(135deg, #f3eafa 0%, #fce8f0 100%)",
        borderColor: "#e6d2f1",
      }}
    >
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#7c3aed]">
        <span
          className="w-[20px] h-[20px] grid place-items-center rounded-full text-white"
          style={{
            background: "linear-gradient(135deg, #7c3aed, #b94e8d)",
            boxShadow: "0 2px 6px rgba(124,58,237,0.25)",
          }}
        >
          <Icon name="ai-sparkle" size={10} />
        </span>
        AI-generated quarterly business review
      </div>
      <h2 className="font-display text-[28px] leading-[1.15] -tracking-[0.01em] text-ink mt-2">
        {brief.title}
      </h2>
      <p className="text-[13.5px] text-ink-2 mt-2 leading-[1.55] max-w-[820px]">
        {brief.body}
      </p>
      <p className="text-[11px] text-ink-3 mt-3 font-mono">
        Composed from {companyName}'s live signals. Cached Claude-authored
        prose lands in a future pass.
      </p>
    </div>
  );
}

function composeQbr(args: {
  name: string;
  sessions: number;
  avgScore: number | null;
  userCount: number;
  seats: number;
  trainings: number;
  churnRisk: number | null;
  expandScore: number | null;
  growthPct: number | null;
  creditsUsedPct: number;
}): Qbr {
  const {
    name,
    sessions,
    avgScore,
    userCount,
    seats,
    trainings,
    churnRisk,
    expandScore,
    growthPct,
    creditsUsedPct,
  } = args;

  let title = "Steady quarter — engagement on track.";
  if ((expandScore ?? 0) >= 70 && (churnRisk ?? 100) < 40)
    title = "Strong expansion signals — ready for a tier conversation.";
  else if ((churnRisk ?? 0) >= 70)
    title = "Retention focus needed this quarter.";
  else if (sessions === 0)
    title = "Onboarding momentum — first signals incoming.";
  else if ((growthPct ?? 0) >= 25)
    title = `Q-over-Q growth of ${growthPct}% — momentum building.`;

  const usageBits: React.ReactNode[] = [];
  if (sessions > 0)
    usageBits.push(
      <Bold key="s">
        {sessions.toLocaleString()} roleplay {sessions === 1 ? "session" : "sessions"}
      </Bold>,
    );
  if (userCount > 0)
    usageBits.push(
      <Bold key="u">
        {userCount.toLocaleString()} active {userCount === 1 ? "user" : "users"}
      </Bold>,
    );
  if (trainings > 0)
    usageBits.push(
      <Bold key="t">
        {trainings} {trainings === 1 ? "training" : "trainings"}
      </Bold>,
    );

  const signalBits: React.ReactNode[] = [];
  if (avgScore != null)
    signalBits.push(
      <span key="a">
        average roleplay score{" "}
        <Bold tone={avgScore >= 70 ? "good" : "bad"}>{avgScore}</Bold>
      </span>,
    );
  if (creditsUsedPct >= 70)
    signalBits.push(
      <span key="c">
        credit usage at{" "}
        <Bold tone={creditsUsedPct >= 90 ? "bad" : "warn"}>{creditsUsedPct}%</Bold>
      </span>,
    );
  if (growthPct != null && growthPct !== 0)
    signalBits.push(
      <span key="g">
        seat growth{" "}
        <Bold tone={growthPct > 0 ? "good" : "bad"}>
          {growthPct > 0 ? "+" : ""}
          {growthPct}%
        </Bold>
      </span>,
    );

  const body = (
    <>
      {name} has run {stitch(usageBits)}
      {usageBits.length > 0 ? ". " : ""}
      {signalBits.length > 0 ? (
        <>
          Signals to watch: {stitch(signalBits)}.{" "}
        </>
      ) : null}
      {(expandScore ?? 0) >= 70
        ? "Expansion score is high — consider initiating an upgrade conversation."
        : (churnRisk ?? 0) >= 70
          ? "Churn risk is elevated — schedule a CSM intervention this week."
          : "No urgent flags."}
    </>
  );

  return { title, body };
}

function Bold({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "good" | "bad" | "warn";
}) {
  return (
    <span
      className={cn(
        "font-semibold",
        tone === "good"
          ? "text-good"
          : tone === "bad"
            ? "text-bad"
            : tone === "warn"
              ? "text-warn"
              : "text-ink",
      )}
    >
      {children}
    </span>
  );
}

function stitch(parts: React.ReactNode[]): React.ReactNode {
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  const out: React.ReactNode[] = [];
  parts.forEach((p, i) => {
    if (i === 0) out.push(p);
    else if (i === parts.length - 1) out.push(" and ", p);
    else out.push(", ", p);
  });
  return <>{out}</>;
}

function computeHealthScore(
  churnRisk: number | null,
  expandScore: number | null,
): number {
  const base = churnRisk != null ? 100 - churnRisk : 60;
  const lift = expandScore != null ? Math.round((expandScore - 50) / 8) : 0;
  return Math.max(0, Math.min(100, base + lift));
}

// ─────────────── primitives ───────────────

function Kpi({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
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

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="bg-surface-2 border border-border rounded-md px-3 py-2.5">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
        {label}
      </div>
      <div
        className={cn(
          "font-display text-[22px] leading-tight",
          tone === "bad"
            ? "text-bad"
            : tone === "good"
              ? "text-ink"
              : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function LedgerKindPill({
  kind,
}: {
  kind: "setup" | "topup" | "ai_consumption" | "adjustment";
}) {
  const map = {
    setup: { label: "Setup", cls: "bg-surface-2 text-ink-2 border-border" },
    topup: {
      label: "Top up",
      cls: "bg-good-pale text-good border-good/20",
    },
    ai_consumption: {
      label: "AI use",
      cls: "bg-ai-grad-soft text-accent-strong border-accent-pale",
    },
    adjustment: {
      label: "Adjust",
      cls: "bg-warn-pale text-warn border-warn/20",
    },
  } as const;
  const m = map[kind];
  return (
    <span
      className={cn(
        "text-[10px] font-semibold uppercase tracking-[0.08em] px-[6px] py-[1px] rounded-sm border whitespace-nowrap",
        m.cls,
      )}
    >
      {m.label}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
      {children}
    </div>
  );
}

function HealthPill({
  health,
  score,
}: {
  health: "healthy" | "watch" | "at_risk";
  score: number;
}) {
  const map = {
    healthy: { label: "Healthy", cls: "bg-good-pale text-good", dot: "bg-good" },
    watch: { label: "Watch", cls: "bg-warn-pale text-warn", dot: "bg-warn" },
    at_risk: { label: "At risk", cls: "bg-bad-pale text-bad", dot: "bg-bad" },
  } as const;
  const m = map[health];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[6px] rounded-full px-[10px] py-[3px] text-[11.5px] font-semibold whitespace-nowrap",
        m.cls,
      )}
    >
      <span className={cn("w-[7px] h-[7px] rounded-full", m.dot)} />
      <span className="font-mono">{score}</span>
      <span className="text-ink-3 mx-[1px]">·</span>
      <span>{m.label}</span>
    </span>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-3 text-[11.5px]">{label}</span>
      <span
        className={cn(
          "text-ink truncate text-right",
          mono ? "font-mono text-[12px]" : "",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Meter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: "good" | "bad";
}) {
  const v = value ?? 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[11.5px]">
        <span className="text-ink-3">{label}</span>
        <span
          className={cn(
            "font-mono text-[12.5px] font-semibold",
            value == null
              ? "text-ink-3"
              : tone === "good"
                ? v >= 60
                  ? "text-good"
                  : "text-ink-2"
                : v >= 60
                  ? "text-bad"
                  : "text-ink-2",
          )}
        >
          {value != null ? `${value}%` : "—"}
        </span>
      </div>
      <div className="mt-1 h-[5px] rounded-full bg-surface-2 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full",
            tone === "good" ? "bg-good" : "bg-bad",
          )}
          style={{ width: `${Math.max(2, Math.min(100, v))}%` }}
        />
      </div>
    </div>
  );
}

function fmtCents(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `${(dollars / 1_000_000).toFixed(2)}M`;
  if (dollars >= 1_000) return `${(dollars / 1000).toFixed(1)}k`;
  return dollars.toFixed(0);
}
