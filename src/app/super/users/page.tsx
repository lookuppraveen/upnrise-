// Super Admin · Users (global)  (02_SUPER_ADMIN.md §Users)
//
// Every user across every tenant. Tab + search + paginated. The AI-flagged
// tab surfaces users where Copilot has set aiFlagged=true (with an
// optional aiFlagReason). Bulk re-engage actions from the design source
// still aren't wired — no bulk write-paths yet. Status toggle
// (suspend/reinstate) is real and lives in the row.

import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { listAllUsersForSuper } from "@/lib/db/queries";
import { Icon, type IconName } from "@/components/ui/Icon";
import { UserStatusToggle } from "@/components/super/UserStatusToggle";
import { cn } from "@/lib/cn";

type Tab = "all" | "super_admin" | "admin" | "trainee" | "ai_flagged";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "all", label: "All" },
  { key: "super_admin", label: "Super admin" },
  { key: "admin", label: "Admin" },
  { key: "trainee", label: "Trainee" },
  { key: "ai_flagged", label: "AI-flagged" },
];

const PAGE_SIZE = 50;

const BRAND_PALETTE = [
  "#dc7a7c", // rose
  "#7c5cd6", // violet
  "#2a7d4f", // green
  "#2563eb", // blue
  "#c5392f", // red
  "#0891b2", // cyan
];

function paletteFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return BRAND_PALETTE[Math.abs(h) % BRAND_PALETTE.length];
}

function initialsOf(name: string | null, email: string): string {
  const src = (name ?? email.split("@")[0]).trim();
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; offset?: string }>;
}) {
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "all") as Tab;
  const q = (sp.q ?? "").trim();
  const offset = Math.max(0, Number(sp.offset ?? 0) | 0);

  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") return null;

  const { users, total, counts } = await listAllUsersForSuper({
    tab,
    q,
    offset,
    limit: PAGE_SIZE,
  });

  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;
  const prevOffset = Math.max(0, offset - PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE;

  function pageHref(opts: { tab?: Tab; offset?: number }) {
    const params = new URLSearchParams();
    const t = opts.tab ?? tab;
    if (t !== "all") params.set("tab", t);
    if (q) params.set("q", q);
    const off = opts.offset ?? 0;
    if (off > 0) params.set("offset", String(off));
    const qs = params.toString();
    return qs ? `/super/users?${qs}` : "/super/users";
  }

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1280px] space-y-5">
      <Header totalAll={counts.all} q={q} />
      <KpiStrip counts={counts} />

      {/* Search + pill tabs */}
      <div className="flex items-center gap-3 flex-wrap">
        <SearchForm q={q} tab={tab} />
        <PillTabs current={tab} counts={counts} pageHref={pageHref} />
      </div>

      {users.length === 0 ? (
        <EmptyState q={q} tab={tab} />
      ) : (
        <UsersTable users={users} />
      )}

      {users.length > 0 ? (
        <Pagination
          offset={offset}
          shown={users.length}
          total={total}
          prevHref={hasPrev ? pageHref({ offset: prevOffset }) : null}
          nextHref={hasNext ? pageHref({ offset: nextOffset }) : null}
        />
      ) : null}
    </div>
  );
}

// ─────────────── Header ───────────────

