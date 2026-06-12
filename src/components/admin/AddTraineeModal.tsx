// Add Trainee modal — opens from the "+ Add trainee" button in
// EmployeesView. Captures the minimum fields needed for the roster
// row and any optional HRIS-style metadata the existing employee
// table surfaces (team, employee code, designation, department).
//
// The actual sign-in / Supabase Auth wiring is a follow-up. This
// modal's only job is to create a User row with status="invited" via
// the inviteTrainee server action. The row shows up immediately in
// the employees list and can be assigned to trainings in the wizard.

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteTrainee } from "@/app/admin/employees/actions";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

export type TeamOption = { id: string; name: string };
export type ManagerOption = { id: string; name: string; email: string };

export function AddTraineeModal({
  teams,
  managers,
  onClose,
}: {
  teams: TeamOption[];
  managers: ManagerOption[];
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"trainee" | "admin">("trainee");
  const [teamId, setTeamId] = useState<string>("");
  const [managerId, setManagerId] = useState<string>("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [success, setSuccess] = useState<{
    inviteUrl: string;
    expiresAt: string;
    name: string;
    email: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
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
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Email is required.");
      return;
    }
    startTransition(async () => {
      const result = await inviteTrainee({
        email: trimmedEmail,
        name: name.trim() || undefined,
        role,
        teamId: teamId || undefined,
        managerId: managerId || undefined,
        employeeCode: employeeCode.trim() || undefined,
        designation: designation.trim() || undefined,
        department: department.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        toast.error("Couldn't add trainee", result.error);
        return;
      }
      toast.success("Trainee added", "Share the invite link to get them in.");
      router.refresh();
      setSuccess({
        inviteUrl: result.inviteUrl,
        expiresAt: result.expiresAt,
        name: name.trim() || trimmedEmail,
        email: trimmedEmail,
      });
    });
  }

  async function copyLink() {
    if (!success) return;
    try {
      await navigator.clipboard.writeText(success.inviteUrl);
      setCopied(true);
      // Reset the "Copied" pill after a moment so a second click still
      // gives a visual confirmation.
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Older browsers / non-secure contexts — fall back to selection.
      const el = document.getElementById(
        "invite-url-readonly",
      ) as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.select();
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Add trainee"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-bg border border-border rounded-[12px] w-full max-w-[640px] my-4 shadow-xl flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border gap-3">
          <div>
            <h2 className="text-[18px] font-semibold text-ink">
              {success ? "Invite link ready" : "Add trainee"}
            </h2>
            <p className="text-[11.5px] text-ink-3 mt-0.5">
              {success
                ? "Share this link with the trainee. It expires in 7 days."
                : "Adds a roster row and mints a 7-day invite link you can share."}
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

        {/* Body — success panel after invite is minted */}
        {success ? (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="rounded-[10px] border border-good/30 bg-good-pale/40 p-3 flex items-start gap-3">
              <div className="text-good text-[16px] leading-none mt-0.5">
                ✓
              </div>
              <div className="text-[12.5px] text-ink leading-[1.5]">
                <span className="font-semibold">{success.name}</span> added to
                your roster as Invited. Share the link below — it activates
                their account when they open it.
              </div>
            </div>

            <label className="block space-y-1.5">
              <span className="block text-[12.5px] font-semibold text-ink">
                Invite link
              </span>
              <div className="flex items-stretch gap-2">
                <input
                  id="invite-url-readonly"
                  type="text"
                  value={success.inviteUrl}
                  readOnly
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-w-0 bg-surface-2 border border-border-strong rounded-md px-3 py-2.5 text-[12.5px] font-mono focus:outline-none focus:border-accent"
                  suppressHydrationWarning
                />
                <button
                  type="button"
                  onClick={copyLink}
                  suppressHydrationWarning
                  className={cn(
                    "px-3.5 py-2 rounded-md text-[12.5px] font-semibold border transition-colors shrink-0",
                    copied
                      ? "bg-good text-white border-good"
                      : "bg-accent text-white border-accent hover:bg-accent-strong",
                  )}
                >
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
              <p className="text-[11px] text-ink-3">
                Expires {new Date(success.expiresAt).toLocaleString()}.
              </p>
            </label>

            <div className="rounded-[10px] border border-border bg-surface-2/50 p-3 text-[11.5px] text-ink-3 leading-[1.55]">
              <span className="font-semibold text-ink-2">Next step:</span>{" "}
              email delivery isn&apos;t wired yet — share this link manually
              (Slack, SMS, email) and the trainee will be prompted to set a
              password and signed in automatically.
            </div>
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Email *">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                autoFocus
                className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent"
                suppressHydrationWarning
              />
            </Field>
            <Field label="Full name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
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
                placeholder={
                  teams.length === 0
                    ? "No teams yet — create one in Settings"
                    : undefined
                }
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
                  ...managers.map((m) => ({
                    value: m.id,
                    label: m.name ? `${m.name} (${m.email})` : m.email,
                  })),
                ]}
                placeholder={
                  managers.length === 0
                    ? "No company admins to assign yet"
                    : undefined
                }
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
            <p className="text-[11.5px] text-bad font-mono break-words">
              {error}
            </p>
          ) : null}
        </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          {success ? (
            <button
              type="button"
              onClick={onClose}
              suppressHydrationWarning
              className="px-5 py-2 rounded-md bg-accent text-white text-[13px] font-semibold hover:bg-accent-strong"
            >
              Done
            </button>
          ) : (
            <>
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
                {pending ? "Adding…" : "Add trainee"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[12.5px] font-semibold text-ink">
        {label}
      </span>
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
          value === "trainee"
            ? "bg-accent text-white"
            : "text-ink-2 hover:text-ink",
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
          value === "admin"
            ? "bg-accent text-white"
            : "text-ink-2 hover:text-ink",
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
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
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
      {placeholder && options.length === 1 ? (
        <p className="text-[11px] text-ink-3 mt-1">{placeholder}</p>
      ) : null}
    </div>
  );
}
