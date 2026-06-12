// CompaniesTable — client component for /super/companies.
//
// Header + AI Signals banner (props from server) + filter row (search +
// plan chips + health chips + sort) + dense table view. Matches the
// prototype screenshot (super-02-companies.png): the prototype trades the
// card grid for a denser ops table with bulk-select gutter.
//
// Bulk-select is wired locally (state only) — there's no batch action
// surface yet, so this gates without taking action. Filter changes don't
// hit the URL — the dataset is small (~14 companies) and the client filter
// is instant.

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export type CompanyRow = {
  id: string;
  name: string;
  logoInitials: string;
  brandColor: string;
  industry: string | null;
  region: string | null;
  seats: number;
  userCount: number;
  health: "healthy" | "watch" | "at_risk";
  healthScore: number;
  churnRisk: number | null;
  expandScore: number | null;
  plan: string | null;
  planColor: string | null;
  subscriptionStatus: "trialing" | "active" | "past_due" | "cancelled" | null;
  mrrCents: number;
  csm: string | null;
  creditsUsedPct: number | null;
};

export type Signals = {
  expansion: { count: number; names: string[] };
  churn: { count: number; names: string[] };
  creditExhaustion: { count: number; names: string[] };
  /** Distinct plan names in the dataset, sorted by setupCredits-implied tier. */
  planNames: string[];
};

type Sort = "mrr" | "name" | "health" | "users";

