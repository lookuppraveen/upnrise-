"use client";

// Client-side "wait for the grader" affordance.
//
// The /end route returns the results-page URL as soon as the session is
// marked ended, then finishes scoring via after(). That means the trainee
// lands here before Claude has written the score — score/rubricScores are
// still null. This component detects that state and calls router.refresh()
// on a short interval until the score lands (or the poll cap is hit),
// re-fetching the server-rendered page each tick.
//
// Renders a soft banner + a fixed-position "Grading…" pill so the page
// doesn't look silently broken while the transcript is already visible.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AIBadge } from "@/components/ui/AIBadge";
import { Icon } from "@/components/ui/Icon";

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 15;

export function GradingPoll({ scored }: { scored: boolean }) {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (scored) return;
    if (attempts >= MAX_ATTEMPTS) return;
    const t = setTimeout(() => {
      setAttempts((n) => n + 1);
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [scored, attempts, router]);

  if (scored) return null;

  const timedOut = attempts >= MAX_ATTEMPTS;

  return (
    <>
      <div
        className="flex items-start gap-3 rounded-[var(--r-md)] border px-4 py-3.5"
        style={{
          background: "var(--ai-grad-soft)",
          borderColor: "rgba(232,93,58,0.2)",
        }}
      >
        <span
          aria-hidden
          className="w-8 h-8 grid place-items-center rounded-md text-white shrink-0 mt-0.5"
          style={{ background: "var(--ai-grad)" }}
        >
          <Icon name="ai-sparkle" size={14} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[13px] font-semibold text-ink">
              {timedOut ? "Still grading" : "Grading your session"}
            </span>
            <AIBadge>AI</AIBadge>
          </div>
          <p className="text-[12.5px] text-ink-2 leading-snug">
            {timedOut
              ? "Your score is taking longer than usual. Your transcript is safe — refresh in a moment to see the score."
              : "Your transcript is ready below. Score and coaching feedback will appear shortly."}
          </p>
        </div>
        {!timedOut ? (
          <span
            aria-hidden
            className="w-4 h-4 rounded-full border-2 border-accent border-r-transparent animate-spin shrink-0 mt-1"
          />
        ) : null}
      </div>
    </>
  );
}
