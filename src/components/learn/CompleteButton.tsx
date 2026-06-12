// Trainee module completion button. Used by video + document module
// sections. Disabled (with green check) when the module is already done;
// firing the server action when fresh causes a redirect back to the
// training detail page so the progress bar updates instantly.

"use client";

import { useTransition } from "react";
import { markModuleComplete } from "@/app/learn/trainings/[id]/modules/[mid]/actions";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export function CompleteButton({
  moduleId,
  done,
  label,
  scorePct,
}: {
  moduleId: string;
  done: boolean;
  label: string;
  scorePct?: number;
}) {
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(() => {
      void markModuleComplete({
        moduleId,
        ...(scorePct != null ? { scorePct } : {}),
      });
    });
  }

  if (done) {
    return (
      <div className="inline-flex items-center gap-2 text-[13px] font-semibold text-good">
        <span className="w-5 h-5 rounded-full bg-good text-white grid place-items-center">
          <Icon name="play" size={11} />
        </span>
        {label}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={submit}
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-1.5 px-4 py-2 rounded-md",
        "bg-accent text-white text-[13px] font-semibold",
        "hover:bg-accent-strong disabled:opacity-60",
      )}
    >
      <Icon name="ai-sparkle" size={12} />
      {pending ? "Saving…" : label}
    </button>
  );
}