export function CompaniesTable({
  rows,
  signals,
}: {
  rows: CompanyRow[];
  signals: Signals;
}) {
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState<string | null>(null);
  const [healthFilter, setHealthFilter] = useState<CompanyRow["health"] | "all">(
    "all",
  );
  const [sort, setSort] = useState<Sort>("mrr");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (plan && r.plan !== plan) return false;
      if (healthFilter !== "all" && r.health !== healthFilter) return false;
      if (needle) {
        const hay = `${r.name} ${r.industry ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    return sortRows(list, sort);
  }, [rows, q, plan, healthFilter, sort]);

  const totals = useMemo(() => {
    return {
      seats: rows.reduce((s, r) => s + r.seats, 0),
      mrrCents: rows.reduce((s, r) => s + r.mrrCents, 0),
    };
  }, [rows]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(value: boolean) {
    setSelected(value ? new Set(filtered.map((r) => r.id)) : new Set());
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="space-y-2">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-[36px] leading-[1.05] -tracking-[0.015em] text-accent">
            Companies
          </h1>
          <span className="font-display text-[26px] leading-none text-ink-3">
            ({rows.length})
          </span>
        </div>
        <p className="text-ink-2 text-[13.5px]">
          Tenant accounts using UPnRise · {totals.seats.toLocaleString()}{" "}
          seats ·{" "}
          <span className="font-mono">${fmtCentsK(totals.mrrCents)} MRR</span>
        </p>
      </header>

      <AiSignalsBanner signals={signals} />

      {/* Filter row */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[260px] max-w-[360px]">
            <Icon
              name="search"
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or industry"
              className={cn(
                "w-full bg-surface-2 border border-border rounded-[9px]",
                "pl-9 pr-3 py-[8px] text-[13px] text-ink",
                "focus:outline-none focus:border-border-strong",
                "placeholder:text-ink-3",
              )}
              suppressHydrationWarning
            />
          </div>

          {/* Plan chips */}
          <ChipGroup
            value={plan}
            onChange={setPlan}
            options={[
              { value: null, label: "All plans" },
              ...signals.planNames.map((p) => ({ value: p, label: p })),
            ]}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Health chips */}
          <ChipGroup
            value={healthFilter}
            onChange={(v) => setHealthFilter(v ?? "all")}
            options={[
              { value: "all", label: "All health" },
              { value: "healthy", label: "Healthy", dot: "good" },
              { value: "watch", label: "Watch", dot: "warn" },
              { value: "at_risk", label: "At risk", dot: "bad" },
            ]}
            inactiveBg="surface"
          />

          {/* Sort */}
          <label className="ml-auto inline-flex items-center gap-2 text-[12px] text-ink-3 bg-surface border border-border rounded-[7px] px-3 py-[6px]">
            Sort by:
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="bg-transparent text-ink font-mono text-[12px] focus:outline-none"
              suppressHydrationWarning
            >
              <option value="mrr">MRR</option>
              <option value="name">Name</option>
              <option value="health">Health</option>
              <option value="users">Users</option>
            </select>
          </label>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <Card pad="lg">
          <p className="text-[13px] text-ink-2">
            No companies match the current filter.
          </p>
        </Card>
      ) : (
        <Card pad="sm" className="overflow-hidden p-0 rounded-[12px]">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2 border-b border-border">
              <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
                <th className="w-[40px] px-3 py-[10px]">
                  <CheckBox
                    on={
                      selected.size > 0 && selected.size === filtered.length
                    }
                    indeterminate={
                      selected.size > 0 && selected.size < filtered.length
                    }
                    onChange={(v) => toggleAll(v)}
                  />
                </th>
                <th className="px-4 py-[10px]">Company</th>
                <th className="px-4 py-[10px]">Health</th>
                <th className="px-4 py-[10px]">Plan</th>
                <th className="px-4 py-[10px] text-right">Users / Seats</th>
                <th className="px-4 py-[10px] text-right">MRR</th>
                <th className="px-4 py-[10px]">CSM</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <Row
                  key={r.id}
                  r={r}
                  selected={selected.has(r.id)}
                  onSelect={() => toggle(r.id)}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ─────────────── Row ───────────────

function Row({
  r,
  selected,
  onSelect,
}: {
  r: CompanyRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <tr
      className={cn(
        "border-b border-border last:border-b-0 align-middle",
        selected ? "bg-accent-pale/40" : "hover:bg-surface-2",
      )}
    >
      <td className="px-3 py-3">
        <CheckBox on={selected} onChange={() => onSelect()} />
      </td>
      <td className="px-4 py-3">
        <Link
          href={`/super/companies/${r.id}`}
          className="flex items-center gap-3 group/c min-w-0"
        >
          <div
            className="w-9 h-9 grid place-items-center rounded-full text-white font-display font-normal text-[14px] shrink-0"
            style={{ backgroundColor: r.brandColor }}
          >
            {r.logoInitials}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-ink text-[13.5px] truncate group-hover/c:underline">
              {r.name}
            </div>
            <div className="text-[11.5px] text-ink-3 truncate">
              {r.region ?? "—"}
              {r.industry ? ` · ${r.industry}` : ""}
            </div>
          </div>
        </Link>
      </td>
      <td className="px-4 py-3">
        <HealthPill health={r.health} score={r.healthScore} />
      </td>
      <td className="px-4 py-3">
        {r.plan ? (
          <span
            className="text-[10.5px] font-semibold uppercase tracking-[0.08em] px-[7px] py-[2px] rounded-sm text-white whitespace-nowrap"
            style={{ backgroundColor: r.planColor ?? "#1a1a1a" }}
          >
            {r.plan}
          </span>
        ) : (
          <span className="text-ink-3 text-[12px]">—</span>
        )}
        {r.subscriptionStatus && r.subscriptionStatus !== "active" ? (
          <div className="mt-1">
            <SubStatusPill status={r.subscriptionStatus} />
          </div>
        ) : null}
      </td>
      <td className="px-4 py-3 text-right font-mono text-ink-2 text-[12.5px] whitespace-nowrap">
        {r.userCount.toLocaleString()}
        <span className="text-ink-3"> / </span>
        {r.seats.toLocaleString()}
      </td>
      <td className="px-4 py-3 text-right font-mono text-ink whitespace-nowrap">
        {r.mrrCents === 0 ? "—" : `$${fmtCentsK(r.mrrCents)}`}
      </td>
      <td className="px-4 py-3 font-mono text-[11.5px] text-ink-2 truncate max-w-[180px]">
        {r.csm ?? "—"}
      </td>
    </tr>
  );
}

// ─────────────── Health pill ───────────────
// "94 · Healthy" — score plus health label, tinted by tone.

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

function SubStatusPill({
  status,
}: {
  status: "trialing" | "past_due" | "cancelled";
}) {
  const map = {
    trialing: { label: "Trial", cls: "bg-surface-2 text-ink-2 border-border" },
    past_due: { label: "Past due", cls: "bg-bad-pale text-bad border-bad/20" },
    cancelled: {
      label: "Cancelled",
      cls: "bg-surface-2 text-ink-3 border-border",
    },
  } as const;
  const m = map[status];
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

// ─────────────── AI Signals banner ───────────────
// Soft purple-pink gradient banner (matches the Training Detail Coach
// insight palette to keep the AI surfaces consistent). Renders only when
// at least one signal is non-zero.

function AiSignalsBanner({ signals }: { signals: Signals }) {
  const total =
    signals.expansion.count +
    signals.churn.count +
    signals.creditExhaustion.count;
  if (total === 0) return null;

  const parts: string[] = [];
  if (signals.expansion.count > 0)
    parts.push(
      `${signals.expansion.count} expansion ${signals.expansion.count === 1 ? "signal" : "signals"}`,
    );
  if (signals.churn.count > 0)
    parts.push(
      `${signals.churn.count} critical churn ${signals.churn.count === 1 ? "risk" : "risks"}`,
    );
  if (signals.creditExhaustion.count > 0)
    parts.push(
      `${signals.creditExhaustion.count} credit exhaustion`,
    );

  const detail: string[] = [];
  if (signals.expansion.names.length > 0)
    detail.push(
      `${signals.expansion.names.slice(0, 2).join(" + ")} show readiness for an upgrade.`,
    );
  if (signals.churn.names.length > 0)
    detail.push(
      `${signals.churn.names.slice(0, 2).join(" + ")} flagged for retention focus.`,
    );
  if (signals.creditExhaustion.names.length > 0)
    detail.push(
      `${signals.creditExhaustion.names.slice(0, 2).join(" + ")} approaching credit cap.`,
    );

  return (
    <div
      className="rounded-[12px] p-[14px] border flex items-start gap-3"
      style={{
        background: "linear-gradient(135deg, #f3eafa 0%, #fce8f0 100%)",
        borderColor: "#e6d2f1",
      }}
    >
      <div
        className="w-7 h-7 rounded-full grid place-items-center text-white shrink-0"
        style={{
          background: "linear-gradient(135deg, #7c3aed, #b94e8d)",
          boxShadow: "0 2px 8px rgba(124,58,237,0.25)",
        }}
        aria-hidden
      >
        <Icon name="ai-sparkle" size={12} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[13.5px] text-ink leading-snug">
          {parts.join(" · ")}
        </div>
        {detail.length > 0 ? (
          <p className="text-[12.5px] text-ink-2 mt-1 leading-[1.55]">
            {detail.join(" ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────── Chip group ───────────────

function ChipGroup<T extends string | null>({
  value,
  onChange,
  options,
  inactiveBg = "surface",
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; dot?: "good" | "warn" | "bad" }>;
  inactiveBg?: "surface" | "surface-2";
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value ?? "_null_")}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 px-[12px] py-[6px] rounded-[7px] text-[12.5px] font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-ink text-white border border-ink"
                : cn(
                    "text-ink-2 border border-border",
                    inactiveBg === "surface"
                      ? "bg-surface hover:bg-surface-2"
                      : "bg-surface-2 hover:bg-border",
                  ),
            )}
          >
            {opt.dot ? (
              <span
                className={cn(
                  "w-[7px] h-[7px] rounded-full",
                  opt.dot === "good"
                    ? "bg-good"
                    : opt.dot === "warn"
                      ? "bg-warn"
                      : "bg-bad",
                )}
              />
            ) : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function CheckBox({
  on,
  indeterminate,
  onChange,
}: {
  on: boolean;
  indeterminate?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
      className={cn(
        "w-4 h-4 rounded-[4px] border grid place-items-center transition-colors",
        on || indeterminate
          ? "bg-ink border-ink text-white"
          : "bg-surface border-border-strong text-transparent hover:border-ink",
      )}
      aria-pressed={on}
    >
      {indeterminate ? (
        <span className="w-2 h-[1.5px] bg-white block" />
      ) : (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path
            d="M2 5l2 2 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

function sortRows(rows: CompanyRow[], by: Sort): CompanyRow[] {
  const copy = [...rows];
  switch (by) {
    case "mrr":
      return copy.sort((a, b) => b.mrrCents - a.mrrCents);
    case "name":
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case "health":
      return copy.sort((a, b) => b.healthScore - a.healthScore);
    case "users":
      return copy.sort((a, b) => b.userCount - a.userCount);
  }
}

function fmtCentsK(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `${(dollars / 1000).toFixed(1)}k`;
  return dollars.toFixed(0);
}
