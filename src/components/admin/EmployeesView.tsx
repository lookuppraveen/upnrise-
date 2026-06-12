// EmployeesView — client component for /admin/employees.
//
// Header + KPI strip (Total / Active 7D / Inactive 14D+) + AI nudge banner
// + tab/search row + dense table. Matches admin-04-employees.png.
//
// Team / HQ / Zone now render in a single composed column when the user is
// assigned to a team; unassigned users show "—" so it's obvious that the
// org tree exists but they aren't in it. AI smart list tab is still
// skipped (needs stored AI-derived segments).

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  AddTraineeModal,
  type ManagerOption,
} from "@/components/admin/AddTraineeModal";
import { EditEmployeeModal } from "@/components/admin/EditEmployeeModal";
import { deleteEmployee } from "@/app/admin/employees/actions";
import { toast } from "@/components/ui/Toast";

export type TeamOption = { id: string; name: string };

export type EmployeeRow = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "trainee";
  status: string; // active / invited / suspended
  lastActive: Date | null;
  createdAt: Date;
  sessions: number;
  avgScore: number | null;
  assignments: number;
  team: {
    id: string;
    name: string;
    hq: {
      id: string;
      name: string;
      city: string | null;
      zone: { id: string; name: string } | null;
    } | null;
  } | null;
};

type Tab = "all" | "active" | "at_risk" | "new" | "admins";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "at_risk", label: "At risk" },
  { key: "new", label: "New (30d)" },
  { key: "admins", label: "Admins" },
];

const ACTIVE_WINDOW_DAYS = 7;
const INACTIVE_WINDOW_DAYS = 14;
const NEW_WINDOW_DAYS = 30;
const AT_RISK_SCORE = 60;

