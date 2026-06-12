// Admin · Feeds  (01_ADMIN.md §Feeds)
//
// Composer + tenant timeline. Posts go to /learn/feeds for trainees.
// The design source has polls, reactions, scheduled posts, and audience
// targeting — none of those are modeled today, so we don't fabricate
// them. Composer handles announcement + win; ai_nudge posts arrive
// automatically from the Copilot pipeline.

import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { listFeedPostsForCompany } from "@/lib/db/queries";
import { FeedsComposer } from "@/components/admin/FeedsComposer";
import { FeedPostRow } from "@/components/admin/FeedPostRow";
import { SuggestedDrafts } from "@/components/admin/SuggestedDrafts";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type Tab = "all" | "announcement" | "win" | "ai_nudge";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "all", label: "All" },
  { key: "announcement", label: "Announcements" },
  { key: "win", label: "Wins" },
  { key: "ai_nudge", label: "AI nudges" },
];

export default async function AdminFeedsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "all") as Tab;

  const user = (await getSessionUser())!;
  if (!user.companyId) return null;

  const all = await listFeedPostsForCompany(user.companyId);

  const counts: Record<Tab, number> = {
    all: all.length,
    announcement: all.filter((p) => p.kind === "announcement").length,
    win: all.filter((p) => p.kind === "win").length,
    ai_nudge: all.filter((p) => p.kind === "ai_nudge").length,
  };

  const weekCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const last7d = all.filter((p) => +new Date(p.createdAt) >= weekCutoff);
  const distinctAuthors7d = new Set(
    last7d.map((p) => p.author?.id).filter(Boolean),
  ).size;
  const aiShare =
    all.length === 0
      ? 0
      : Math.round((counts.ai_nudge / all.length) * 100);

  const filtered =
    tab === "all" ? all : all.filter((p) => p.kind === tab);

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1280px] space-y-5">
      <Header total={all.length} />
      <KpiStrip
        total={all.length}
        last7d={last7d.length}
        wins={counts.win}
        ai={counts.ai_nudge}
        aiShare={aiShare}
        authors7d={distinctAuthors7d}
      />

      <SectionHead title="Compose" hint="Drop an announcement or celebrate a win — it lands in the trainee feed instantly." />
      <FeedsComposer />

      <SuggestedDrafts />

      <SectionHead
        title="Timeline"
        hint={
          <>
            Trainees see this at{" "}
            <Link
              href="/learn/feeds"
              className="text-accent underline"
            >
              /learn/feeds
            </Link>
            . AI nudges land automatically.
          </>
        }
      />
      <PillTabs current={tab} counts={counts} />

      {filtered.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <FeedPostRow key={p.id} post={p} deletable />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────── Header ───────────────

function Header({ total }: { total: number }) {
  return (
    <header className="space-y-2">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
          Feeds
        </h1>
        {total > 0 ? (
          <span className="text-[12px] font-mono text-ink-3 mt-2">
            ({total})
          </span>
        ) : null}
      </div>
      <p className="text-ink-2 text-[13.5px] max-w-[680px] leading-[1.5]">
        Announcements, wins, and AI nudges your team sees. Compose below or
        let the Copilot auto-publish from real activity in the tenant.
      </p>
    </header>
  );
}

// ─────────────── KPI strip ───────────────

function KpiStrip({
  total,
  last7d,
  wins,
  ai,
  aiShare,
  authors7d,
}: {
  total: number;
  last7d: number;
  wins: number;
  ai: number;
  aiShare: number;
  authors7d: number;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-[14px]">
      <KpiTile
        label="All posts"
        value={String(total)}
        sub={
          total === 0
            ? "no posts yet"
            : `${last7d} this week`
        }
        icon="message"
        tone="accent"
      />
      <KpiTile
        label="Wins celebrated"
        value={String(wins)}
        sub={
          wins === 0
            ? "no wins shouted out"
            : wins === 1
              ? "one shout-out"
              : "keep the streak going"
        }
        icon="trophy"
        tone="good"
      />
      <KpiTile
        label="AI nudges"
        value={String(ai)}
        sub={
          total === 0
            ? "—"
            : ai === 0
              ? "all human-authored"
              : `${aiShare}% of timeline`
        }
        icon="ai-sparkle"
        tone="violet"
      />
      <KpiTile
        label="Authors · 7d"
        value={String(authors7d)}
        sub={
          authors7d === 0
            ? "quiet week"
            : authors7d === 1
              ? "solo voice"
              : "active contributors"
        }
        icon="users"
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

// ─────────────── Section head ───────────────

function SectionHead({
  title,
  hint,
}: {
  title: string;
  hint: React.ReactNode;
}) {
  return (
    <div className="space-y-1 pt-1">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
        {title}
      </div>
      <p className="text-[12.5px] text-ink-2 leading-[1.5]">{hint}</p>
    </div>
  );
}

// ─────────────── Pill tabs ───────────────

function PillTabs({
  current,
  counts,
}: {
  current: Tab;
  counts: Record<Tab, number>;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {TABS.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.key === "all" ? "/admin/feeds" : `/admin/feeds?tab=${t.key}`}
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

// ─────────────── Empty ───────────────

function EmptyState({ tab }: { tab: Tab }) {
  const copy =
    tab === "all"
      ? "No posts yet. Drop an announcement or celebrate a win above — trainees see it instantly."
      : tab === "announcement"
        ? "No announcements yet. Use the composer to make one."
        : tab === "win"
          ? "No wins celebrated yet. Shout out a rep who's been crushing it."
          : "No AI nudges yet — Copilot publishes these when there's activity worth surfacing.";
  return (
    <div className="bg-surface border border-border rounded-[12px] p-10 text-center">
      <div className="w-12 h-12 rounded-[10px] bg-surface-2 text-ink-3 grid place-items-center mx-auto">
        <Icon name="message" size={18} />
      </div>
      <h3 className="font-display text-[18px] mt-3 text-ink">
        Nothing here yet
      </h3>
      <p className="text-[13px] text-ink-2 mt-1 max-w-[420px] mx-auto leading-[1.55]">
        {copy}
      </p>
    </div>
  );
}
