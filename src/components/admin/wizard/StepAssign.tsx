// Step 3 — Assign learners.
//
// New layout (matches mockup): AI-suggestion banner → table of already-
// assigned trainees with HRIS-style columns → "+ Assign" button opens a
// search-and-checkbox modal to pick more. Per-assignment priority/dueAt
// from the old wizard have been folded into Training-level dueAt in
// Step 4 (so the column is omitted here; priority defaults to p2).

"use client";

import { useMemo, useState, useTransition } from "react";
import {
  goToStep,
  saveAssignments,
  saveDraftAndExit,
} from "@/app/admin/trainings/actions";
import { Icon } from "@/components/ui/Icon";
import { WizardFooter } from "./StepBasic";
import { cn } from "@/lib/cn";

export type Trainee = {
  id: string;
  email: string;
  name: string | null;
  employeeCode: string | null;
  role: string; // free-form display label, e.g. "Trainee" or a future job role
  zone: string | null;
  designation: string | null;
  department: string | null;
};

export function StepAssign({
  trainingId,
  trainees,
  initialAssignedIds,
}: {
  trainingId: string;
  trainees: Trainee[];
  initialAssignedIds: string[];
}) {
  const [assigned, setAssigned] = useState<Set<string>>(
    new Set(initialAssignedIds),
  );
  const [search, setSearch] = useState("");
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [pending, startTransition] = useTransition();

  const byId = useMemo(() => {
    const m = new Map<string, Trainee>();
    for (const t of trainees) m.set(t.id, t);
    return m;
  }, [trainees]);

  const assignedRows = useMemo(() => {
    const rows: Trainee[] = [];
    for (const id of assigned) {
      const t = byId.get(id);
      if (t) rows.push(t);
    }
    return rows
      .filter((t) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          (t.name?.toLowerCase().includes(q) ?? false) ||
          t.email.toLowerCase().includes(q) ||
          (t.employeeCode?.toLowerCase().includes(q) ?? false) ||
          (t.department?.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) =>
        (a.name ?? a.email).localeCompare(b.name ?? b.email),
      );
  }, [assigned, byId, search]);

  const suggestionCount = useMemo(() => {
    // Honest heuristic: how many tenant trainees aren't already assigned.
    // The mockup's "AI suggested 42" copy maps to a real backend signal
    // we don't have yet; surface the eligible pool size instead.
    return trainees.filter((t) => !assigned.has(t.id)).length;
  }, [trainees, assigned]);

  function persist(ids: Set<string>, next: boolean) {
    startTransition(() => {
      void saveAssignments(
        trainingId,
        { userIds: Array.from(ids), priority: "p2", dueAt: null },
        next,
      );
    });
  }

  function commitFromModal(newIds: Set<string>) {
    setAssigned(newIds);
    setShowAssignModal(false);
    persist(newIds, false);
  }

  function autoAssignAll() {
    const next = new Set(assigned);
    for (const t of trainees) next.add(t.id);
    setAssigned(next);
    persist(next, false);
  }

  function removeOne(id: string) {
    const next = new Set(assigned);
    next.delete(id);
    setAssigned(next);
    persist(next, false);
  }

  return (
    <div className="space-y-6">
      {/* AI suggestion banner */}
      {suggestionCount > 0 ? (
        <div
          className="border rounded-[12px] p-3"
          style={{
            background:
              "linear-gradient(120deg, rgba(124,92,214,0.10) 0%, rgba(255,124,82,0.08) 100%)",
            borderColor: "rgba(124,92,214,0.30)",
          }}
        >
          <div className="flex items-center gap-3 flex-wrap">
            <div
              className="w-8 h-8 grid place-items-center rounded-md text-white shrink-0"
              style={{ background: "var(--ai-grad, #7c5cd6)" }}
              aria-hidden
            >
              <Icon name="ai-sparkle" size={13} />
            </div>
            <div className="flex-1 min-w-[260px]">
              <div className="text-[13px] text-ink leading-[1.45]">
                <strong className="font-semibold">
                  {suggestionCount} eligible {suggestionCount === 1 ? "trainee" : "trainees"}
                </strong>{" "}
                in your tenant aren&apos;t assigned yet. Auto-assign everyone, or
                pick a focused cohort with{" "}
                <span className="font-semibold">+ Assign</span>.
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowAssignModal(true)}
                className="text-[11.5px] font-semibold text-[#6d4ad9] hover:underline"
              >
                Preview list
              </button>
              <button
                type="button"
                onClick={autoAssignAll}
                disabled={pending}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-accent text-white text-[12px] font-semibold hover:bg-accent-strong disabled:opacity-60"
              >
                Auto-assign {suggestionCount}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Header + actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-display text-[22px] leading-tight">
          Assigned Employees{" "}
          <span className="text-ink-3 font-normal">({assigned.size})</span>
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Icon
              name="search"
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-3"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="bg-surface border border-border-strong rounded-md pl-7 pr-2 py-1.5 text-[12.5px] focus:outline-none focus:border-accent"
              suppressHydrationWarning
            />
          </div>
          <button
            type="button"
            onClick={() => {
              window.alert("Filters are coming soon.");
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border bg-surface text-[12.5px] text-ink-2 hover:text-ink"
          >
            <Icon name="layers" size={11} />
            Filters
          </button>
          <button
            type="button"
            onClick={() => setShowAssignModal(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-strong"
          >
            + Assign
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-[12px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-surface-2 border-b border-border">
              <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Employee Code</Th>
                <Th>Role</Th>
                <Th>Zone</Th>
                <Th>Designation</Th>
                <Th>Department</Th>
                <Th className="text-right">{" "}</Th>
              </tr>
            </thead>
            <tbody>
              {assignedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-[13px] text-ink-3"
                  >
                    No assigned employees found
                  </td>
                </tr>
              ) : (
                assignedRows.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-border last:border-b-0 hover:bg-surface-2"
                  >
                    <Td>
                      <span className="font-semibold text-ink">
                        {t.name ?? t.email.split("@")[0]}
                      </span>
                    </Td>
                    <Td>
                      <span className="font-mono text-[11.5px] text-ink-2">
                        {t.email}
                      </span>
                    </Td>
                    <Td>{t.employeeCode ?? <Dash />}</Td>
                    <Td>{t.role}</Td>
                    <Td>{t.zone ?? <Dash />}</Td>
                    <Td>{t.designation ?? <Dash />}</Td>
                    <Td>{t.department ?? <Dash />}</Td>
                    <Td className="text-right">
                      <button
                        type="button"
                        onClick={() => removeOne(t.id)}
                        disabled={pending}
                        aria-label={`Remove ${t.name ?? t.email}`}
                        className="w-7 h-7 grid place-items-center rounded-md border border-border bg-surface-2 text-ink-3 hover:text-bad hover:bg-bad-pale disabled:opacity-50"
                      >
                        ×
                      </button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assign modal */}
      {showAssignModal ? (
        <AssignModal
          trainees={trainees}
          initial={assigned}
          onClose={() => setShowAssignModal(false)}
          onApply={commitFromModal}
        />
      ) : null}

      <WizardFooter
        onBack={() => startTransition(() => void goToStep(trainingId, 2))}
        onSaveDraft={() =>
          startTransition(() => void saveDraftAndExit(trainingId))
        }
        onSaveNext={() => persist(assigned, true)}
        pending={pending}
      />
    </div>
  );
}

// ─────────────── Atoms ───────────────

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={cn("px-3 py-[10px] whitespace-nowrap", className)}>
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={cn("px-3 py-2.5 whitespace-nowrap", className)}>
      {children}
    </td>
  );
}

function Dash() {
  return <span className="text-ink-3">—</span>;
}

// ─────────────── Assign modal ───────────────

function AssignModal({
  trainees,
  initial,
  onClose,
  onApply,
}: {
  trainees: Trainee[];
  initial: Set<string>;
  onClose: () => void;
  onApply: (next: Set<string>) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set(initial));
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    if (!search.trim()) return trainees;
    const q = search.toLowerCase();
    return trainees.filter(
      (t) =>
        (t.name?.toLowerCase().includes(q) ?? false) ||
        t.email.toLowerCase().includes(q) ||
        (t.department?.toLowerCase().includes(q) ?? false) ||
        (t.designation?.toLowerCase().includes(q) ?? false),
    );
  }, [trainees, search]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    const next = new Set(picked);
    for (const t of visible) next.add(t.id);
    setPicked(next);
  }

  function deselectAllVisible() {
    const next = new Set(picked);
    for (const t of visible) next.delete(t.id);
    setPicked(next);
  }

  const addedCount = useMemo(() => {
    let c = 0;
    for (const id of picked) if (!initial.has(id)) c++;
    return c;
  }, [picked, initial]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Assign learners"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-bg border border-border rounded-[14px] w-full max-w-[680px] max-h-[80vh] flex flex-col shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <h3 className="font-display text-[20px] leading-tight">
            Assign learners
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 grid place-items-center rounded-md hover:bg-surface-2 text-ink-3 hover:text-ink"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border space-y-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, designation, department…"
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
          <div className="flex items-center gap-3 text-[11.5px]">
            <button
              type="button"
              onClick={selectAllVisible}
              className="font-semibold text-accent hover:text-accent-strong"
            >
              Select all visible ({visible.length})
            </button>
            <button
              type="button"
              onClick={deselectAllVisible}
              className="text-ink-3 hover:text-ink"
            >
              Deselect all visible
            </button>
            <span className="ml-auto font-mono text-ink-3">
              {picked.size} picked
              {addedCount > 0 ? ` (+${addedCount} new)` : ""}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {visible.length === 0 ? (
            <p className="text-[13px] text-ink-3 py-4 text-center">
              No learners match.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {visible.map((t) => {
                const checked = picked.has(t.id);
                return (
                  <li key={t.id}>
                    <label
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer",
                        checked ? "bg-accent-pale/40" : "hover:bg-surface-2",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(t.id)}
                        className="accent-accent"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-ink truncate">
                          {t.name ?? t.email.split("@")[0]}
                          {t.designation ? (
                            <span className="text-ink-3 font-normal">
                              {" "}· {t.designation}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-ink-3 font-mono truncate">
                          {t.email}
                          {t.department ? `  ·  ${t.department}` : ""}
                          {t.zone ? `  ·  ${t.zone}` : ""}
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-[12.5px] text-ink-2 hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onApply(picked)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-strong"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
