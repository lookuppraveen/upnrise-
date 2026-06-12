// Super Admin · Master Settings  (02_SUPER_ADMIN.md §Master Settings)
//
// Platform-wide config: product name (branding), signup gate, default
// region, region whitelist, free-form feature flags. AI knobs live on
// /super/ai-config; per-plan caps live on /super/plans.

import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { Icon, type IconName } from "@/components/ui/Icon";
import { MasterSettingsEditor } from "@/components/super/MasterSettingsEditor";
import { cn } from "@/lib/cn";

const SINGLETON_ID = "singleton";

export default async function MasterSettingsPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") return null;

  const [settings, tenantCount] = await Promise.all([
    prisma.platformSettings.upsert({
      where: { id: SINGLETON_ID },
      update: {},
      create: { id: SINGLETON_ID },
    }),
    prisma.company.count(),
  ]);

  const flagsObj =
    (settings.featureFlags as Record<
      string,
      boolean | string | number
    >) ?? {};
  const flagCount = Object.keys(flagsObj).length;

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1280px] space-y-5">
      <Header />
      <StateStrip
        productName={settings.productName}
        signupEnabled={settings.signupEnabled}
        defaultRegion={settings.defaultRegion}
        regionsCount={settings.regions.length}
        flagCount={flagCount}
        tenantCount={tenantCount}
        updatedAt={settings.updatedAt}
      />
      {!settings.signupEnabled ? (
        <SignupClosedBanner />
      ) : null}

      <MasterSettingsEditor
        initial={{
          productName: settings.productName,
          signupEnabled: settings.signupEnabled,
          defaultRegion: settings.defaultRegion,
          regions: settings.regions,
          featureFlags: flagsObj,
          updatedAt: settings.updatedAt,
        }}
      />
    </div>
  );
}

// ─────────────── Header ───────────────

function Header() {
  return (
    <header className="space-y-2">
      <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
        Master Settings
      </h1>
      <p className="text-ink-2 text-[13.5px] max-w-[680px] leading-[1.5]">
        Branding, signup gating, regions, and feature flags — every
        platform-wide knob that isn&apos;t AI-specific. AI defaults live on{" "}
        <Link
          href="/super/ai-config"
          className="text-accent underline"
        >
          AI Configuration
        </Link>
        ; per-plan seat limits live on{" "}
        <Link href="/super/plans" className="text-accent underline">
          Plans
        </Link>
        .
      </p>
    </header>
  );
}

// ─────────────── State-at-a-glance ───────────────
//
// No invented metrics here — just a quick read of the current platform
// shape, so the super-admin doesn't have to scroll the form to know
// where things stand.

function StateStrip({
  productName,
  signupEnabled,
  defaultRegion,
  regionsCount,
  flagCount,
  tenantCount,
  updatedAt,
}: {
  productName: string;
  signupEnabled: boolean;
  defaultRegion: string;
  regionsCount: number;
  flagCount: number;
  tenantCount: number;
  updatedAt: Date;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-[14px]">
      <StateTileText
        label="Product"
        value={productName}
        sub={
          tenantCount === 0
            ? "no tenants yet"
            : `${tenantCount} tenant${tenantCount === 1 ? "" : "s"} branded`
        }
        icon="globe"
        tone="accent"
      />
      <StateTilePill
        label="Signup gate"
        value={signupEnabled ? "Open" : "Closed"}
        tone={signupEnabled ? "good" : "bad"}
        sub={
          signupEnabled
            ? "anyone with a code can join"
            : "manual-invite only"
        }
        icon="shield"
      />
      <StateTileText
        label="Default region"
        value={defaultRegion}
        sub={`${regionsCount} region${regionsCount === 1 ? "" : "s"} allowed`}
        icon="layers"
        tone="violet"
      />
      <StateTile
        label="Feature flags"
        value={String(flagCount)}
        sub={
          updatedAt
            ? `updated ${fmtRelative(updatedAt)}`
            : "never edited"
        }
        icon="settings"
        tone={flagCount > 0 ? "warn" : "good"}
      />
    </div>
  );
}

type Tone = "accent" | "good" | "warn" | "violet" | "bad";

function cornerCls(tone: Tone): string {
  return tone === "accent"
    ? "bg-accent-pale text-accent-strong"
    : tone === "good"
      ? "bg-good-pale text-good"
      : tone === "warn"
        ? "bg-warn-pale text-warn"
        : tone === "bad"
          ? "bg-bad-pale text-bad"
          : "bg-[#ede9fe] text-[#6d4ad9]";
}

function StateTile({
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
  tone: Tone;
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

// String values render at a smaller display size so longer product /
// region names don't overflow.
function StateTileText({
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
  tone: Tone;
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

// Boolean-ish values render as a state pill, since "Open" / "Closed"
// at display 32px looks shouty.
function StateTilePill({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "good" | "bad";
  icon: IconName;
}) {
  const pill =
    tone === "good"
      ? "bg-good-pale text-good"
      : "bg-bad-pale text-bad";
  return (
    <div className="relative bg-surface border border-border rounded-[12px] px-[18px] py-4 flex flex-col gap-1">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {label}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-[12.5px] font-bold uppercase tracking-[0.08em] px-2.5 py-1 rounded-[6px]",
            pill,
          )}
        >
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              tone === "good" ? "bg-good" : "bg-bad",
            )}
          />
          {value}
        </span>
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

// ─────────────── Signup-closed banner ───────────────

function SignupClosedBanner() {
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
          UPnRise AI · Heads up
        </div>
        <p className="text-[13px] text-ink leading-[1.55]">
          Self-serve signup is{" "}
          <span className="font-semibold text-bad">closed</span> — any new
          tenant has to be provisioned by hand from{" "}
          <Link
            href="/super/companies"
            className="text-accent font-semibold hover:text-accent-strong underline"
          >
            Companies
          </Link>
          . Flip it back on below when you want growth to resume.
        </p>
      </div>
    </div>
  );
}

// ─────────────── Helpers ───────────────

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
