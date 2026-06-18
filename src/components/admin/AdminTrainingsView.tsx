// AdminTrainingsView — client component for /admin/trainings.
//
// Header + 4-button action row + Copilot drafted card + tab/search row +
// rich card grid. Matches the prototype screenshot (admin-02-trainings.png).
//
// Card thumbs use a deterministic gradient + icon derived from the first
// category, so each card looks distinct without faking imagery. The "AI"
// pill renders when houseStyleMatch is set (it's the only AI-quality
// signal we currently track on a training).

"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { deleteTraining } from "@/app/admin/trainings/actions";

export type AdminTrainingItem = {
  id: string;
  title: string;
  description: string | null;
  categories: string[];
  status: "draft" | "published" | "archived";
  houseStyleMatch: number | null;
  learnerCount: number;
  completionPct: number | null;
  _count: { modules: number; assignments: number };
  updatedAt: Date;
};

export type CopilotDraft = {
  id: string;
  title: string;
  modules: number;
  houseStyleMatch: number | null;
  updatedAt: Date;
} | null;

type Tab = "all" | "published" | "draft" | "archived";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "all", label: "All" },
  { key: "published", label: "Published" },
  { key: "draft", label: "Drafts" },
  { key: "archived", label: "Archived" },
];

export function AdminTrainingsView({
  trainings,
  copilotDraft,
}: {
  trainings: AdminTrainingItem[];
  copilotDraft: CopilotDraft;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");

  const counts = useMemo(
    () => ({
      all: trainings.length,
      published: trainings.filter((t) => t.status === "published").length,
      draft: trainings.filter((t) => t.status === "draft").length,
      archived: trainings.filter((t) => t.status === "archived").length,
    }),
    [trainings],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return trainings.filter((t) => {
      if (tab !== "all" && t.status !== tab) return false;
      if (!needle) return true;
      return (
        t.title.toLowerCase().includes(needle) ||
        (t.description?.toLowerCase().includes(needle) ?? false) ||
        t.categories.some((c) => c.toLowerCase().includes(needle))
      );
    });
  }, [trainings, tab, q]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
          Trainings
        </h1>
        <p className="text-ink-2 text-[13.5px] max-w-[640px] leading-[1.5]">
          All learning programs in one place. AI helps draft, refine, and
          translate.
        </p>
      </header>

      {/* Action row */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/admin/generate">
          <button
            type="button"
            suppressHydrationWarning
            className={cn(
              "inline-flex items-center gap-1.5 px-[14px] py-[8px] rounded-[8px]",
              "bg-surface border border-border-strong text-accent-strong text-[12.5px] font-semibold",
              "hover:bg-accent-pale",
            )}
          >
            <Icon name="ai-sparkle" size={12} />
            AI: improve any module
          </button>
        </Link>
        {/* Hidden — no import format / parser / server action exists yet.
            Re-enable once an import spec lands (SCORM ingest, JSON export
            round-trip, etc.). Until then the "+ Add Training" and
            "Generate new training" CTAs cover the create paths. */}
        {/* <Button variant="secondary" size="md">
          <Icon name="layers" size={13} />
          Import
        </Button> */}
        <Link href="/admin/generate">
          <button
            type="button"
            suppressHydrationWarning
            className={cn(
              "inline-flex items-center gap-1.5 px-[14px] py-[8px] rounded-[8px]",
              "bg-ai-grad text-white text-[12.5px] font-semibold",
              "hover:brightness-[1.05]",
            )}
            style={{ boxShadow: "0 4px 12px rgba(232,93,58,0.25)" }}
          >
            <Icon name="ai-sparkle" size={12} />
            Generate new training
          </button>
        </Link>
        <Link href="/admin/trainings/generator">
          <Button variant="accent" size="md" type="button">
            + Add Training
          </Button>
        </Link>
      </div>

      {/* Copilot drafted card */}
      {copilotDraft ? (
        <CopilotDraftedCard draft={copilotDraft} />
      ) : null}

      {/* Tab + search row */}
      <div className="flex items-center gap-3 flex-wrap border-b border-border">
        <div className="flex items-center gap-1 -mb-px">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                suppressHydrationWarning
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-2 text-[13px] border-b-2 whitespace-nowrap transition-colors",
                  active
                    ? "border-ink text-ink font-semibold"
                    : "border-transparent text-ink-2 hover:text-ink",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "text-[11px] font-bold tracking-[0.02em] px-[7px] py-[1px] rounded-full",
                    active
                      ? "bg-ink text-white"
                      : "bg-surface-2 text-ink-3",
                  )}
                >
                  {counts[t.key]}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative ml-auto w-[260px] pb-2">
          <Icon
            name="search"
            size={13}
            className="absolute left-3 top-[10px] text-ink-3"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search trainings"
            className={cn(
              "w-full bg-surface-2 border border-border rounded-[7px]",
              "pl-9 pr-3 py-[7px] text-[12.5px] focus:outline-none focus:border-border-strong",
              "placeholder:text-ink-3",
            )}
            suppressHydrationWarning
          />
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <Card pad="lg">
          <h2 className="font-display text-[22px]">
            No {tab === "all" ? "trainings" : `${tab} trainings`}{" "}
            {q ? `match "${q}"` : "yet"}
          </h2>
          <p className="text-ink-2 text-[13px] mt-2">
            {q
              ? "Try a different search or clear the filter."
              : tab === "all"
                ? "Spin up your first training — either by hand or with Generate."
                : `Try the All tab.`}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <TrainingCard key={t.id} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────── Copilot drafted card ───────────────
// Soft-pink AI banner referencing the most recent draft in the tenant.
// Frames real data — no fabrication. Hides when there's no draft.

function CopilotDraftedCard({ draft }: { draft: NonNullable<CopilotDraft> }) {
  return (
    <Link
      href={`/admin/trainings/${draft.id}/edit`}
      className="block group focus:outline-none"
    >
      <div
        className="relative rounded-[14px] p-[14px] border flex items-start gap-3 transition-colors group-hover:border-accent"
        style={{
          background:
            "linear-gradient(135deg, #fdf6f3 0%, #fce0ed 100%)",
          borderColor: "#f5cdb8",
        }}
      >
        <div
          className="w-[36px] h-[36px] grid place-items-center rounded-[10px] text-white shrink-0"
          style={{
            background: "var(--ai-grad)",
            boxShadow: "0 4px 12px rgba(232,93,58,0.3)",
          }}
        >
          <Icon name="ai-sparkle" size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] text-ink leading-snug">
            <span className="font-semibold">Recent draft:</span>{" "}
            <span className="font-semibold">
              &ldquo;{draft.title}&rdquo;
            </span>{" "}
            <span className="text-ink-2">
              ready to review.
            </span>
          </div>
          <div className="text-[12px] text-ink-2 mt-0.5 font-mono">
            {draft.modules} {draft.modules === 1 ? "module" : "modules"} ·
            updated {fmtAgo(draft.updatedAt)}
            {draft.houseStyleMatch != null ? (
              <>
                {" "}
                ·{" "}
                <span className="text-accent-strong font-semibold">
                  {draft.houseStyleMatch}% house style match
                </span>
              </>
            ) : null}
          </div>
        </div>
        <Icon
          name="chevron-right"
          size={14}
          className="text-ink-3 mt-1.5 shrink-0"
        />
      </div>
    </Link>
  );
}

