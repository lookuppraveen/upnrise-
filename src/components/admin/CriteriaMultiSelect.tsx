// Multi-select + weightage editor for evaluation criteria.
//
// Rendered inside RoleplayModuleEditor's Evaluation Criteria card. The
// admin picks entries from the STANDARD_CRITERIA library (with a
// searchable dropdown), types a custom entry if needed, then dials a
// weightage % on each selected row. The card enforces total = 100 and
// surfaces the running total + validation state to the parent so save
// can be blocked when invalid.

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  STANDARD_CRITERIA,
  isStandardCriterionId,
  makeCustomCriterionId,
} from "@/lib/evaluation/criteria-library";

export type SelectedCriterion = {
  id: string;
  label: string;
  weight: number; // 0–100
};

export function CriteriaMultiSelect({
  selected,
  onChange,
}: {
  selected: SelectedCriterion[];
  onChange: (next: SelectedCriterion[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const selectedIds = useMemo(
    () => new Set(selected.map((s) => s.id)),
    [selected],
  );

  // Library minus already-picked entries, filtered by the search query.
  const libraryMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return STANDARD_CRITERIA.filter((c) => {
      if (selectedIds.has(c.id)) return false;
      if (!q) return true;
      return (
        c.label.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    });
  }, [query, selectedIds]);

  // When the query doesn't match any library entry AND isn't blank, the
  // admin can add it as a custom criterion. This is what the requirement
  // means by "easily extendable" without a code change.
  const trimmedQuery = query.trim();
  const canAddCustom =
    trimmedQuery.length >= 2 &&
    !STANDARD_CRITERIA.some(
      (c) => c.label.toLowerCase() === trimmedQuery.toLowerCase(),
    ) &&
    !selected.some(
      (s) => s.label.toLowerCase() === trimmedQuery.toLowerCase(),
    );

  function addFromLibrary(id: string, label: string) {
    // Default weight: try to split evenly across the selection so the
    // admin usually only needs to tweak, not type from scratch. Rounded
    // down; leftover goes to the first entry.
    const nextCount = selected.length + 1;
    const even = Math.floor(100 / nextCount);
    const rebalanced = selected.map((s) => ({ ...s, weight: even }));
    const usedByOthers = rebalanced.reduce((sum, s) => sum + s.weight, 0);
    const leftover = 100 - usedByOthers - even;
    const next: SelectedCriterion[] = [
      ...(rebalanced.length > 0
        ? [{ ...rebalanced[0], weight: rebalanced[0].weight + leftover }]
        : []),
      ...rebalanced.slice(1),
      { id, label, weight: even },
    ];
    onChange(next);
    setQuery("");
  }

  function addCustom() {
    const label = trimmedQuery;
    if (!label) return;
    addFromLibrary(makeCustomCriterionId(label), label);
  }

  function removeSelected(id: string) {
    onChange(selected.filter((s) => s.id !== id));
  }

  function setWeight(id: string, weight: number) {
    onChange(
      selected.map((s) => (s.id === id ? { ...s, weight } : s)),
    );
  }

  const total = selected.reduce((sum, s) => sum + (s.weight || 0), 0);
  const totalValid = selected.length === 0 || total === 100;

  return (
    <div className="mt-4 space-y-3">
      {/* Searchable multi-select */}
      <div ref={wrapRef} className="relative">
        <div
          className="min-h-[42px] bg-surface border border-border-strong rounded-md px-2 py-1.5 flex items-center gap-1.5 flex-wrap cursor-text"
          onClick={() => setOpen(true)}
        >
          {selected.length === 0 ? (
            <span className="text-[12.5px] text-ink-3 px-1">
              Search or pick evaluation criteria…
            </span>
          ) : null}
          {selected.map((s) => (
            <span
              key={s.id}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11.5px]",
                isStandardCriterionId(s.id)
                  ? "bg-accent-pale/40 border-accent-pale text-ink"
                  : "bg-surface-2 border-border text-ink italic",
              )}
              title={isStandardCriterionId(s.id) ? "Standard" : "Custom"}
            >
              {s.label}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeSelected(s.id);
                }}
                aria-label={`Remove ${s.label}`}
                className="text-ink-3 hover:text-bad"
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canAddCustom) {
                e.preventDefault();
                addCustom();
              }
              if (e.key === "Backspace" && !query && selected.length > 0) {
                removeSelected(selected[selected.length - 1].id);
              }
            }}
            placeholder={selected.length === 0 ? "" : "Add another…"}
            className="flex-1 min-w-[120px] bg-transparent px-1 py-0.5 text-[12.5px] focus:outline-none"
            suppressHydrationWarning
          />
        </div>

        {open ? (
          <div className="absolute z-20 left-0 right-0 mt-1 max-h-[280px] overflow-y-auto bg-surface border border-border rounded-md shadow-lg py-1">
            {libraryMatches.length === 0 && !canAddCustom ? (
              <div className="px-3 py-2 text-[12px] text-ink-3">
                {query.trim()
                  ? "No matches. Type at least 2 chars to add a custom entry."
                  : "All standard criteria are already selected."}
              </div>
            ) : null}
            {libraryMatches.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => addFromLibrary(c.id, c.label)}
                className="w-full text-left px-3 py-1.5 hover:bg-surface-2"
              >
                <div className="text-[12.5px] font-semibold text-ink">
                  {c.label}
                </div>
                <div className="text-[11px] text-ink-3 leading-snug">
                  {c.description}
                </div>
              </button>
            ))}
            {canAddCustom ? (
              <button
                type="button"
                onClick={addCustom}
                className="w-full text-left px-3 py-1.5 border-t border-border hover:bg-surface-2"
              >
                <div className="text-[12.5px] font-semibold text-accent">
                  + Add custom: “{trimmedQuery}”
                </div>
                <div className="text-[11px] text-ink-3">
                  Saves as a tenant-specific criterion, not part of the standard library.
                </div>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Weightage table */}
      {selected.length > 0 ? (
        <div className="border border-border rounded-md overflow-hidden">
          <div className="grid grid-cols-[1fr_140px_40px] gap-2 px-3 py-2 bg-surface-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
            <div>Evaluation criterion</div>
            <div className="text-right">Weightage (%)</div>
            <div />
          </div>
          <ul>
            {selected.map((s) => (
              <li
                key={s.id}
                className="grid grid-cols-[1fr_140px_40px] gap-2 items-center px-3 py-2 border-t border-border first:border-t-0"
              >
                <div className="min-w-0">
                  <div className="text-[13px] text-ink truncate">{s.label}</div>
                  {!isStandardCriterionId(s.id) ? (
                    <div className="text-[10.5px] text-ink-3 italic">Custom</div>
                  ) : null}
                </div>
                <div className="flex items-center gap-1 justify-end">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={s.weight}
                    onChange={(e) => {
                      const raw = Number(e.target.value);
                      const clamped = Number.isFinite(raw)
                        ? Math.max(0, Math.min(100, Math.round(raw)))
                        : 0;
                      setWeight(s.id, clamped);
                    }}
                    className="w-20 bg-surface border border-border-strong rounded-md px-2 py-1 text-[13px] text-right focus:outline-none focus:border-accent"
                    suppressHydrationWarning
                  />
                  <span className="text-[12.5px] text-ink-3">%</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeSelected(s.id)}
                  aria-label={`Remove ${s.label}`}
                  className="w-7 h-7 grid place-items-center rounded-md text-ink-3 hover:text-bad justify-self-end"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div
            className={cn(
              "grid grid-cols-[1fr_140px_40px] gap-2 items-center px-3 py-2 border-t border-border text-[12.5px] font-semibold",
              totalValid ? "text-ink" : "text-bad",
            )}
          >
            <div>{totalValid ? "Total" : "Total (must equal 100%)"}</div>
            <div className="text-right">{total}%</div>
            <div />
          </div>
        </div>
      ) : null}

      {!totalValid ? (
        <p className="text-[11.5px] text-bad">
          Total weightage is {total}%. Adjust the values so the sum equals 100% before saving.
        </p>
      ) : null}
    </div>
  );
}

// Selector helper the parent uses to gate Save. Returns null when
// valid or a human-readable message when not.
export function validateCriteriaWeights(
  selected: SelectedCriterion[],
): string | null {
  if (selected.length === 0) return null;
  const total = selected.reduce((sum, s) => sum + (s.weight || 0), 0);
  if (total !== 100) {
    return `Evaluation criteria weightage must total 100% (currently ${total}%).`;
  }
  return null;
}