export function EmployeesView({
  employees,
  teams,
  managers,
}: {
  employees: EmployeeRow[];
  teams: TeamOption[];
  managers: ManagerOption[];
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<EmployeeRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeRow | null>(null);

  const counts = useMemo(() => {
    const trainees = employees.filter((e) => e.role === "trainee");
    const admins = employees.filter((e) => e.role === "admin").length;
    return {
      total: employees.length,
      learners: trainees.length,
      admins,
      active: countWithinDays(employees, "lastActive", ACTIVE_WINDOW_DAYS),
      inactive: countOlderThan(employees, "lastActive", INACTIVE_WINDOW_DAYS),
      atRisk: trainees.filter(
        (e) => e.avgScore != null && e.avgScore < AT_RISK_SCORE,
      ).length,
      newThisMonth: countWithinDays(employees, "createdAt", NEW_WINDOW_DAYS),
    };
  }, [employees]);

  const tabCounts: Record<Tab, number> = {
    all: counts.total,
    active: counts.active,
    at_risk: counts.atRisk,
    new: counts.newThisMonth,
    admins: counts.admins,
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return employees.filter((e) => {
      if (!matchesTab(e, tab)) return false;
      if (!needle) return true;
      const hay = `${e.name ?? ""} ${e.email}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [employees, tab, q]);

  const inactiveNames = useMemo(
    () =>
      employees
        .filter(
          (e) =>
            e.role === "trainee" &&
            e.lastActive != null &&
            daysSince(e.lastActive) >= INACTIVE_WINDOW_DAYS,
        )
        .slice(0, 3)
        .map((e) => e.name ?? e.email.split("@")[0]),
    [employees],
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2 min-w-0">
          <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
            Employees
          </h1>
          <p className="text-ink-2 text-[13.5px] max-w-[680px] leading-[1.5]">
            {counts.learners}{" "}
            {counts.learners === 1 ? "learner" : "learners"} ·{" "}
            {counts.admins} {counts.admins === 1 ? "admin" : "admins"}.
            Copilot finds gaps and surfaces who to nudge.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          suppressHydrationWarning
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-accent text-white text-[13px] font-semibold hover:bg-accent-strong shrink-0"
        >
          <span aria-hidden className="text-[14px] leading-none">+</span>
          Add trainee
        </button>
      </header>

      {showAdd ? (
        <AddTraineeModal
          teams={teams}
          managers={managers}
          onClose={() => setShowAdd(false)}
        />
      ) : null}

      {editTarget ? (
        <EditEmployeeModal
          employee={editTarget}
          teams={teams}
          managers={managers}
          onClose={() => setEditTarget(null)}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmDeleteModal
          employee={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      ) : null}

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[14px]">
        <Kpi
          label="Total"
          value={counts.total.toLocaleString()}
          delta={
            counts.newThisMonth > 0
              ? { dir: "up", text: `+${counts.newThisMonth} this month` }
              : null
          }
          icon="users"
          tone="accent"
        />
        <Kpi
          label={`Active (${ACTIVE_WINDOW_DAYS}d)`}
          value={counts.active.toLocaleString()}
          delta={
            counts.total > 0
              ? {
                  dir: "neutral",
                  text: `${Math.round((counts.active / counts.total) * 100)}% of roster`,
                }
              : null
          }
          icon="activity"
          tone="good"
        />
        <Kpi
          label={`Inactive (${INACTIVE_WINDOW_DAYS}d+)`}
          value={counts.inactive.toLocaleString()}
          delta={
            counts.inactive > 0
              ? {
                  dir: "down",
                  text: "needs nudge",
                }
              : null
          }
          icon="alert"
          tone="warn"
        />
      </div>

      {/* AI nudge banner */}
      {counts.inactive > 0 ? (
        <div
          className="relative rounded-[14px] p-[14px] border flex items-start gap-3"
          style={{
            background:
              "linear-gradient(135deg, #fdf6f3 0%, #fdebe4 100%)",
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
            <div className="font-semibold text-[13.5px] text-ink">
              {counts.inactive}{" "}
              {counts.inactive === 1 ? "learner hasn't" : "learners haven't"}{" "}
              logged in for {INACTIVE_WINDOW_DAYS}+ days
              {inactiveNames.length > 0 ? (
                <span className="text-ink-2">
                  {" "}
                  — including{" "}
                  {inactiveNames.slice(0, 3).join(", ")}
                </span>
              ) : (
                "."
              )}
            </div>
            <p className="text-[12.5px] text-ink-2 mt-1 leading-[1.55]">
              Auto-nudge with a personalised message, or auto-assign a
              refresher tied to their role.
            </p>
          </div>
        </div>
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
                  {tabCounts[t.key]}
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
            placeholder="Search name or email"
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
        <Card pad="lg">
          <p className="text-[13px] text-ink-2">
            No employees match the current filter.
          </p>
        </Card>
      ) : (
        <Card pad="sm" className="overflow-hidden p-0 rounded-[12px]">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2 border-b border-border">
              <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
                <th className="px-4 py-[10px]">Learner</th>
                <th className="px-4 py-[10px]">Team</th>
                <th className="px-4 py-[10px]">Role</th>
                <th className="px-4 py-[10px] text-right">Sessions</th>
                <th className="px-4 py-[10px] text-right">Avg score</th>
                <th className="px-4 py-[10px] text-right">Assignments</th>
                <th className="px-4 py-[10px]">Status</th>
                <th className="px-4 py-[10px]">Last active</th>
                <th className="px-4 py-[10px]" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <Row
                  key={e.id}
                  e={e}
                  onEdit={() => setEditTarget(e)}
                  onDelete={() => setDeleteTarget(e)}
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
  e,
  onEdit,
  onDelete,
}: {
  e: EmployeeRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const initial = (e.name ?? e.email).charAt(0).toUpperCase();
  const status = derivedStatus(e);
  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-surface-2 align-middle">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full grid place-items-center text-white text-[12px] font-semibold shrink-0"
            style={{
              background: avatarGradient(e.email),
            }}
          >
            {initial}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-ink text-[13px] truncate">
              {e.name ?? e.email.split("@")[0]}
            </div>
            <div className="text-[11.5px] text-ink-3 font-mono truncate">
              {e.email}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <TeamCell team={e.team} />
      </td>
      <td className="px-4 py-3">
        <RolePill role={e.role} />
      </td>
      <td className="px-4 py-3 text-right font-mono text-ink">
        {e.sessions}
      </td>
      <td className="px-4 py-3 text-right font-mono">
        {e.avgScore != null ? (
          <span
            className={cn(
              "font-semibold",
              e.avgScore >= 70
                ? "text-good"
                : e.avgScore >= 50
                  ? "text-ink"
                  : "text-bad",
            )}
          >
            {e.avgScore}
          </span>
        ) : (
          <span className="text-ink-3">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right font-mono text-ink">
        {e.assignments}
      </td>
      <td className="px-4 py-3">
        <StatusPill status={status} />
      </td>
      <td className="px-4 py-3 text-ink-2 font-mono text-[11.5px] whitespace-nowrap">
        {e.lastActive
          ? new Date(e.lastActive).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          : "—"}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 justify-end">
          <button
            type="button"
            onClick={onEdit}
            title="Edit employee"
            suppressHydrationWarning
            className="p-1.5 rounded-md text-ink-3 hover:text-accent hover:bg-accent-pale transition-colors"
          >
            <Icon name="edit" size={13} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Delete employee"
            suppressHydrationWarning
            className="p-1.5 rounded-md text-ink-3 hover:text-bad hover:bg-bad-pale transition-colors"
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─────────────── ConfirmDeleteModal ───────────────

function ConfirmDeleteModal({
  employee,
  onClose,
}: {
  employee: EmployeeRow;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteEmployee(employee.id);
      if (!result.ok) {
        setError(result.error);
        toast.error("Couldn't delete employee", result.error);
        return;
      }
      toast.success("Employee removed", `${employee.name ?? employee.email} has been deleted.`);
      router.refresh();
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm delete"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-bg border border-border rounded-[12px] w-full max-w-[420px] shadow-xl"
      >
        <div className="px-6 py-5 space-y-3">
          <h2 className="text-[17px] font-semibold text-ink">Delete employee?</h2>
          <p className="text-[13px] text-ink-2 leading-[1.55]">
            <span className="font-semibold text-ink">{employee.name ?? employee.email}</span>{" "}
            will be permanently removed from your roster. This cannot be undone.
          </p>
          {error ? (
            <p className="text-[11.5px] text-bad font-mono break-words">{error}</p>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            suppressHydrationWarning
            className="px-5 py-2 rounded-md border border-border bg-surface text-[13px] font-semibold text-ink-2 hover:text-ink hover:bg-surface-2 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            suppressHydrationWarning
            className="px-5 py-2 rounded-md bg-bad text-white text-[13px] font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────── KPI ───────────────

function Kpi({
  label,
  value,
  delta,
  icon,
  tone,
}: {
  label: string;
  value: string;
  delta?: { dir: "up" | "down" | "neutral"; text: string } | null;
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
  const deltaCls =
    delta?.dir === "up"
      ? "text-good"
      : delta?.dir === "down"
        ? "text-bad"
        : "text-ink-3";
  return (
    <div className="relative bg-surface border border-border rounded-[12px] px-[18px] py-4 flex flex-col gap-1">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {label}
      </div>
      <div className="font-display text-[32px] leading-[1.05] -tracking-[0.01em] mt-1">
        {value}
      </div>
      {delta ? (
        <div
          className={cn(
            "text-[11.5px] inline-flex items-center gap-[3px] mt-[5px] font-mono",
            deltaCls,
          )}
        >
          {delta.dir === "up" ? (
            <span>↑</span>
          ) : delta.dir === "down" ? (
            <span>↓</span>
          ) : null}
          <span>{delta.text}</span>
        </div>
      ) : null}
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

// ─────────────── Team cell ───────────────

function TeamCell({
  team,
}: {
  team: EmployeeRow["team"];
}) {
  if (!team) {
    return <span className="text-[12px] text-ink-3 italic">Unassigned</span>;
  }
  const zone = team.hq?.zone?.name ?? null;
  const hq = team.hq?.name ?? null;
  return (
    <div className="min-w-0">
      <div className="text-[12.5px] text-ink font-semibold truncate">
        {team.name}
      </div>
      {hq || zone ? (
        <div className="text-[11px] text-ink-3 font-mono truncate">
          {[hq, zone].filter(Boolean).join(" · ")}
        </div>
      ) : null}
    </div>
  );
}

// ─────────────── Pills ───────────────

function RolePill({ role }: { role: "admin" | "trainee" }) {
  const cls =
    role === "admin"
      ? "bg-accent-pale text-accent-strong border-accent/20"
      : "bg-surface-2 text-ink-2 border-border";
  return (
    <span
      className={cn(
        "text-[10.5px] font-semibold uppercase tracking-[0.08em] px-[6px] py-[1px] rounded-sm border whitespace-nowrap",
        cls,
      )}
    >
      {role}
    </span>
  );
}

function StatusPill({
  status,
}: {
  status: "active" | "inactive" | "invited" | "suspended" | "new";
}) {
  const map = {
    active: { label: "Active", dot: "bg-good", cls: "bg-good-pale text-good" },
    inactive: { label: "Inactive", dot: "bg-warn", cls: "bg-warn-pale text-warn" },
    invited: { label: "Invited", dot: "bg-ink-3", cls: "bg-surface-2 text-ink-2" },
    suspended: { label: "Suspended", dot: "bg-bad", cls: "bg-bad-pale text-bad" },
    new: { label: "New", dot: "bg-accent", cls: "bg-accent-pale text-accent-strong" },
  } as const;
  const m = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] rounded-full px-[8px] py-[2px] text-[11px] font-semibold whitespace-nowrap",
        m.cls,
      )}
    >
      <span className={cn("w-[6px] h-[6px] rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

// ─────────────── helpers ───────────────

function matchesTab(e: EmployeeRow, tab: Tab): boolean {
  switch (tab) {
    case "all":
      return true;
    case "active":
      return (
        e.lastActive != null &&
        daysSince(e.lastActive) < ACTIVE_WINDOW_DAYS
      );
    case "at_risk":
      return (
        e.role === "trainee" &&
        e.avgScore != null &&
        e.avgScore < AT_RISK_SCORE
      );
    case "new":
      return daysSince(e.createdAt) < NEW_WINDOW_DAYS;
    case "admins":
      return e.role === "admin";
  }
}

function derivedStatus(
  e: EmployeeRow,
): "active" | "inactive" | "invited" | "suspended" | "new" {
  if (e.status === "suspended") return "suspended";
  if (e.status === "invited") return "invited";
  if (daysSince(e.createdAt) < NEW_WINDOW_DAYS) return "new";
  if (
    e.lastActive != null &&
    daysSince(e.lastActive) >= INACTIVE_WINDOW_DAYS
  )
    return "inactive";
  return "active";
}

function daysSince(d: Date): number {
  return (Date.now() - new Date(d).getTime()) / (24 * 60 * 60 * 1000);
}

function countWithinDays(
  rows: EmployeeRow[],
  field: "lastActive" | "createdAt",
  days: number,
): number {
  return rows.filter((r) => {
    const v = r[field];
    if (!v) return false;
    return daysSince(v) < days;
  }).length;
}

function countOlderThan(
  rows: EmployeeRow[],
  field: "lastActive" | "createdAt",
  days: number,
): number {
  return rows.filter((r) => {
    const v = r[field];
    if (!v) return false;
    return daysSince(v) >= days;
  }).length;
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
