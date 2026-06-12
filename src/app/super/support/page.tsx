// Super Admin · Support & Audit  (02_SUPER_ADMIN.md §Support & Audit)
//
// Cross-tenant audit-log stream. The design source pairs this with a
// support-ticket queue and an SLA dashboard — neither schema exists
// today, so we don't fabricate them. Filter chips on top group the
// real audit actions into intuitive categories.

import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { listGlobalAuditLog } from "@/lib/db/queries";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

const PAGE_SIZE = 50;

type Tone = "good" | "warn" | "bad" | "ai" | "ink";

const ACTION_META: Record<
  string,
  { label: string; icon: IconName; tone: Tone; category: CategoryKey }
> = {
  "training.publish": {
    label: "Published training",
    icon: "training",
    tone: "good",
    category: "trainings",
  },
  "assignment.bulk_upsert": {
    label: "Assigned training",
    icon: "clipboard",
    tone: "ai",
    category: "trainings",
  },
  "impersonation.start": {
    label: "Started impersonation",
    icon: "shield",
    tone: "warn",
    category: "security",
  },
  "impersonation.stop": {
    label: "Stopped impersonation",
    icon: "shield",
    tone: "ink",
    category: "security",
  },
  "plan.create": {
    label: "Created plan",
    icon: "credit-card",
    tone: "good",
    category: "plans",
  },
  "plan.update": {
    label: "Updated plan",
    icon: "credit-card",
    tone: "ink",
    category: "plans",
  },
  "plan.disable": {
    label: "Disabled plan",
    icon: "credit-card",
    tone: "warn",
    category: "plans",
  },
  "plan.enable": {
    label: "Enabled plan",
    icon: "credit-card",
    tone: "good",
    category: "plans",
  },
  "credits.topup": {
    label: "Topped up credits",
    icon: "credit-card",
    tone: "good",
    category: "credits",
  },
  "platform.ai_config.update": {
    label: "Updated AI config",
    icon: "settings",
    tone: "ink",
    category: "platform",
  },
  "user.suspend": {
    label: "Suspended user",
    icon: "alert",
    tone: "bad",
    category: "users",
  },
  "user.unsuspend": {
    label: "Reinstated user",
    icon: "users",
    tone: "good",
    category: "users",
  },
};

type CategoryKey =
  | "all"
  | "security"
  | "trainings"
  | "plans"
  | "credits"
  | "users"
  | "platform";

const CATEGORIES: Array<{
  key: CategoryKey;
  label: string;
  // contains-substring matcher for the audit `action` column
  matchAction?: string;
}> = [
  { key: "all", label: "All" },
  { key: "security", label: "Security", matchAction: "impersonation" },
  { key: "trainings", label: "Trainings", matchAction: "training" },
  { key: "plans", label: "Plans", matchAction: "plan" },
  { key: "credits", label: "Credits", matchAction: "credits" },
  { key: "users", label: "User actions", matchAction: "user" },
  { key: "platform", label: "Platform", matchAction: "platform" },
];

