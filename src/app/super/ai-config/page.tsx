// Super Admin · AI Configuration  (02_SUPER_ADMIN.md §AI Configuration)
//
// Platform-wide AI settings: model selection, default coach persona /
// guardrails, token caps, monthly spend cap. Plus a read-only summary of
// per-plan AI limits already defined in /super/plans.

import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { listPlansForSuper, getPlatformStats } from "@/lib/db/queries";
import { loadPlatformSettings } from "./actions";
import { Icon, type IconName } from "@/components/ui/Icon";
import { AiConfigEditor } from "@/components/super/AiConfigEditor";
import { cn } from "@/lib/cn";

export default async function AiConfigPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") return null;

  const [settings, plans, stats] = await Promise.all([
    loadPlatformSettings(),
    listPlansForSuper(),
    getPlatformStats(),
  ]);

  const spendCapDollars = settings.monthlySpendCapCents / 100;
  const spendDollars = stats.aiSpendCents / 100;
  const capUsedPct =
    spendCapDollars > 0
      ? Math.min(100, Math.round((spendDollars / spendCapDollars) * 100))
      : 0;

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1280px] space-y-5">
      <Header />
      <KpiStrip
        spendCents={stats.aiSpendCents}
        capCents={settings.monthlySpendCapCents}
        capUsedPct={capUsedPct}
        defaultModel={settings.defaultModel}
        fastModel={settings.fastModel}
        maxTokens={settings.maxTokensPerTurn}
        updatedAt={settings.updatedAt}
      />

      {settings.monthlySpendCapCents > 0 && capUsedPct >= 70 ? (
        <CapAlertBanner
          spendCents={stats.aiSpendCents}
          capCents={settings.monthlySpendCapCents}
          pct={capUsedPct}
        />
      ) : null}

      <AiConfigEditor
        initial={{
          defaultModel: settings.defaultModel,
          fastModel: settings.fastModel,
          defaultCoachPersona: settings.defaultCoachPersona,
          defaultCoachGuardrails: settings.defaultCoachGuardrails,
          maxTokensPerTurn: settings.maxTokensPerTurn,
          monthlySpendCapCents: settings.monthlySpendCapCents,
          notes: settings.notes,
          updatedAt: settings.updatedAt,
        }}
      />

      <PerPlanLimits plans={plans} />
    </div>
  );
}

// ─────────────── Header ───────────────

function Header() {
  return (
    <header className="space-y-2">
      <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
        AI Configuration
      </h1>
      <p className="text-ink-2 text-[13.5px] max-w-[680px] leading-[1.5]">
        Platform-wide knobs governing every tenant&apos;s Coach + Copilot. Per-plan
        seat-side caps live on{" "}
        <Link href="/super/plans" className="text-accent underline">
          Plans
        </Link>
        ; this page sets the defaults every plan inherits.
      </p>
    </header>
  );
}

// ─────────────── KPI strip ───────────────

function KpiStrip({
  spendCents,
  capCents,
  capUsedPct,
  defaultModel,
  fastModel,
  maxTokens,
  updatedAt,
}: {
  spendCents: number;
  capCents: number;
  capUsedPct: number;
  defaultModel: string;
  fastModel: string;
  maxTokens: number;
  updatedAt: Date | null;
}) {
  const spendValue = `$${fmtK(spendCents / 100)}`;
  const spendSub =
    capCents === 0
      ? "no monthly cap set"
      : `${capUsedPct}% of $${fmtK(capCents / 100)} cap`;
  const spendTone: KpiTone =
    capCents === 0 || capUsedPct < 70
      ? "accent"
      : capUsedPct < 90
        ? "warn"
        : "warn";
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-[14px]">
      <KpiTile
        label="AI spend MTD"
        value={spendValue}
        sub={spendSub}
        icon="ai-sparkle"
        tone={spendTone}
      />
      <KpiTileText
        label="Default model"
        value={shortModel(defaultModel)}
        sub="chat · persona · roleplay"
        icon="bot"
        tone="violet"
      />
      <KpiTileText
        label="Fast model"
        value={shortModel(fastModel)}
        sub="cheap utility calls"
        icon="rocket"
        tone="good"
      />
      <KpiTile
        label="Max tokens / turn"
        value={maxTokens.toLocaleString()}
        sub={
          updatedAt
            ? `updated ${fmtRelative(updatedAt)}`
            : "never edited"
        }
        icon="settings"
        tone="warn"
      />
    </div>
  );
}

type KpiTone = "accent" | "good" | "warn" | "violet";

function cornerCls(tone: KpiTone): string {
  return tone === "accent"
    ? "bg-accent-pale text-accent-strong"
    : tone === "good"
      ? "bg-good-pale text-good"
      : tone === "warn"
        ? "bg-warn-pale text-warn"
        : "bg-[#ede9fe] text-[#6d4ad9]";
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
  tone: KpiTone;
}) {
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
          cornerCls(tone),
        )}
      >
        <Icon name={icon} size={13} />
      </div>
    </div>
  );
}

