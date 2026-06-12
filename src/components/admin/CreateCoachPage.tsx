// /admin/trainings/[id]/modules/new/coach
//
// "Create New Coach Module" intermediate screen — same role as
// CreateRoleplayPage. Admin picks Training Usecase + Type of Coach
// and provides an objective/context blurb before the Coach module is
// persisted, so the AI generation pass has the right framing from the
// start.
//
//   - "Create Manually" → server action persists with literal inputs,
//     routes to the edit page.
//   - "Generate"        → POST /api/admin/create-coach/generate to
//     have AI flesh out the module body, then route to edit page.
//   - "+"               → clears the textarea.

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createCoachModule } from "@/app/admin/trainings/actions";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

type TrainingUsecase = "sales" | "fundamental";
type CoachType = "normal" | "ppt";

export function CreateCoachPage({
  trainingId,
  trainingTitle,
}: {
  trainingId: string;
  trainingTitle: string;
}) {
  const [usecase, setUsecase] = useState<TrainingUsecase>("sales");
  const [coachType, setCoachType] = useState<CoachType>("ppt");
  const [objective, setObjective] = useState("");
  const [pending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function createManually() {
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await createCoachModule(trainingId, {
          trainingUsecase: usecase,
          typeOfCoach: coachType,
          objectiveContext: objective,
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
      const res = await fetch("/api/admin/create-coach/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainingId,
          trainingUsecase: usecase,
          typeOfCoach: coachType,
          objectiveContext: objective,
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
          <span className="text-accent">Coach</span> Module
        </h2>
      </div>

      {/* Form card */}
      <div className="bg-surface border border-border rounded-[12px] p-5 md:p-6 space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-[13px] font-semibold text-ink">
              Training Usecase
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <RadioCard
                checked={usecase === "sales"}
                onChange={() => setUsecase("sales")}
                label="Sales Training"
              />
              <RadioCard
                checked={usecase === "fundamental"}
                onChange={() => setUsecase("fundamental")}
                label="Fundamental Training"
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-[13px] font-semibold text-ink">
              Type of Coach
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <RadioCard
                checked={coachType === "normal"}
                onChange={() => setCoachType("normal")}
                label="Normal"
              />
              <RadioCard
                checked={coachType === "ppt"}
                onChange={() => setCoachType("ppt")}
                label="PPT"
              />
            </div>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="block text-[13px] font-semibold text-ink">
            Coach Objective &amp; Context
          </span>
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={7}
            placeholder="Ex: Describe what the coach should teach or guide the user…"
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent resize-y leading-relaxed"
            suppressHydrationWarning
          />
        </label>

        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <button
            type="button"
            onClick={() => setObjective("")}
            aria-label="Clear objective"
            suppressHydrationWarning
            className="w-9 h-9 grid place-items-center rounded-full border border-border bg-surface text-ink-3 hover:text-ink"
          >
            +
          </button>
          <button
            type="button"
            onClick={generate}
            disabled={pending || generating}
            suppressHydrationWarning
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#a78bfa] text-white text-[12.5px] font-semibold hover:bg-[#8b6cf0] disabled:opacity-60"
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

function RadioCard({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      role="radio"
      aria-checked={checked}
      suppressHydrationWarning
      className={cn(
        "flex items-center gap-2 px-3 py-2.5 rounded-md border-2 text-[13px] font-semibold transition-colors",
        checked
          ? "border-accent text-ink bg-surface"
          : "border-border text-ink-2 bg-surface hover:border-accent-pale",
      )}
    >
      <span
        className={cn(
          "w-4 h-4 rounded-full border-2 grid place-items-center shrink-0",
          checked ? "border-accent" : "border-border-strong",
        )}
      >
        {checked ? <span className="w-2 h-2 rounded-full bg-accent" /> : null}
      </span>
      <span className={cn("flex-1 text-left", !checked && "text-ink-3")}>
        {label}
      </span>
    </button>
  );
}
