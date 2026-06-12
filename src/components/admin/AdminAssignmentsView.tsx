// AdminAssignmentsView — client component for /admin/assignments.
//
// Header + 3-card KPI strip (Overdue / In progress / P1 attention) +
// tab+search row + dense table. Matches the established admin design
// language. Tab filter + search are client-side (instant).

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export type AdminAssignmentRow = {
  id: string;
  priority: "p1" | "p2" | "p3";
  status: string;
  computedStatus: "not_started" | "in_progress" | "completed";
  computedProgress: number;
  overdue: boolean;
  dueAt: Date | null;
  aiReason: string | null;
  user: { id: string; email: string; name: string | null };
  training: { id: string; title: string; categories: string[] };
};

type Tab = "all" | "todo" | "in_progress" | "completed" | "overdue";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "all", label: "All" },
  { key: "todo", label: "Not started" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "overdue", label: "Overdue" },
];

export function AdminAssignmentsView({
  rows,
}: {
  rows: AdminAssignmentRow[];
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");

  const counts = useMemo(
    () => ({
      all: rows.length,
      todo: rows.filter((r) => r.computedStatus === "not_started").length,
      in_progress: rows.filter((r) => r.computedStatus === "in_progress").length,
      completed: rows.filter((r) => r.computedStatus === "completed").length,
      overdue: rows.filter((r) => r.overdue).length,
    }),
    [rows],
  );

  const p1Attention = useMemo(
    () =>
      rows.filter(
        (r) => r.priority === "p1" && r.computedStatus !== "completed",
      ).length,
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (!matchesTab(r, tab)) return false;
      if (!needle) return true;
      const hay = `${r.user.name ?? ""} ${r.user.email} ${r.training.title}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, tab, q]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2 min-w-0">
          <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
            Assignments
          </h1>
          <p className="text-ink-2 text-[13.5px] max-w-[640px] leading-[1.5]">
            Every assignment across {counts.all}{" "}
            {counts.all === 1 ? "row" : "rows"}. Sorted by priority and due
            date — overdue items surface in the alert tile.
          </p>
        </div>
        <Link href="/admin/trainings">
          <Button variant="default" size="md">
            + New assignment
          </Button>
        </Link>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[14px]">
        <KpiTile
          label="Overdue"
          value={String(counts.overdue)}
          sub={
            counts.overdue === 0
              ? "nothing past its date"
              : counts.overdue === 1
                ? "1 learner needs a nudge"
                : `${counts.overdue} learners need a nudge`
          }
          icon="alert"
          tone={counts.overdue > 0 ? "warn" : "good"}
        />
        <KpiTile
          label="In progress"
          value={String(counts.in_progress)}
          sub={
            counts.in_progress === 0
              ? "no active practice"
              : "actively practicing"
          }
          icon="activity"
          tone="accent"
        />
        <KpiTile
          label="P1 attention"
          value={String(p1Attention)}
          sub={
            p1Attention === 0
              ? "no high-priority gaps"
              : "high-priority + not done"
          }
          icon="rocket"
          tone={p1Attention > 0 ? "warn" : "violet"}
        />
      </div>

      {/* Tab + search row */}
      <div className="flex items-center gap-3 flex-wrap border-b border-border">
        <div className="flex items-center gap-1 -mb-px overflow-x-auto">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
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
                      : t.key === "overdue" && counts.overdue > 0
                        ? "bg-bad-pale text-bad"
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
            placeholder="Search learner or training"
            className={cn(
              "w-full bg-surface-2 border border-border rounded-[7px]",
              "pl-9 pr-3 py-[7px] text-[12.5px] focus:outline-none focus:border-border-strong",
              "placeholder:text-ink-3",
            )}
            suppressHydrationWarning
          />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <Card pad="lg" className="rounded-[12px]">
          <h2 className="font-display text-[20px]">
            {rows.length === 0
              ? "No assignments yet"
              : `No ${tab === "all" ? "matches" : `${tab} assignments`}`}
          </h2>
          <p className="text-ink-2 text-[13px] mt-2">
            {rows.length === 0
              ? "Assign a training to start tracking learners. Use the wizard from Trainings → New training → step 3."
              : "Try a different tab or clear the search."}
          </p>
        </Card>
      ) : (
        <Card pad="sm" className="overflow-hidden p-0 rounded-[12px]">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2 border-b border-border">
              <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
                <th className="px-4 py-[10px]">Learner</th>
                <th className="px-4 py-[10px]">Training</th>
                <th className="px-4 py-[10px]">Priority</th>
                <th className="px-4 py-[10px]">Status</th>
                <th className="px-4 py-[10px] min-w-[140px]">Progress</th>
                <th className="px-4 py-[10px]">Due</th>
                <th className="px-4 py-[10px] text-right"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <Row key={a.id} a={a} />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function Row({ a }: { a: AdminAssignmentRow }) {
  const initial = (a.user.name ?? a.user.email).charAt(0).toUpperCase();
  return (
    <tr
      className={cn(
        "border-b border-border last:border-b-0 hover:bg-surface-2 align-middle",
      )}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-8 h-8 rounded-full grid place-items-center text-white text-[12px] font-semibold shrink-0"
            style={{ background: avatarGradient(a.user.email) }}
            aria-hidden
          >
            {initial}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-ink text-[13px] truncate">
              {a.user.name ?? a.user.email.split("@")[0]}
            </div>
            <div className="text-[11px] text-ink-3 font-mono truncate">
              {a.user.email}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <Link
          href={`/admin/trainings/${a.training.id}/edit`}
          className="text-ink hover:underline text-[13px] block truncate max-w-[260px]"
        >
          {a.training.title}
        </Link>
        {a.aiReason ? (
          <div className="mt-1">
            <span className="inline-flex items-center gap-1 max-w-[280px] text-[11px] font-medium text-accent-strong bg-accent-pale border border-accent/15 rounded-full px-[8px] py-[2px]">
              <Icon name="ai-sparkle" size={9} />
              <span className="truncate">{a.aiReason}</span>
            </span>
          </div>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <PriorityPill p={a.priority} ai={!!a.aiReason} />
      </td>
      <td className="px-4 py-3">
        <StatusPill status={a.computedStatus} overdue={a.overdue} />
      </td>
      <td className="px-4 py-3 min-w-[140px]">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-[5px] rounded-full bg-surface-2 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full",
                a.computedProgress >= 100
                  ? "bg-good"
                  : a.overdue
                    ? "bg-bad"
                    : "bg-accent",
              )}
              style={{
                width: `${Math.max(2, a.computedProgress)}%`,
              }}
            />
          </div>
          <span className="font-mono text-[11px] text-ink-3 w-[34px] text-right">
            {a.computedProgress}%
          </span>
        </div>
      </td>
      <td
        className={cn(
          "px-4 py-3 font-mono text-[11.5px] whitespace-nowrap",
          a.overdue ? "text-bad font-semibold" : "text-ink-2",
        )}
      >
        {formatDue(a.dueAt, a.overdue)}
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          href={`/admin/trainings/${a.training.id}/edit?step=3`}
          className="text-[12px] text-ink-2 hover:text-ink inline-flex items-center gap-1"
        >
          Manage
          <Icon name="chevron-right" size={12} />
        </Link>
      </td>
    </tr>
  );
}

// ─────────────── KPI tile ───────────────

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
      <div className="text-[11.5px] text-ink-3 mt-[3px]">{sub}</div>
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

// ─────────────── Pills ───────────────

function PriorityPill({
  p,
  ai,
}: {
  p: "p1" | "p2" | "p3";
  ai: boolean;
}) {
  const cls =
    p === "p1"
      ? "bg-accent-pale text-accent-strong border-accent/25"
      : p === "p2"
        ? "bg-warn-pale text-warn border-warn/25"
        : "bg-surface-2 text-ink-2 border-border";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[3px] font-mono font-bold text-[11px] px-[6px] py-[1px] rounded-sm border uppercase whitespace-nowrap",
        cls,
      )}
    >
      {p.toUpperCase()}
      {ai ? (
        <span className="text-[8.5px] font-bold tracking-[0.04em] opacity-75">
          · AI
        </span>
      ) : null}
    </span>
  );
}

function StatusPill({
  status,
  overdue,
}: {
  status: "not_started" | "in_progress" | "completed";
  overdue: boolean;
}) {
  if (overdue) {
    return (
      <span className="inline-flex items-center gap-[5px] text-[10.5px] font-semibold uppercase tracking-[0.08em] px-[7px] py-[2px] rounded-full border bg-bad-pale text-bad border-bad/20 whitespace-nowrap">
        <span className="w-[6px] h-[6px] rounded-full bg-bad" />
        Overdue
      </span>
    );
  }
  const map = {
    not_started: {
      label: "Not started",
      cls: "bg-surface-2 text-ink-2 border-border",
      dot: "bg-ink-3",
    },
    in_progress: {
      label: "In progress",
      cls: "bg-accent-pale text-accent-strong border-accent/20",
      dot: "bg-accent",
    },
    completed: {
      label: "Completed",
      cls: "bg-good-pale text-good border-good/20",
      dot: "bg-good",
    },
  };
  const m = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] text-[10.5px] font-semibold uppercase tracking-[0.08em] px-[7px] py-[2px] rounded-full border whitespace-nowrap",
        m.cls,
      )}
    >
      <span className={cn("w-[6px] h-[6px] rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

// ─────────────── helpers ───────────────

function matchesTab(a: AdminAssignmentRow, tab: Tab): boolean {
  switch (tab) {
    case "all":
      return true;
    case "todo":
      return a.computedStatus === "not_started";
    case "in_progress":
      return a.computedStatus === "in_progress";
    case "completed":
      return a.computedStatus === "completed";
    case "overdue":
      return a.overdue;
  }
}

function formatDue(due: Date | null, overdue: boolean): string {
  if (!due) return "—";
  const days = Math.round(
    (due.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (overdue) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 14) return `in ${days}d`;
  return due.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const AVATAR_PALETTES = [
  ["#e85d3a", "#c64a2b"],
  ["#7c5cd6", "#5b2eea"],
  ["#2a7d4f", "#1a5a36"],
  ["#2f80f5", "#1b56c2"],
  ["#c97a1b", "#a45c0b"],
  ["#b94e8d", "#7c2e5e"],
];

function avatarGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const [from, to] = AVATAR_PALETTES[Math.abs(h) % AVATAR_PALETTES.length];
  return `linear-gradient(135deg, ${from}, ${to})`;
}
