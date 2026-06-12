"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEmployee } from "@/app/admin/employees/actions";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import type { TeamOption } from "@/components/admin/EmployeesView";
import type { ManagerOption } from "@/components/admin/AddTraineeModal";
import type { EmployeeRow } from "@/components/admin/EmployeesView";

export function EditEmployeeModal({
  employee,
  teams,
  managers,
  onClose,
}: {
  employee: EmployeeRow;
  teams: TeamOption[];
  managers: ManagerOption[];
  onClose: () => void;
}) {
  const [name, setName] = useState(employee.name ?? "");
  const [role, setRole] = useState<"trainee" | "admin">(employee.role);
  const [teamId, setTeamId] = useState(employee.team?.id ?? "");
  const [managerId, setManagerId] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await updateEmployee({
        userId: employee.id,
        name: name.trim() || undefined,
        role,
        teamId: teamId || null,
        managerId: managerId || null,
        employeeCode: employeeCode.trim() || null,
        designation: designation.trim() || null,
        department: department.trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
        toast.error("Couldn't update employee", result.error);
        return;
      }
      toast.success("Employee updated", "Changes saved successfully.");
      router.refresh();
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Edit employee"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-bg border border-border rounded-[12px] w-full max-w-[640px] my-4 shadow-xl flex flex-col max-h-[92vh]"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border gap-3">
          <div>
            <h2 className="text-[18px] font-semibold text-ink">Edit employee</h2>
            <p className="text-[11.5px] text-ink-3 mt-0.5">
              {employee.name ?? employee.email}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-3 hover:text-ink text-[20px] leading-none px-1"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Email">
              <input
                type="email"
                value={employee.email}
                readOnly
                className="w-full bg-surface-2 border border-border rounded-md px-3 py-2.5 text-[13px] text-ink-3 cursor-not-allowed"
                suppressHydrationWarning
              />
            </Field>
            <Field label="Full name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
                autoFocus
                className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent"
                suppressHydrationWarning
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Role">
              <RoleToggle value={role} onChange={setRole} />
            </Field>
            <Field label="Team">
              <Select
                value={teamId}
                onChange={setTeamId}
                options={[
                  { value: "", label: "— Unassigned —" },
                  ...teams.map((t) => ({ value: t.id, label: t.name })),
                ]}
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Reporting manager">
              <Select
                value={managerId}
                onChange={setManagerId}
                options={[
                  { value: "", label: "— No manager —" },
                  ...managers
                    .filter((m) => m.id !== employee.id)
                    .map((m) => ({
                      value: m.id,
                      label: m.name ? `${m.name} (${m.email})` : m.email,
                    })),
                ]}
              />
            </Field>
            <div />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Employee code">
              <input
                type="text"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                placeholder="Optional"
                className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent"
                suppressHydrationWarning
              />
            </Field>
            <Field label="Designation">
              <input
                type="text"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="e.g. Sales Rep"
                className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent"
                suppressHydrationWarning
              />
            </Field>
            <Field label="Department">
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Outbound"
                className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent"
                suppressHydrationWarning
              />
            </Field>
          </div>

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
            onClick={submit}
            disabled={pending}
            suppressHydrationWarning
            className="px-5 py-2 rounded-md bg-accent text-white text-[13px] font-semibold hover:bg-accent-strong disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[12.5px] font-semibold text-ink">{label}</span>
      {children}
    </label>
  );
}

function RoleToggle({
  value,
  onChange,
}: {
  value: "trainee" | "admin";
  onChange: (v: "trainee" | "admin") => void;
}) {
  return (
    <div className="inline-flex items-center bg-surface-2 border border-border rounded-md p-0.5">
      <button
        type="button"
        onClick={() => onChange("trainee")}
        suppressHydrationWarning
        className={cn(
          "px-3 py-1.5 rounded text-[12px] font-semibold transition-colors",
          value === "trainee" ? "bg-accent text-white" : "text-ink-2 hover:text-ink",
        )}
      >
        Trainee
      </button>
      <button
        type="button"
        onClick={() => onChange("admin")}
        suppressHydrationWarning
        className={cn(
          "px-3 py-1.5 rounded text-[12px] font-semibold transition-colors",
          value === "admin" ? "bg-accent text-white" : "text-ink-2 hover:text-ink",
        )}
      >
        Admin
      </button>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent pr-9"
        suppressHydrationWarning
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon
        name="chevron-down"
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3"
      />
    </div>
  );
}