// ─────────────── Training card ───────────────
// Rich card: gradient thumbnail (color derived from first category), icon
// centered, category label top-left, AI badge top-right (when
// houseStyleMatch is set), N modules pill bottom-right, then title + desc.

function TrainingCard({ t }: { t: AdminTrainingItem }) {
  const accent = thumbColor(t.categories[0] ?? t.title);
  const icon = thumbIcon(t.categories[0]);
  // Two-step confirm so a stray click on the corner of a card doesn't
  // wipe a training. First click reveals Yes/No; second click commits.
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onDeleteClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(true);
  }
  function onCancel(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(false);
    setError(null);
  }
  function onConfirm(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    startTransition(async () => {
      try {
        await deleteTraining(t.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
        setConfirming(false);
      }
    });
  }

  return (
    <Link
      href={`/admin/trainings/${t.id}/edit`}
      className="block group focus:outline-none"
    >
      <Card
        pad="md"
        className="h-full flex flex-col gap-2.5 transition-colors group-hover:border-ink"
      >
        <div
          className="relative w-full h-[124px] rounded-[10px] grid place-items-center overflow-hidden"
          style={{ background: accent.gradient }}
        >
          <Icon name={icon} size={36} className="text-white/85" />
          {t.categories[0] ? (
            <span
              className={cn(
                "absolute top-2 left-2 text-[10px] font-bold uppercase tracking-[0.1em] px-[7px] py-[2px] rounded-sm text-white",
              )}
              style={{ background: "rgba(0,0,0,0.22)" }}
            >
              {t.categories[0]}
            </span>
          ) : null}
          {t.houseStyleMatch != null ? (
            <span
              className="absolute top-2 right-2 inline-flex items-center gap-[3px] text-[10px] font-bold uppercase tracking-[0.08em] px-[7px] py-[2px] rounded-sm text-white"
              style={{ background: "rgba(0,0,0,0.34)" }}
            >
              <Icon name="ai-sparkle" size={10} />
              AI
            </span>
          ) : null}
          <span
            className="absolute bottom-2 right-2 text-[10.5px] font-semibold text-white px-[8px] py-[3px] rounded-md whitespace-nowrap"
            style={{ background: "rgba(0,0,0,0.5)" }}
          >
            {t._count.modules}{" "}
            {t._count.modules === 1 ? "module" : "modules"}
          </span>
        </div>

        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-[15px] leading-[1.3] text-ink min-w-0 truncate">
            {t.title}
          </h3>
          <StatusPill status={t.status} />
        </div>

        {t.description ? (
          <p className="text-ink-2 text-[12.5px] leading-[1.5] line-clamp-2">
            {t.description}
          </p>
        ) : null}

        <div className="flex items-center gap-3 mt-auto pt-2 text-[11.5px] text-ink-3 font-mono">
          <span>
            {t.learnerCount} {t.learnerCount === 1 ? "learner" : "learners"}
          </span>
          {t.completionPct != null ? (
            <>
              <span>·</span>
              <span>{t.completionPct}% complete</span>
            </>
          ) : null}
          <span className="ml-auto inline-flex items-center gap-1">
            {error ? (
              <span
                className="text-[10.5px] text-bad font-mono normal-case"
                title={error}
              >
                {error.slice(0, 40)}
              </span>
            ) : null}
            {confirming ? (
              <>
                <span className="text-[11px] text-ink-2 normal-case font-sans">
                  Delete?
                </span>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={pending}
                  suppressHydrationWarning
                  className="text-[11px] font-semibold text-white bg-bad hover:opacity-90 rounded-[6px] px-2 py-0.5 disabled:opacity-60 normal-case font-sans"
                >
                  {pending ? "Deleting…" : "Yes"}
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={pending}
                  suppressHydrationWarning
                  className="text-[11px] font-semibold text-ink-2 hover:text-ink bg-surface border border-border rounded-[6px] px-2 py-0.5 normal-case font-sans"
                >
                  No
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onDeleteClick}
                aria-label={`Delete training ${t.title}`}
                suppressHydrationWarning
                className="text-[11px] text-ink-3 hover:text-bad transition-colors normal-case font-sans"
              >
                Delete
              </button>
            )}
          </span>
        </div>
      </Card>
    </Link>
  );
}

