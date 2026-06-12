// Impersonate modal — triggered from Company Detail. Lets the super_admin
// pick a role to assume and confirms the action.

"use client";

import { useState, useTransition } from "react";
import { startImpersonation } from "@/app/super/companies/[id]/impersonate-actions";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export function ImpersonateModal({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"admin" | "trainee">("admin");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        await startImpersonation({ companyId, asRole: role });
        // redirect happens server-side
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <>
      <Button variant="accent" size="md" onClick={() => setOpen(true)}>
        Impersonate
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-surface border border-border rounded-lg shadow-md w-full max-w-[480px] p-5 space-y-4">
            <header className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 grid place-items-center rounded-md bg-warn-pale text-warn">
                  <Icon name="shield" size={14} />
                </div>
                <h2 className="font-display text-[20px] leading-tight">
                  Impersonate {companyName}
                </h2>
              </div>
              <p className="text-[12.5px] text-ink-2">
                Assume the identity of a user in this tenant. Every action you
                take will be recorded in the audit log under your account.
              </p>
            </header>

            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                Assume role
              </div>
              <div className="grid grid-cols-2 gap-2">
                <RoleOption
                  active={role === "admin"}
                  onClick={() => setRole("admin")}
                  title="Admin"
                  description="Full tenant access. See trainings, employees, copilot."
                />
                <RoleOption
                  active={role === "trainee"}
                  onClick={() => setRole("trainee")}
                  title="Trainee"
                  description="Learner view. See assigned trainings, sessions, coach."
                />
              </div>
            </div>

            <div className="text-[11.5px] text-bad bg-bad-pale border border-bad/20 rounded-md p-2.5 leading-snug">
              <span className="font-semibold uppercase tracking-[0.08em] text-[10.5px]">
                Heads up
              </span>{" "}
              · Your session expires in 60 minutes. You won't be able to access
              the super-admin surface until you stop impersonating. Audit
              writes attribute to you.
            </div>

            {error ? (
              <div className="text-[12px] text-bad font-mono">{error}</div>
            ) : null}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="md"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                variant="accent"
                size="md"
                onClick={confirm}
                disabled={pending}
              >
                {pending ? "Starting…" : `Impersonate as ${role}`}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function RoleOption({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left p-3 rounded-md border transition-colors",
        active
          ? "border-accent bg-accent-pale/40"
          : "border-border bg-surface hover:bg-surface-2",
      )}
    >
      <div className="font-semibold text-[13.5px] text-ink">{title}</div>
      <div className="text-[11.5px] text-ink-3 mt-0.5">{description}</div>
    </button>
  );
}