function Header({ totalAll, q }: { totalAll: number; q: string }) {
  return (
    <header className="space-y-2">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
          Users
        </h1>
        <span className="text-[12px] font-mono text-ink-3 mt-2">
          ({totalAll.toLocaleString()})
        </span>
      </div>
      <p className="text-ink-2 text-[13.5px] max-w-[680px] leading-[1.5]">
        Every user across every tenant. Use the search and tabs to narrow,
        then suspend or reinstate from the row. Role changes and invites
        land in a later phase.
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

function SearchForm({ q, tab }: { q: string; tab: Tab }) {
  return (
    <form
      action="/super/users"
      className="flex-1 min-w-[260px] max-w-[420px] relative"
    >
      {tab !== "all" ? (
        <input type="hidden" name="tab" value={tab} />
      ) : null}
      <Icon
        name="search"
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none"
      />
      <input
        name="q"
        defaultValue={q}
        placeholder="Search email, name, or company"
        className="w-full bg-surface-2 border border-border rounded-full pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:border-accent focus:bg-surface"
        suppressHydrationWarning
      />
    </form>
  );
}

// ─────────────── Pill tabs ───────────────

function PillTabs({
  current,
  counts,
  pageHref,
}: {
  current: Tab;
  counts: Record<Tab, number>;
  pageHref: (opts: { tab?: Tab; offset?: number }) => string;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {TABS.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={pageHref({ tab: t.key, offset: 0 })}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-[6px] rounded-full text-[12.5px] font-semibold transition-colors",
              active
                ? "bg-ink text-white"
                : "bg-surface border border-border text-ink-2 hover:text-ink hover:border-border-strong",
            )}
          >
            {t.label}
            <span
              className={cn(
                "text-[10.5px] font-mono px-1.5 py-[1px] rounded-full",
                active
                  ? "bg-white/15 text-white/80"
                  : "bg-surface-2 text-ink-3",
              )}
            >
              {counts[t.key]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

// ─────────────── KPI strip ───────────────

function KpiStrip({
  counts,
}: {
  counts: Record<Tab, number>;
}) {
  const tenantTotal = counts.admin + counts.trainee;
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-[14px]">
      <KpiTile
        label="All users"
        value={counts.all.toLocaleString()}
        sub={`across ${tenantTotal.toLocaleString()} tenant seats`}
        icon="users"
        tone="accent"
      />
      <KpiTile
        label="Tenant admins"
        value={counts.admin.toLocaleString()}
        sub={
          counts.admin === 0
            ? "no admins yet"
            : counts.admin === 1
              ? "one admin"
              : "configuring their orgs"
        }
        icon="shield"
        tone="good"
      />
      <KpiTile
        label="Trainees"
        value={counts.trainee.toLocaleString()}
        sub={
          counts.trainee === 0
            ? "no learners yet"
            : counts.admin > 0
              ? `${Math.round(counts.trainee / Math.max(counts.admin, 1))} per admin avg`
              : "no admins"
        }
        icon="training"
        tone="violet"
      />
      <KpiTile
        label="Super admins"
        value={counts.super_admin.toLocaleString()}
        sub="platform-side operators"
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

// ─────────────── Table ───────────────

type Row = Awaited<
  ReturnType<typeof listAllUsersForSuper>
>["users"][number];

function UsersTable({ users }: { users: Row[] }) {
  return (
    <div className="bg-surface border border-border rounded-[12px] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-surface-2 border-b border-border">
            <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
              <th className="px-5 py-3">User</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Sessions</th>
              <th className="px-4 py-3 text-right">Assignments</th>
              <th className="px-4 py-3">Last active</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow key={u.id} u={u} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserRow({ u }: { u: Row }) {
  const name = u.name ?? u.email.split("@")[0];
  const avatarColor = paletteFor(u.email);
  const initials = initialsOf(u.name, u.email);
  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-surface-2 align-middle">
      <td className="px-5 py-3">
        <div className="flex items-center gap-3 min-w-[220px]">
          <div
            className="w-8 h-8 rounded-full grid place-items-center text-white text-[11px] font-bold shrink-0"
            style={{ backgroundColor: avatarColor }}
            aria-hidden
          >
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-ink truncate">{name}</span>
              {u.aiFlagged ? (
                <span
                  className="inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-[5px] text-[#6d4ad9] shrink-0"
                  style={{ background: "#ede9fe" }}
                  title={u.aiFlagReason ?? "AI-flagged"}
                >
                  <Icon name="ai-sparkle" size={9} />
                  Flagged
                </span>
              ) : null}
            </div>
            <div className="text-[11.5px] text-ink-3 font-mono truncate max-w-[260px]">
              {u.email}
            </div>
            {u.aiFlagged && u.aiFlagReason ? (
              <div className="text-[11px] text-ink-3 mt-0.5 truncate max-w-[300px]">
                {u.aiFlagReason}
              </div>
            ) : null}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        {u.company ? (
          <Link
            href={`/super/companies/${u.company.id}`}
            className="inline-flex items-center gap-2 group/c"
          >
            <div
              className="w-6 h-6 grid place-items-center rounded-[6px] text-white font-display font-bold text-[10px] shrink-0"
              style={{ backgroundColor: u.company.brandColor }}
            >
              {u.company.logoInitials}
            </div>
            <span className="text-[12.5px] text-ink group-hover/c:underline truncate max-w-[160px]">
              {u.company.name}
            </span>
          </Link>
        ) : (
          <span className="text-ink-3 text-[12px] italic">Platform</span>
        )}
      </td>
      <td className="px-4 py-3">
        <RolePill role={u.role as "super_admin" | "admin" | "trainee"} />
      </td>
      <td className="px-4 py-3">
        <StatusPill status={u.status} />
      </td>
      <td className="px-4 py-3 text-right">
        <span className="font-display text-[18px] leading-none tabular-nums text-ink">
          {u.sessions}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="font-display text-[18px] leading-none tabular-nums text-ink">
          {u.assignments}
        </span>
      </td>
      <td className="px-4 py-3 text-ink-2 font-mono text-[11.5px] whitespace-nowrap">
        {u.lastActive ? fmtRelative(new Date(u.lastActive)) : "—"}
      </td>
      <td className="px-5 py-3 text-right">
        {u.role !== "super_admin" ? (
          <UserStatusToggle
            userId={u.id}
            status={u.status as "active" | "suspended"}
          />
        ) : (
          <span className="text-[11px] text-ink-3 font-mono">—</span>
        )}
      </td>
    </tr>
  );
}

// ─────────────── Pills ───────────────

function RolePill({ role }: { role: "super_admin" | "admin" | "trainee" }) {
  if (role === "super_admin") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.08em] px-2 py-1 rounded-[6px] text-[#6d4ad9] whitespace-nowrap"
        style={{ background: "#ede9fe" }}
      >
        <Icon name="ai-sparkle" size={10} />
        Super admin
      </span>
    );
  }
  if (role === "admin") {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.08em] px-2 py-1 rounded-[6px] bg-accent-pale text-accent-strong whitespace-nowrap">
        <Icon name="shield" size={10} />
        Admin
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-[10.5px] font-bold uppercase tracking-[0.08em] px-2 py-1 rounded-[6px] bg-surface-2 text-ink-2 whitespace-nowrap">
      Trainee
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const cfg = {
    active: { dot: "bg-good", cls: "text-good", label: "Active" },
    invited: { dot: "bg-ink-3", cls: "text-ink-2", label: "Invited" },
    suspended: { dot: "bg-bad", cls: "text-bad", label: "Suspended" },
  } as const;
  const c =
    cfg[status as keyof typeof cfg] ?? {
      dot: "bg-ink-3",
      cls: "text-ink-3",
      label: status,
    };
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

// ─────────────── Empty ───────────────

function EmptyState({ q, tab }: { q: string; tab: Tab }) {
  return (
    <div className="bg-surface border border-border rounded-[12px] p-10 text-center">
      <div className="w-12 h-12 rounded-[10px] bg-surface-2 text-ink-3 grid place-items-center mx-auto">
        <Icon name="users" size={18} />
      </div>
      <h3 className="font-display text-[18px] mt-3 text-ink">
        No users match
      </h3>
      <p className="text-[13px] text-ink-2 mt-1 max-w-[420px] mx-auto leading-[1.55]">
        {q
          ? `Nothing matches "${q}" in the ${tab === "all" ? "all-users" : tab.replace("_", " ")} tab. Clear the search or switch tabs.`
          : "Nothing in this tab yet."}
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
