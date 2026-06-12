// Tiny client toggle for the Users table — suspend / reinstate via server
// action with confirmation on suspend.

"use client";

import { useState, useTransition } from "react";
import { setUserStatus } from "@/app/super/users/actions";
import { cn } from "@/lib/cn";

export function UserStatusToggle({
  userId,
  status,
}: {
  userId: string;
  status: "active" | "suspended";
}) {
  const [pending, startTransition] = useTransition();
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(next: "active" | "suspended") {
    setError(null);
    startTransition(async () => {
      try {
        await setUserStatus({ userId, status: next });
        setConfirmSuspend(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  if (status === "suspended") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => toggle("active")}
        className={cn(
          "text-[11.5px] font-semibold text-good hover:text-good/80 px-2 py-1 rounded-md hover:bg-good-pale",
          "disabled:opacity-50",
        )}
      >
        {pending ? "…" : "Reinstate"}
      </button>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {error ? (
        <span className="text-[10.5px] text-bad font-mono">{error}</span>
      ) : null}
      {confirmSuspend ? (
        <>
          <button
            type="button"
            onClick={() => setConfirmSuspend(false)}
            className="text-[11px] text-ink-3 hover:text-ink px-2 py-1 rounded-md hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => toggle("suspended")}
            className="text-[11.5px] font-semibold text-white px-2 py-1 rounded-md bg-bad hover:bg-bad/90"
          >
            {pending ? "…" : "Confirm"}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmSuspend(true)}
          className="text-[11.5px] text-ink-3 hover:text-bad px-2 py-1 rounded-md hover:bg-bad-pale"
        >
          Suspend
        </button>
      )}
    </div>
  );
}
