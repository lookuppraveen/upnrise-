// Trainings catalog — client component with search filter + scen-card grid.
//
// Matches prototype.css `.scen-card` (10px radius, 16px padding, gap-8,
// border-color hover) and `.scen-thumb` (84px gradient placeholder strip
// with image icon centered). Cards in the "Newly Added" section carry an
// accent "+ New" chip over the thumbnail (analog to the prototype's
// "+ Recommended" chip — we don't model recommendations yet, but "new" is
// real data from createdAt).

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { cn } from "@/lib/cn";

export type CatalogItem = {
  id: string;
  title: string;
  description: string | null;
  categories: string[];
  thumbnailUrl: string | null;
  progress: number;
  _count: { modules: number };
};

export function TrainingsCatalog({
  newlyAdded,
  others,
  totalCount,
}: {
  newlyAdded: CatalogItem[];
  others: CatalogItem[];
  totalCount: number;
}) {
  const [q, setQ] = useState("");
  const filteredNew = useMemo(() => filterTrainings(newlyAdded, q), [newlyAdded, q]);
  const filteredOthers = useMemo(() => filterTrainings(others, q), [others, q]);
  const matches = filteredNew.length + filteredOthers.length;

  return (
    <div className="space-y-7">
      <header className="space-y-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-[36px] leading-[1.05] -tracking-[0.015em] text-accent">
            Trainings
          </h1>
          <span className="font-display text-[26px] leading-none text-ink-3">
            ({totalCount})
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Icon
            name="search"
            size={16}
            className="absolute left-[18px] top-1/2 -translate-y-1/2 text-ink-3"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search trainings"
            className={cn(
              "w-full bg-surface-2 border border-border rounded-[10px]",
              "pl-12 pr-4 py-[14px] text-[14px] text-ink",
              "focus:outline-none focus:border-border-strong",
              "placeholder:text-ink-3",
            )}
            suppressHydrationWarning
          />
        </div>
      </header>

      {totalCount === 0 ? (
        <Card pad="lg">
          <h2 className="font-display text-[22px]">No published trainings yet</h2>
          <p className="text-ink-2 text-[13px] mt-2">
            Your admin hasn't published any trainings yet. Check back later.
          </p>
        </Card>
      ) : matches === 0 ? (
        <Card pad="lg">
          <p className="text-[13px] text-ink-2">
            No trainings match{" "}
            <span className="font-mono text-ink">&ldquo;{q}&rdquo;</span>. Try a
            different search.
          </p>
        </Card>
      ) : (
        <>
          <Section
            title="Newly Added"
            items={filteredNew}
            newBadge
          />
          <Section title="Others" items={filteredOthers} newBadge={false} />
        </>
      )}
    </div>
  );
}

function Section({
  title,
  items,
  newBadge,
}: {
  title: string;
  items: CatalogItem[];
  newBadge: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h2 className="font-display text-[22px] leading-none -tracking-[0.01em] text-accent">
          {title}
        </h2>
        <span className="text-[13px] text-ink-3 font-mono">({items.length})</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((t) => (
          <TrainingCard key={t.id} t={t} newBadge={newBadge} />
        ))}
      </div>
    </section>
  );
}

// ─────────────── Training card ───────────────
// .scen-card pattern: vertical stack with 84px scen-thumb, title, description,
// and a footer row pinned to the bottom (mt-auto on .scen-foot).

function TrainingCard({
  t,
  newBadge,
}: {
  t: CatalogItem;
  newBadge: boolean;
}) {
  return (
    <Link
      href={`/learn/trainings/${t.id}`}
      className="block group focus:outline-none"
      aria-label={`Open ${t.title}`}
    >
      <Card
        pad="md"
        className={cn(
          "h-full flex flex-col gap-2",
          "transition-colors group-hover:border-ink",
          "group-focus-visible:border-accent",
        )}
      >
        <ThumbStrip thumbnailUrl={t.thumbnailUrl} showNewBadge={newBadge} />

        <div className="flex flex-wrap gap-1 mt-0.5">
          {t.categories.slice(0, 2).map((c) => (
            <span
              key={c}
              className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-2 bg-surface-2 border border-border rounded-sm px-[6px] py-[2px]"
            >
              {c}
            </span>
          ))}
        </div>

        <h3 className="text-[15px] font-semibold leading-[1.3] text-ink">
          {t.title}
        </h3>
        {t.description ? (
          <p className="text-ink-2 text-[12.5px] leading-[1.5] line-clamp-2">
            {t.description}
          </p>
        ) : null}

        {/* scen-foot — pinned bottom */}
        <div className="flex items-center justify-between mt-auto pt-2">
          <span className="text-[11.5px] text-ink-3 font-mono">
            {t._count.modules} module{t._count.modules === 1 ? "" : "s"}
          </span>
          <ProgressRing value={t.progress} size={40} />
        </div>
      </Card>
    </Link>
  );
}

function ThumbStrip({
  thumbnailUrl,
  showNewBadge,
}: {
  thumbnailUrl: string | null;
  showNewBadge: boolean;
}) {
  return (
    <div
      className="relative w-full h-[84px] rounded-sm grid place-items-center text-ink-3 overflow-hidden"
      style={{
        background: thumbnailUrl
          ? undefined
          : "linear-gradient(135deg, #efece5, #d9d4ca)",
      }}
    >
      {thumbnailUrl ? (
        // Decorative thumbnail. Plain <img> here is intentional — these are
        // tenant-uploaded assets without known dimensions, and the next/image
        // remote-loader config isn't wired for arbitrary tenant URLs yet.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <Icon name="image" size={22} />
      )}
      {showNewBadge ? (
        <span
          className="absolute top-2 left-2 inline-flex items-center gap-[3px] text-[10.5px] font-bold text-white px-[8px] py-[2px] rounded-full"
          style={{
            background:
              "linear-gradient(135deg, #7c3aed 0%, #b94e8d 60%, #e85d3a 100%)",
            boxShadow: "0 2px 6px rgba(124,58,237,0.25)",
          }}
        >
          + New
        </span>
      ) : null}
    </div>
  );
}

function filterTrainings(items: CatalogItem[], q: string): CatalogItem[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return items;
  return items.filter(
    (t) =>
      t.title.toLowerCase().includes(needle) ||
      (t.description?.toLowerCase().includes(needle) ?? false) ||
      t.categories.some((c) => c.toLowerCase().includes(needle)),
  );
}
