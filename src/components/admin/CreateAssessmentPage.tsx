// /admin/trainings/[id]/modules/new/assessment
//
// "Create New Assessment Module" intermediate screen — same role as
// CreateCoachPage / CreateRoleplayPage. Admin picks a question count
// pill and writes a scope/criteria blurb before the assessment is
// persisted, so the AI generation pass has a tight brief.
//
//   - "Create Manually" → server action persists an empty quiz, routes
//     to the per-module edit page so the admin can author by hand.
//   - "Generate"        → POST /api/admin/create-assessment/generate
//     and the AI drafts the requested number of MCQs.
//   - "Use Template"    → seeds the textarea with a starter scope.
//   - "+"               → clears the textarea.

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createAssessmentModule } from "@/app/admin/trainings/actions";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

const COUNT_OPTIONS = [5, 10, 15, 20, 25, 30, 50] as const;
const TEMPLATE = `Generate questions covering:

- Core concepts & terminology
- Real-world scenarios & decision-making
- Common pitfalls and how to avoid them

Difficulty: mixed (3 easy, 6 medium, rest hard).
Question style: scenario-based MCQs, 4 options each.`;

export function CreateAssessmentPage({
  trainingId,
  trainingTitle,
}: {
  trainingId: string;
  trainingTitle: string;
}) {
  const [count, setCount] = useState<number>(15);
  const [scope, setScope] = useState("");
  const [pending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const canGenerate = scope.trim().length > 0 && !pending && !generating;

  function createManually() {
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await createAssessmentModule(trainingId, {
          numberOfQuestions: count,
          scopeAndCriteria: scope,
        });
        toast.success("Module created");
        router.push(`/admin/trainings/${trainingId}/modules/${id}/edit`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to create module";
        setError(msg);
        toast.error("Create failed", msg);
      }
    });
  }

  async function generate() {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/create-assessment/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainingId,
          numberOfQuestions: count,
          scopeAndCriteria: scope,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `generate failed: ${res.status}`);
      }
      const { id } = (await res.json()) as { id: string };
      toast.success("AI draft created");
      router.push(`/admin/trainings/${trainingId}/modules/${id}/edit`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      setError(msg);
      toast.error("Generate failed", msg);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Edit Training header */}
      <h1 className="font-display text-[22px] text-accent">
        Edit Training -{" "}
        <span className="font-semibold">{trainingTitle}</span>
      </h1>

      {/* Back link + Create Manually */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/admin/trainings/${trainingId}/edit?step=2`}
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink"
        >
          <Icon name="chevron-right" size={12} className="rotate-180" />
          Back to Modules
        </Link>
        <button
          type="button"
          onClick={createManually}
          disabled={pending || generating}
          suppressHydrationWarning
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-accent text-accent text-[12.5px] font-semibold hover:bg-accent-pale/30 disabled:opacity-60"
        >
          <Icon name="wand" size={11} />
          Create Manually
        </button>
      </div>

      {/* Title */}
      <div className="text-center">
        <h2 className="font-display text-[26px] leading-tight">
          Create New{" "}
          <span className="text-accent">Assessment</span> Module
        </h2>
      </div>

      {/* Form card */}
      <div className="bg-surface border border-border rounded-[12px] p-5 md:p-6 space-y-5">
        {/* Number of Questions */}
        <div className="space-y-2">
          <div className="text-[13px] font-semibold text-ink">
            Number of Questions
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {COUNT_OPTIONS.map((n) => (
              <CountPill
                key={n}
                value={n}
                selected={count === n}
                onClick={() => setCount(n)}
              />
            ))}
          </div>
        </div>

        {/* Scope & Criteria */}
        <label className="block space-y-1.5">
          <span className="block text-[13px] font-semibold text-ink">
            Scope &amp; Criteria
          </span>
          <textarea
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            rows={5}
            placeholder="Ex: Describe the criteria, competencies, or topics to be evaluated and the type of assessment items to generate."
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent resize-y leading-relaxed"
            suppressHydrationWarning
          />
        </label>

        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setScope("")}
              aria-label="Clear scope"
              suppressHydrationWarning
              className="w-9 h-9 grid place-items-center rounded-full border border-border bg-surface text-ink-3 hover:text-ink"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setScope(TEMPLATE)}
              disabled={pending || generating}
              suppressHydrationWarning
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-strong disabled:opacity-60"
            >
              <Icon name="layers" size={11} />
              Use Template
            </button>
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={!canGenerate}
            suppressHydrationWarning
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-[12.5px] font-semibold transition-colors",
              canGenerate
                ? "bg-accent text-white hover:bg-accent-strong"
                : "bg-accent-pale text-white/80 cursor-not-allowed",
            )}
          >
            <Icon name="ai-sparkle" size={11} />
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>

        {error ? (
          <p className="text-[11.5px] text-bad font-mono">{error}</p>
        ) : null}
      </div>
    </div>
  );
}

function CountPill({
  value,
  selected,
  onClick,
}: {
  value: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="radio"
      aria-checked={selected}
      suppressHydrationWarning
      className={cn(
        "min-w-[68px] px-4 py-2 rounded-md border-2 text-[14px] font-semibold transition-colors flex items-center justify-center gap-1.5",
        selected
          ? "border-accent text-accent bg-surface"
          : "border-border text-ink-3 bg-surface hover:border-accent-pale",
      )}
    >
      {selected ? (
        <span
          className="w-3 h-3 rounded-full border-2 border-accent grid place-items-center"
          aria-hidden
        >
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
        </span>
      ) : null}
      {value}
    </button>
  );
}
