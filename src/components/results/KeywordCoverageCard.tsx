// KeywordCoverageCard — small chip list that shows which of the
// admin-configured keywords the learner actually used in their turns.
// Renders a header percent (e.g. "67%") so it can sit next to the
// section title on the results page.
//
// Server component — no interactivity.

import { cn } from "@/lib/cn";
import type { KeywordCoverage } from "@/lib/roleplay/results";

export function KeywordCoverageCard({
  coverage,
}: {
  coverage: KeywordCoverage;
}) {
  if (coverage.total === 0) {
    return (
      <p className="text-[12px] text-ink-3 italic">
        No keywords were set on this module.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {coverage.entries.map((e) => (
        <span
          key={e.keyword}
          className={cn(
            "inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-full border",
            e.hit
              ? "bg-good-pale border-good/30 text-good"
              : "bg-surface-2 border-border text-ink-3",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "inline-block w-3.5 h-3.5 grid place-items-center rounded-full text-[8px] font-bold",
              e.hit ? "bg-good text-white" : "bg-border text-ink-3",
            )}
          >
            {e.hit ? "✓" : "×"}
          </span>
          {e.keyword}
        </span>
      ))}
    </div>
  );
}
