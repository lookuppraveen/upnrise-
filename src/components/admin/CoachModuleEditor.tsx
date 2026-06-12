// Coach per-module editor — replaces the Document fallback for
// modules with body.kind === "coach".
//
// Body shape:
//   { kind: "coach",
//     coachConfig: { trainingUsecase, typeOfCoach, objectiveContext,
//                    outline, guidance } }
//
// One Save call writes name + published + the full coachConfig
// through saveCoachModule.

"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteModule,
  saveCoachModule,
} from "@/app/admin/trainings/actions";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import {
  deepEqualJson,
  useUnsavedChangesGuard,
} from "@/hooks/useUnsavedChangesGuard";
import { cn } from "@/lib/cn";

type CoachConfig = {
  trainingUsecase?: "sales" | "fundamental";
  typeOfCoach?: "normal" | "ppt";
  objectiveContext?: string;
  outline?: string;
  guidance?: string;
};

export function CoachModuleEditor({
  trainingId,
  trainingTitle,
  moduleId,
  initialName,
  initialPublished,
  body,
}: {
  trainingId: string;
  trainingTitle: string;
  moduleId: string;
  initialName: string;
  initialPublished: boolean;
  body: Record<string, unknown> | null;
}) {
  const initial = useMemo(() => {
    const config =
      body && typeof body === "object" && "coachConfig" in body
        ? ((body as { coachConfig?: CoachConfig }).coachConfig ?? {})
        : {};
    return {
      trainingUsecase: config.trainingUsecase ?? "sales",
      typeOfCoach: config.typeOfCoach ?? "ppt",
      objectiveContext: config.objectiveContext ?? "",
      outline: config.outline ?? "",
      guidance: config.guidance ?? "",
    };
  }, [body]);

  const [name, setName] = useState(initialName);
  const [published, setPublished] = useState(initialPublished);
  const [trainingUsecase, setTrainingUsecase] = useState(initial.trainingUsecase);
  const [typeOfCoach, setTypeOfCoach] = useState(initial.typeOfCoach);
  const [objectiveContext, setObjectiveContext] = useState(
    initial.objectiveContext,
  );
  const [outline, setOutline] = useState(initial.outline);
  const [guidance, setGuidance] = useState(initial.guidance);
  const [pending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const dirty = !deepEqualJson(
    { name, published, trainingUsecase, typeOfCoach, objectiveContext, outline, guidance },
    { name: initialName, published: initialPublished, ...initial },
  );
  useUnsavedChangesGuard(dirty);

  function save(thenBack: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await saveCoachModule(trainingId, moduleId, {
          name,
          published,
          trainingUsecase,
          typeOfCoach,
          objectiveContext,
          outline,
          guidance,
        });
        toast.success("Module saved");
        if (thenBack) {
          router.push(`/admin/trainings/${trainingId}/edit?step=2`);
        } else {
          router.refresh();
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Save failed";
        setError(msg);
        toast.error("Save failed", msg);
      }
    });
  }

  function remove() {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      try {
        await deleteModule(trainingId, moduleId);
        toast.success("Module deleted");
        router.push(`/admin/trainings/${trainingId}/edit?step=2`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Delete failed";
        setError(msg);
        toast.error("Delete failed", msg);
      }
    });
  }

  async function regenerateWithAi() {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/regenerate-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainingId,
          moduleId,
          trainingUsecase,
          typeOfCoach,
          objectiveContext,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `regenerate failed: ${res.status}`);
      }
      const draft = (await res.json()) as {
        name: string;
        outline: string;
        guidance: string;
      };
      setName(draft.name);
      setOutline(draft.outline);
      setGuidance(draft.guidance);
      toast.success("AI draft ready", "Review and click Save to keep it.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generate failed";
      setError(msg);
      toast.error("Generate failed", msg);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-[22px] text-accent">
        Edit Training -{" "}
        <span className="font-semibold">{trainingTitle}</span>
      </h1>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link
          href={`/admin/trainings/${trainingId}/edit?step=2`}
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink"
        >
          <Icon name="chevron-right" size={12} className="rotate-180" />
          Back to Modules
        </Link>
        <button
          type="button"
          onClick={regenerateWithAi}
          disabled={pending || generating}
          suppressHydrationWarning
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-strong disabled:opacity-60"
        >
          <Icon name="ai-sparkle" size={11} />
          {generating ? "Generating…" : "Generate using AI"}
        </button>
      </div>

      <div className="grid gap-5 md:grid-cols-[1fr_auto]">
        <label className="block space-y-1.5">
          <span className="block text-[12.5px] font-semibold text-ink">
            Module Name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Module Name"
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[14px] focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </label>
        <label className="block space-y-1.5">
          <span className="block text-[12.5px] font-semibold text-ink">
            Module Status
          </span>
          <StatusToggle value={published} onChange={setPublished} />
        </label>
      </div>

      {/* Coach setup */}
      <div className="bg-surface border border-border rounded-[12px] p-5 md:p-6 space-y-4">
        <div className="text-[14.5px] font-semibold text-ink">Coach Setup</div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-[13px] font-semibold text-ink">
              Training Usecase
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <RadioCard
                checked={trainingUsecase === "sales"}
                onChange={() => setTrainingUsecase("sales")}
                label="Sales Training"
              />
              <RadioCard
                checked={trainingUsecase === "fundamental"}
                onChange={() => setTrainingUsecase("fundamental")}
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
                checked={typeOfCoach === "normal"}
                onChange={() => setTypeOfCoach("normal")}
                label="Normal"
              />
              <RadioCard
                checked={typeOfCoach === "ppt"}
                onChange={() => setTypeOfCoach("ppt")}
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
            value={objectiveContext}
            onChange={(e) => setObjectiveContext(e.target.value)}
            rows={4}
            placeholder="Describe what the coach should teach or guide the user…"
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent resize-y leading-relaxed"
            suppressHydrationWarning
          />
        </label>
      </div>

      {/* Outline */}
      <div className="bg-surface border border-border rounded-[12px] p-5 space-y-2">
        <div className="text-[14.5px] font-semibold text-ink">
          {typeOfCoach === "ppt" ? "Slide Outline" : "Outline"}
        </div>
        <p className="text-[12px] text-ink-3">
          {typeOfCoach === "ppt"
            ? "One slide title per line — these drive the deck the learner walks through."
            : "Beats or topics the coach will walk through, one per line."}
        </p>
        <textarea
          value={outline}
          onChange={(e) => setOutline(e.target.value)}
          rows={7}
          placeholder={
            typeOfCoach === "ppt"
              ? "- What is consultative selling?\n- The four-stage discovery flow\n- Handling price objections\n- Closing with a next step"
              : "- Frame the buyer's situation\n- Establish credibility\n- Ask the four discovery questions\n- Confirm the next step"
          }
          className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent resize-y leading-relaxed font-mono"
          suppressHydrationWarning
        />
      </div>

      {/* Guidance */}
      <div className="bg-surface border border-border rounded-[12px] p-5 space-y-2">
        <div className="text-[14.5px] font-semibold text-ink">
          Coach Guidance
        </div>
        <p className="text-[12px] text-ink-3">
          The system prompt the AI coach uses to stay on-topic and on-tone. One
          paragraph; reads alongside the outline.
        </p>
        <textarea
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
          rows={5}
          placeholder="Stay encouraging and concrete. After each beat, ask the learner one short check question before moving on. If they get it wrong, restate using a different analogy. Never name the buyer's company — keep it generic."
          className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent resize-y leading-relaxed"
          suppressHydrationWarning
        />
      </div>

      {error ? (
        <p className="text-[11.5px] text-bad font-mono">{error}</p>
      ) : null}

      <div className="flex items-center justify-between gap-2 pt-4 border-t border-border">
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          suppressHydrationWarning
          className="text-[12.5px] text-ink-3 hover:text-bad px-2 py-1 rounded-md hover:bg-bad-pale disabled:opacity-50"
        >
          Delete module
        </button>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/trainings/${trainingId}/edit?step=2`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-surface text-[12.5px] font-semibold text-ink-2 hover:text-ink"
          >
            <Icon name="chevron-right" size={11} className="rotate-180" />
            Back
          </Link>
          <button
            type="button"
            onClick={() => save(false)}
            disabled={pending}
            suppressHydrationWarning
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-ink text-white text-[12.5px] font-semibold hover:bg-[#2a2a2a] disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => save(true)}
            disabled={pending}
            suppressHydrationWarning
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-strong disabled:opacity-60"
          >
            <Icon name="chevron-right" size={11} className="rotate-180" />
            Save &amp; Back to Modules
          </button>
        </div>
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

function StatusToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <div className="inline-flex items-center bg-surface-2 border border-border rounded-md p-0.5">
      <button
        type="button"
        onClick={() => onChange(false)}
        suppressHydrationWarning
        className={cn(
          "px-3 py-1 rounded text-[12px] font-semibold transition-colors",
          !value ? "bg-ink-2 text-white" : "text-ink-2 hover:text-ink",
        )}
      >
        Unpublish
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        suppressHydrationWarning
        className={cn(
          "px-3 py-1 rounded text-[12px] font-semibold transition-colors",
          value ? "bg-accent text-white" : "text-ink-2 hover:text-ink",
        )}
      >
        Publish
      </button>
    </div>
  );
}
