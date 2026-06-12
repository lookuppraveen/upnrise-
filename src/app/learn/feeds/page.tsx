// Trainee · Feeds  (03_TRAINEE.md §Feeds)
//
// Pixel-perfect pass matches learn-06-feeds.png:
//   - Accent display title (trainee surface convention)
//   - Pill-style tab buttons (not the underline tabs)
//   - Tab taxonomy: All / + AI updates / Peer posts / Milestones — maps
//     onto FeedPostKind (announcement → peer post, win → milestone,
//     ai_nudge → AI updates)
//
// The refreshed FeedPostRow does the heavy visual lifting.

import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { listFeedPostsForCompany } from "@/lib/db/queries";
import { FeedPostRow } from "@/components/admin/FeedPostRow";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type Tab = "all" | "ai" | "peers" | "milestones";

const TABS: Array<{ key: Tab; label: string; icon?: "ai-sparkle" }> = [
  { key: "all", label: "All" },
  { key: "ai", label: "AI updates", icon: "ai-sparkle" },
  { key: "peers", label: "Peer posts" },
  { key: "milestones", label: "Milestones" },
];

export default async function TraineeFeedsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "all") as Tab;

  const user = (await getSessionUser())!;
  if (!user.companyId) return null;

  const all = await listFeedPostsForCompany(user.companyId);
  const filtered = all.filter((p) => {
    if (tab === "all") return true;
    if (tab === "ai") return p.kind === "ai_nudge";
    if (tab === "peers") return p.kind === "announcement";
    return p.kind === "win";
  });

  const counts = {
    all: all.length,
    ai: all.filter((p) => p.kind === "ai_nudge").length,
    peers: all.filter((p) => p.kind === "announcement").length,
    milestones: all.filter((p) => p.kind === "win").length,
  };

  return (
    <div className="px-7 pt-6 pb-20 max-w-[820px] space-y-5">
      <header className="space-y-2">
        <h1 className="font-display text-[36px] leading-[1.05] -tracking-[0.015em] text-accent">
          Feeds
        </h1>
        <p className="text-ink-2 text-[13.5px]">
          What&apos;s happening across your team.
        </p>
      </header>

      {/* Pill tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={
                t.key === "all" ? "/learn/feeds" : `/learn/feeds?tab=${t.key}`
              }
              className={cn(
                "inline-flex items-center gap-1.5 px-[14px] py-[6px] rounded-full text-[12.5px] font-medium whitespace-nowrap transition-colors",
                active
                  ? "bg-ink text-white border border-ink"
                  : "bg-surface text-ink-2 border border-border hover:bg-surface-2",
              )}
            >
              {t.icon ? <Icon name={t.icon} size={11} /> : null}
              {t.label}
              {!active && counts[t.key] > 0 ? (
                <span className="text-[11px] font-mono text-ink-3 ml-0.5">
                  {counts[t.key]}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <Card pad="lg">
          <p className="text-[13px] text-ink-2">
            Nothing in this view yet. Your team&apos;s announcements, AI
            updates, and milestones will land here.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <FeedPostRow key={p.id} post={p} deletable={false} />
          ))}
        </div>
      )}
    </div>
  );
}
