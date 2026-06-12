// /admin/trainings/[id]/modules/new/activity
//
// "Create New Activity Module" intermediate screen — same role as
// CreateAssessmentPage / CreateCoachPage / CreateRoleplayPage. Admin
// picks a duration preset (Short / Medium / Long) and writes a
// learning-goals prompt before the gamified module is persisted.
//
//   - "Create Manually" → server action persists with literal inputs,
//     routes to the per-module edit page.
//   - "Generate"        → POST /api/admin/create-activity/generate to
//     have AI expand the brief into a structured activity body.
//   - "Use Template"    → seeds the textarea with a starter prompt.
//   - "+"               → clears the textarea.

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createActivityModule } from "@/app/admin/trainings/actions";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

type Duration = "short" | "medium" | "long";

const DURATIONS: { key: Duration; label: string; mins: number }[] = [
  { key: "short", label: "Short", mins: 3 },
  { key: "medium", label: "Medium", mins: 5 },
  { key: "long", label: "Long", mins: 7 },
];

const TEMPLATE = `The learner will work through 2–3 short exercises that exercise:

- Decision-making under realistic pressure
- Applying a framework or model to a concrete situation
- Spotting and correcting common mistakes

Style: scenario-based, branching choices, immediate feedback on each step.`;

export function CreateActivityPage({
  trainingId,
  trainingTitle,
}: {
  trainingId: string;
  trainingTitle: string;
}) {
  const [duration, setDuration] = useState<Duration>("short");
  const [prompt, setPrompt] = useState("");
  const [pending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const canGenerate = prompt.trim().length > 0 && !pending && !generating;

  function createManually() {
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await createActivityModule(trainingId, {
          duration,
          prompt,
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
      const res = await fetch("/api/admin/create-activity/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainingId,
          duration,
          prompt,
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
          <span className="text-accent">Activity</span> Module
        </h2>
      </div>

      {/* Form card */}
      <div className="bg-surface border border-border rounded-[12px] p-5 md:p-6 space-y-5">
        {/* Duration */}
        <div className="space-y-2">
          <div className="text-[13px] font-semibold text-ink">
            Duration (Number of Activities)
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {DURATIONS.map((d) => (
              <DurationCard
                key={d.key}
                selected={duration === d.key}
                onClick={() => setDuration(d.key)}
                label={`${d.label} (${d.mins} mins)`}
              />
            ))}
          </div>
        </div>

        {/* Learning Goals & Exercises */}
        <div className="space-y-2">
          <div className="text-[13px] font-semibold text-ink">
            Learning Goals &amp; Exercises
          </div>
          <FloatingPromptField
            value={prompt}
            onChange={setPrompt}
            placeholder="Ex: Describe the task, exercise, or practice activity the learner should perform to apply the skills or knowledge."
          />
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPrompt("")}
              aria-label="Clear prompt"
              suppressHydrationWarning
              className="w-9 h-9 grid place-items-center rounded-full border border-border bg-surface text-ink-3 hover:text-ink"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setPrompt(TEMPLATE)}
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

function DurationCard({
  selected,
  onClick,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="radio"
      aria-checked={selected}
      suppressHydrationWarning
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-md border-2 text-[13px] font-semibold transition-colors text-left",
        selected
          ? "border-accent bg-surface text-ink"
          : "border-border bg-surface text-ink-3 hover:border-accent-pale",
      )}
    >
      <span
        className={cn(
          "w-4 h-4 rounded-full border-2 grid place-items-center shrink-0",
          selected ? "border-accent" : "border-border-strong",
        )}
      >
        {selected ? <span className="w-2 h-2 rounded-full bg-accent" /> : null}
      </span>
      <span className={cn("flex-1", !selected && "text-ink-3")}>{label}</span>
    </button>
  );
}

// Material-style outlined field with a floating "Prompt *" label
// notched into the top border — matches the screenshot.
function FloatingPromptField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 -top-2 px-1 bg-surface text-[10.5px] font-medium text-ink-3 z-10 pointer-events-none">
        Prompt <span className="text-accent">*</span>
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        placeholder={placeholder}
        className="w-full bg-surface border border-border-strong rounded-md px-3 pt-3 pb-2.5 text-[13px] focus:outline-none focus:border-accent resize-y leading-relaxed"
        suppressHydrationWarning
      />
    </div>
  );
}