function StatusPill({
  status,
}: {
  status: "draft" | "published" | "archived";
}) {
  const cls =
    status === "published"
      ? "bg-good-pale text-good border-good/20"
      : status === "draft"
        ? "bg-warn-pale text-warn border-warn/20"
        : "bg-surface-2 text-ink-3 border-border";
  return (
    <span
      className={cn(
        "text-[10px] font-semibold uppercase tracking-[0.08em] px-[6px] py-[1px] rounded-sm border whitespace-nowrap shrink-0",
        cls,
      )}
    >
      {status}
    </span>
  );
}

// Deterministic color picker — same category always gets the same gradient.
const PALETTES = [
  { from: "#e85d3a", to: "#c64a2b" },
  { from: "#7c5cd6", to: "#5b2eea" },
  { from: "#2a7d4f", to: "#1a5a36" },
  { from: "#2f80f5", to: "#1b56c2" },
  { from: "#c97a1b", to: "#a45c0b" },
  { from: "#b94e8d", to: "#7c2e5e" },
  { from: "#1a1a1a", to: "#3a3a3a" },
];

function thumbColor(key: string): { gradient: string } {
  const i = hash(key) % PALETTES.length;
  const p = PALETTES[i];
  return {
    gradient: `linear-gradient(135deg, ${p.from} 0%, ${p.to} 100%)`,
  };
}

function thumbIcon(category: string | undefined): IconName {
  if (!category) return "training";
  const c = category.toLowerCase();
  if (c.includes("sales") || c.includes("discovery")) return "trophy";
  if (c.includes("launch") || c.includes("product")) return "rocket";
  if (c.includes("objection") || c.includes("pricing")) return "credit-card";
  if (c.includes("onboard")) return "users";
  if (c.includes("knowledge") || c.includes("doc")) return "book";
  return "training";
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
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