// Model names are strings, not numbers — render at a friendlier size.
function KpiTileText({
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
  tone: KpiTone;
}) {
  return (
    <div className="relative bg-surface border border-border rounded-[12px] px-[18px] py-4 flex flex-col gap-1">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {label}
      </div>
      <div className="font-display text-[22px] leading-[1.1] -tracking-[0.005em] mt-1 truncate">
        {value}
      </div>
      <div className="text-[11.5px] text-ink-3 mt-[3px] truncate">{sub}</div>
      <div
        className={cn(
          "absolute top-[14px] right-[14px] w-[28px] h-[28px] rounded-[7px] grid place-items-center",
          cornerCls(tone),
        )}
      >
        <Icon name={icon} size={13} />
      </div>
    </div>
  );
}

// ─────────────── Spend-cap banner ───────────────

function CapAlertBanner({
  spendCents,
  capCents,
  pct,
}: {
  spendCents: number;
  capCents: number;
  pct: number;
}) {
  const critical = pct >= 90;
  const remaining = Math.max(0, capCents - spendCents) / 100;
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
          UPnRise AI · Spend watch
        </div>
        <p className="text-[13px] text-ink leading-[1.55]">
          You&apos;ve burned{" "}
          <span
            className={cn(
              "font-semibold",
              critical ? "text-bad" : "text-warn",
            )}
          >
            {pct}%
          </span>{" "}
          of this month&apos;s ${fmtK(capCents / 100)} cap — about $
          {fmtK(remaining)} left.{" "}
          {critical
            ? "Raise the cap below, swap the default model down to Sonnet/Haiku, or expect mid-month throttling."
            : "Comfortable for now, but plan an adjustment if growth keeps this pace."}
        </p>
      </div>
    </div>
  );
}

// ─────────────── Per-plan limits ───────────────

type PlanRow = Awaited<ReturnType<typeof listPlansForSuper>>[number];

function PerPlanLimits({ plans }: { plans: PlanRow[] }) {
  return (
    <section className="space-y-3">
      <div className="space-y-1 pt-1">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
          Per-plan AI limits
        </div>
        <p className="text-[12.5px] text-ink-2 leading-[1.5]">
          Read-only here. Edit on{" "}
          <Link href="/super/plans" className="text-accent underline">
            Plans
          </Link>{" "}
          — limits govern voice/video gating and AI-minute caps for tenants
          on that tier.
        </p>
      </div>
      {plans.length === 0 ? (
        <div className="bg-surface border border-border rounded-[12px] p-6 text-center">
          <p className="text-[13px] text-ink-2">No plans defined yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[14px]">
          {plans.map((p) => (
            <PlanLimitCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </section>
  );
}

function PlanLimitCard({ p }: { p: PlanRow }) {
  const integrations = p.limits.integrations ?? [];
  const extraIntegrations =
    integrations.length > 3 ? integrations.length - 3 : 0;
  return (
    <div
      className="relative bg-surface border border-border rounded-[12px] overflow-hidden"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-[5px]"
        style={{ backgroundColor: p.color }}
        aria-hidden
      />
      <div className="px-5 py-4 pl-6 space-y-3">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: p.color }}
          />
          <span className="font-display text-[18px] leading-none -tracking-[0.005em] text-ink">
            {p.name}
          </span>
          <span className="ml-auto text-[10.5px] font-mono text-ink-3">
            {p.companies} co
          </span>
        </div>
        <dl className="text-[12px] space-y-1.5">
          <LimitRow
            label="AI min / user"
            value={String(p.limits.aiMinutesPerUser ?? "—")}
          />
          <LimitRow
            label="Voice"
            value={p.limits.voice ? "Yes" : "No"}
            valueTone={p.limits.voice ? "good" : "muted"}
          />
          <LimitRow
            label="Video"
            value={p.limits.video ? "Yes" : "No"}
            valueTone={p.limits.video ? "good" : "muted"}
          />
          <LimitRow
            label="Custom personas"
            value={
              p.limits.customPersonas === -1
                ? "Unlimited"
                : String(p.limits.customPersonas ?? "—")
            }
          />
          <LimitRow
            label="Integrations"
            value={
              integrations.length === 0
                ? "—"
                : integrations.slice(0, 3).join(", ") +
                  (extraIntegrations > 0 ? ` +${extraIntegrations}` : "")
            }
          />
        </dl>
      </div>
    </div>
  );
}

function LimitRow({
  label,
  value,
  valueTone = "default",
}: {
  label: string;
  value: string;
  valueTone?: "default" | "good" | "muted";
}) {
  const cls =
    valueTone === "good"
      ? "text-good font-semibold"
      : valueTone === "muted"
        ? "text-ink-3"
        : "text-ink";
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-3">{label}</dt>
      <dd
        className={cn(
          "font-mono text-[11.5px] truncate ml-2 max-w-[60%] text-right",
          cls,
        )}
      >
        {value}
      </dd>
    </div>
  );
}

// ─────────────── Helpers ───────────────

function shortModel(model: string): string {
  return model
    .replace("claude-", "")
    .replace("-20251001", "")
    .replace("-2025", "")
    .replace("-2024", "");
}

function fmtK(dollars: number): string {
  if (dollars >= 1_000_000) return `${(dollars / 1_000_000).toFixed(2)}M`;
  if (dollars >= 1_000) return `${(dollars / 1000).toFixed(1)}k`;
  return dollars.toFixed(0);
}

function fmtRelative(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