export default async function SupportAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; q?: string; offset?: string }>;
}) {
  const sp = await searchParams;
  const cat = (CATEGORIES.find((c) => c.key === sp.cat)?.key ??
    "all") as CategoryKey;
  const q = (sp.q ?? "").trim();
  const offset = Math.max(0, Number(sp.offset ?? 0) | 0);

  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") return null;

  // What we filter the page query on — search wins if both are set.
  const catEntry = CATEGORIES.find((c) => c.key === cat);
  const actionFilter = q || catEntry?.matchAction;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const since24h = new Date(now - dayMs);
  const since7d = new Date(now - 7 * dayMs);

  const [{ entries, total }, last24hCount, securityCount, recent] =
    await Promise.all([
      listGlobalAuditLog({
        action: actionFilter,
        offset,
        limit: PAGE_SIZE,
      }),
      prisma.auditLog.count({ where: { createdAt: { gte: since24h } } }),
      prisma.auditLog.count({
        where: {
          createdAt: { gte: since7d },
          action: { contains: "impersonation", mode: "insensitive" },
        },
      }),
      prisma.auditLog.findMany({
        where: { createdAt: { gte: since7d } },
        select: { actorId: true },
        distinct: ["actorId"],
      }),
    ]);
  const activeActors = recent.length;

  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;
  const prevOffset = Math.max(0, offset - PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE;

  function pageHref(opts: { cat?: CategoryKey; offset?: number }) {
    const params = new URLSearchParams();
    const c = opts.cat ?? cat;
    if (c !== "all") params.set("cat", c);
    if (q) params.set("q", q);
    const off = opts.offset ?? 0;
    if (off > 0) params.set("offset", String(off));
    const qs = params.toString();
    return qs ? `/super/support?${qs}` : "/super/support";
  }

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1280px] space-y-5">
      <Header total={total} q={q} />
      <KpiStrip
        last24h={last24hCount}
        security={securityCount}
        actors={activeActors}
        total={total}
      />

      {securityCount > 0 ? <SecurityBanner count={securityCount} /> : null}

      <div className="flex items-center gap-3 flex-wrap">
        <SearchForm q={q} cat={cat} />
        <ChipFilters current={cat} pageHref={pageHref} />
      </div>

      {entries.length === 0 ? (
        <EmptyState q={q} cat={cat} />
      ) : (
        <AuditTable entries={entries} />
      )}

      {entries.length > 0 ? (
        <Pagination
          offset={offset}
          shown={entries.length}
          total={total}
          prevHref={hasPrev ? pageHref({ offset: prevOffset }) : null}
          nextHref={hasNext ? pageHref({ offset: nextOffset }) : null}
        />
      ) : null}
    </div>
  );
}

// ─────────────── Header ───────────────

function Header({ total, q }: { total: number; q: string }) {
  return (
    <header className="space-y-2">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
          Support &amp; Audit
        </h1>
        <span className="text-[12px] font-mono text-ink-3 mt-2">
          ({total.toLocaleString()})
        </span>
      </div>
      <p className="text-ink-2 text-[13.5px] max-w-[680px] leading-[1.5]">
        Cross-tenant audit log — every meaningful action across the
        platform. Support-ticket queue and SLA dashboards land in a later
        phase, once an integration is picked.
        {q ? (
          <>
            {" "}
            Filtered by{" "}
            <code className="font-mono text-ink">&quot;{q}&quot;</code>.
          </>
        ) : null}
      </p>
    </header>
  );
}

// ─────────────── Search ───────────────

function SearchForm({ q, cat }: { q: string; cat: CategoryKey }) {
  return (
    <form
      action="/super/support"
      className="flex-1 min-w-[260px] max-w-[420px] relative"
    >
      {cat !== "all" ? (
        <input type="hidden" name="cat" value={cat} />
      ) : null}
      <Icon
        name="search"
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none"
      />
      <input
        name="q"
        defaultValue={q}
        placeholder="Filter by action (e.g. impersonation)"
        className="w-full bg-surface-2 border border-border rounded-full pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:border-accent focus:bg-surface"
        suppressHydrationWarning
      />
    </form>
  );
}

// ─────────────── Category chips ───────────────

function ChipFilters({
  current,
  pageHref,
}: {
  current: CategoryKey;
  pageHref: (opts: { cat?: CategoryKey; offset?: number }) => string;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {CATEGORIES.map((c) => {
        const active = c.key === current;
        return (
          <Link
            key={c.key}
            href={pageHref({ cat: c.key, offset: 0 })}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-[6px] rounded-full text-[12.5px] font-semibold transition-colors",
              active
                ? "bg-ink text-white"
                : "bg-surface border border-border text-ink-2 hover:text-ink hover:border-border-strong",
            )}
          >
            {c.label}
          </Link>
        );
      })}
    </div>
  );
}

// ─────────────── KPI strip ───────────────

