// Wizard stepper — visual progress + clickable jump (server action).

"use client";

import { useTransition } from "react";
import { goToStep } from "@/app/admin/trainings/actions";
import { cn } from "@/lib/cn";

const STEPS = [
  { n: 1, label: "Basic Details" },
  { n: 2, label: "Modules" },
  { n: 3, label: "Assign" },
  { n: 4, label: "Settings" },
];

export function Stepper({
  trainingId,
  current,
}: {
  trainingId: string;
  current: number;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((s, i) => {
        const active = s.n === current;
        const done = s.n < current;
        return (
          <li key={s.n} className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(() => {
                  void goToStep(trainingId, s.n);
                })
              }
              suppressHydrationWarning
              className={cn(
                "flex items-center gap-2 px-2 py-1 rounded-md text-[12.5px]",
                "transition-colors",
                active
                  ? "text-ink font-semibold"
                  : done
                    ? "text-ink-2 hover:text-ink"
                    : "text-ink-3 hover:text-ink-2",
              )}
            >
              <span
                className={cn(
                  "inline-grid place-items-center w-[22px] h-[22px] rounded-full text-[11px] font-mono",
                  active
                    ? "bg-accent text-white"
                    : done
                      ? "bg-ink text-white"
                      : "bg-surface-2 border border-border text-ink-3",
                )}
              >
                {done ? "✓" : s.n}
              </span>
              <span className="truncate">{s.label}</span>
            </button>
            {i < STEPS.length - 1 ? (
              <span
                className={cn(
                  "h-px w-6",
                  done ? "bg-ink" : "bg-border",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
