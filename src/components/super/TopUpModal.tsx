// Top up credits modal — used on /super/credits row actions and Company
// Detail. Inserts a positive ledger entry + audits as the operator.

"use client";

import { useState, useTransition } from "react";
import { topUpCredits } from "@/app/super/credits/actions";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

const PRESETS = [500, 1000, 2500, 5000];

export function TopUpModal({
  companyId,
  companyName,
  trigger = "button",
  size = "sm",
}: {
  companyId: string;
  companyName: string;
  /** "button" = compact secondary button; "primary" = filled accent button. */
  trigger?: "button" | "primary";
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number>(1000);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setAmount(1000);
    setReason("");
    setError(null);
  }

  function confirm() {
    setError(null);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }
    startTransition(async () => {
      try {
        await topUpCredits({
          companyId,
          amount: Math.round(amount),
          reason: reason.trim() || undefined,
        });
        setOpen(false);
        reset();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <>
      {trigger === "primary" ? (
        <Button variant="secondary" size={size} onClick={() => setOpen(true)}>
          Add credits
        </Button>
      ) : (
        <Button variant="secondary" size={size} onClick={() => setOpen(true)}>
          Top up
        </Button>
      )}

      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
        >
          <div className="bg-surface border border-border rounded-lg shadow-md w-full max-w-[440px] p-5 space-y-4">
            <header className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 grid place-items-center rounded-md bg-accent-pale text-accent-strong">
                  <Icon name="credit-card" size={14} />
                </div>
                <h2 className="font-display text-[20px] leading-tight">
                  Top up credits
                </h2>
              </div>
              <p className="text-[12.5px] text-ink-2">
                Grant additional credits to{" "}
                <span className="text-ink font-semibold">{companyName}</span>.
                Written to the ledger and attributed to you in the audit log.
              </p>
            </header>

            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                Amount
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setAmount(p)}
                    className={cn(
                      "text-[12px] font-mono px-2.5 py-1 rounded-md border",
                      amount === p
                        ? "border-accent bg-accent-pale text-accent-strong"
                        : "border-border bg-surface text-ink-2 hover:bg-surface-2",
                    )}
                  >
                    +{p.toLocaleString()}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={1}
                max={1_000_000}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[13px] font-mono focus:outline-none focus:border-accent"
                suppressHydrationWarning
              />
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                Reason (optional)
              </div>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Trial extension, comp for outage"
                maxLength={200}
                className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
                suppressHydrationWarning
              />
            </div>

            {error ? (
              <div className="text-[12px] text-bad font-mono">{error}</div>
            ) : null}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="md"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
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
                {pending
                  ? "Adding…"
                  : `Add ${amount > 0 ? amount.toLocaleString() : "0"} credits`}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