function KpiStrip({
  last24h,
  security,
  actors,
  total,
}: {
  last24h: number;
  security: number;
  actors: number;
  total: number;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-[14px]">
      <KpiTile
        label="Last 24h"
        value={last24h.toLocaleString()}
        sub={
          last24h === 0
            ? "no activity today"
            : last24h === 1
              ? "1 event"
              : `${last24h} events`
        }
        icon="activity"
        tone="accent"
      />
      <KpiTile
        label="Security · 7d"
        value={security.toLocaleString()}
        sub={
          security === 0
            ? "no impersonations"
            : security === 1
              ? "one impersonation event"
              : `${security} impersonation events`
        }
        icon="shield"
        tone={security > 0 ? "warn" : "good"}
      />
      <KpiTile
        label="Active actors · 7d"
        value={actors.toLocaleString()}
        sub={
          actors === 0
            ? "no operators logged in"
            : actors === 1
              ? "solo operator"
              : "operators contributing"
        }
        icon="users"
        tone="violet"
      />
      <KpiTile
        label="All entries"
        value={total.toLocaleString()}
        sub="lifetime audit-log size"
        icon="history"
        tone="good"
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

// ─────────────── Security banner ───────────────

function SecurityBanner({ count }: { count: number }) {
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
          UPnRise AI · Security pulse
        </div>
        <p className="text-[13px] text-ink leading-[1.55]">
          <span className="font-semibold text-warn">{count}</span>{" "}
          impersonation event{count === 1 ? "" : "s"} in the last 7 days.
          Use the Security chip below to audit who, when, and as which role
          — and confirm every session was closed.
        </p>
        <Link
          href="/super/support?cat=security"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:text-accent-strong"
        >
          Open security log
          <Icon name="chevron-right" size={11} />
        </Link>
      </div>
    </div>
  );
}

// ─────────────── Table ───────────────

type Entry = Awaited<
  ReturnType<typeof listGlobalAuditLog>
>["entries"][number];

function AuditTable({ entries }: { entries: Entry[] }) {
  return (
    <div className="bg-surface border border-border rounded-[12px] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-surface-2 border-b border-border">
            <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
              <th className="px-5 py-3 w-[60px]"></th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-5 py-3 whitespace-nowrap">When</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <AuditRow key={e.id} entry={e} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditRow({ entry }: { entry: Entry }) {
  const meta = ACTION_META[entry.action];
  const label = meta?.label ?? entry.action;
  const tone: Tone = meta?.tone ?? "ink";
  const icon: IconName = meta?.icon ?? "activity";

  const isImpersonation =
    entry.action === "impersonation.start" ||
    entry.action === "impersonation.stop";

  const m =
    entry.metadata && typeof entry.metadata === "object" && entry.metadata
      ? (entry.metadata as Record<string, unknown>)
      : null;
  const summary = m ? formatMeta(m) : null;

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-surface-2 align-top">
      <td className="px-5 py-3">
        <div
          className={cn(
            "w-9 h-9 grid place-items-center rounded-[8px]",
            tone === "good"
              ? "bg-good-pale text-good"
              : tone === "warn"
                ? "bg-warn-pale text-warn"
                : tone === "bad"
                  ? "bg-bad-pale text-bad"
                  : tone === "ai"
                    ? "bg-[#ede9fe] text-[#6d4ad9]"
                    : "bg-surface-2 text-ink-2",
          )}
          aria-hidden
        >
          <Icon name={icon} size={14} />
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-ink">{label}</span>
          {isImpersonation ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] px-2 py-0.5 rounded-[5px] bg-warn-pale text-warn">
              <Icon name="shield" size={9} />
              Security
            </span>
          ) : null}
        </div>
        <div className="text-[11px] text-ink-3 font-mono mt-0.5">
          {entry.action}
        </div>
        {summary ? (
          <div className="text-[11.5px] text-ink-2 mt-1 font-mono leading-[1.4]">
            {summary}
          </div>
        ) : null}
      </td>
      <td className="px-4 py-3 min-w-[170px]">
        {entry.actor ? (
          <>
            <div className="font-semibold text-ink">
              {entry.actor.name ?? entry.actor.email.split("@")[0]}
            </div>
            <div className="text-[11.5px] text-ink-3 font-mono truncate max-w-[200px]">
              {entry.actor.email}
            </div>
          </>
        ) : (
          <span className="text-ink-3">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {entry.company ? (
          <Link
            href={`/super/companies/${entry.company.id}`}
            className="inline-flex items-center gap-2 group/c"
          >
            <div
              className="w-6 h-6 grid place-items-center rounded-[5px] text-white font-display font-bold text-[10px] shrink-0"
              style={{ backgroundColor: entry.company.brandColor }}
            >
              {entry.company.logoInitials}
            </div>
            <span className="text-[12.5px] text-ink group-hover/c:underline truncate max-w-[160px]">
              {entry.company.name}
            </span>
          </Link>
        ) : (
          <span className="text-[12px] text-ink-3 italic">Platform</span>
        )}
      </td>
      <td className="px-4 py-3 font-mono text-[11.5px] text-ink-2 truncate max-w-[180px]">
        {entry.target ?? "—"}
      </td>
      <td className="px-5 py-3 whitespace-nowrap">
        <div className="font-mono text-[11.5px] text-ink">
          {fmtRelative(entry.createdAt)}
        </div>
        <div className="text-[10.5px] text-ink-3 font-mono">
          {entry.createdAt.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </td>
    </tr>
  );
}

// ─────────────── Empty ───────────────

function EmptyState({ q, cat }: { q: string; cat: CategoryKey }) {
  return (
    <div className="bg-surface border border-border rounded-[12px] p-10 text-center">
      <div className="w-12 h-12 rounded-[10px] bg-surface-2 text-ink-3 grid place-items-center mx-auto">
        <Icon name="history" size={18} />
      </div>
      <h3 className="font-display text-[18px] mt-3 text-ink">
        No entries match
      </h3>
      <p className="text-[13px] text-ink-2 mt-1 max-w-[420px] mx-auto leading-[1.55]">
        {q
          ? `Nothing matches "${q}". Clear the search or switch chip.`
          : cat === "all"
            ? "No audit entries yet. Activity from every tenant lands here as actions are taken."
            : `No "${cat}" entries yet.`}
      </p>
    </div>
  );
}

// ─────────────── Pagination ───────────────

function Pagination({
  offset,
  shown,
  total,
  prevHref,
  nextHref,
}: {
  offset: number;
  shown: number;
  total: number;
  prevHref: string | null;
  nextHref: string | null;
}) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="font-mono text-ink-3">
        Showing {offset + 1}–{Math.min(offset + shown, total)} of{" "}
        {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        <PageLink href={prevHref} dir="prev" />
        <PageLink href={nextHref} dir="next" />
      </div>
    </div>
  );
}

function PageLink({
  href,
  dir,
}: {
  href: string | null;
  dir: "prev" | "next";
}) {
  const label = dir === "prev" ? "Prev" : "Next";
  const arrow = dir === "prev" ? "←" : "→";
  const content =
    dir === "prev" ? (
      <>
        {arrow} {label}
      </>
    ) : (
      <>
        {label} {arrow}
      </>
    );
  if (!href) {
    return (
      <span className="px-3 py-1.5 rounded-md border border-border text-ink-3/50 font-semibold text-[12px] cursor-not-allowed">
        {content}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md border border-border text-ink-2 hover:text-ink hover:border-border-strong font-semibold text-[12px]"
    >
      {content}
    </Link>
  );
}

// ─────────────── Helpers ───────────────

function formatMeta(metadata: Record<string, unknown>): string | null {
  const parts: string[] = [];
  for (const k of [
    "via",
    "as_role",
    "target_email",
    "impersonating",
    "impersonating_role",
    "name",
    "learner_count",
    "created",
    "updated",
    "priority",
    "defaultModel",
    "fastModel",
    "amount",
    "reason",
    "company_name",
  ]) {
    if (metadata[k] != null && metadata[k] !== "")
      parts.push(`${k}=${String(metadata[k])}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
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
