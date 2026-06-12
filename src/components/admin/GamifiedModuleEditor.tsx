// Gamified per-module editor (Activities) — replaces the Phase M
// placeholder.
//
// Rendered from ModuleEditPage when `m.type === "gamified"`. Body
// shape: { description, duration, duration_min, exercises[] }. Save
// goes through saveGamifiedModule in one shot.

"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteModule,
  saveGamifiedModule,
} from "@/app/admin/trainings/actions";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import {
  deepEqualJson,
  useUnsavedChangesGuard,
} from "@/hooks/useUnsavedChangesGuard";
import { cn } from "@/lib/cn";

type Duration = "short" | "medium" | "long";

type GamifiedBody = {
  description?: string;
  duration?: Duration;
  duration_min?: number;
  exercises?: string[];
};

const DURATIONS: { key: Duration; label: string; mins: number }[] = [
  { key: "short", label: "Short", mins: 3 },
  { key: "medium", label: "Medium", mins: 5 },
  { key: "long", label: "Long", mins: 7 },
];

export function GamifiedModuleEditor({
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
    const b = (body ?? {}) as GamifiedBody;
    return {
      description: b.description ?? "",
      duration: b.duration ?? "short",
      exercises: b.exercises ?? [],
    };
  }, [body]);

  const [name, setName] = useState(initialName);
  const [published, setPublished] = useState(initialPublished);
  const [description, setDescription] = useState(initial.description);
  const [duration, setDuration] = useState<Duration>(initial.duration);
  const [exercises, setExercises] = useState<string[]>(initial.exercises);
  const [pending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const dirty = !deepEqualJson(
    { name, published, description, duration, exercises },
    { name: initialName, published: initialPublished, ...initial },
  );
  useUnsavedChangesGuard(dirty);

  function save(thenBack: boolean) {
    setError(null);
    if (exercises.length === 0) {
      setError(
        "Add at least one exercise before saving (or click Regenerate using AI).",
      );
      return;
    }
    startTransition(async () => {
      try {
        await saveGamifiedModule(trainingId, moduleId, {
          name,
          published,
          description,
          duration,
          exercises,
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

  function updateExercise(i: number, value: string) {
    setExercises(exercises.map((e, idx) => (idx === i ? value : e)));
  }
  function removeExercise(i: number) {
    setExercises(exercises.filter((_, idx) => idx !== i));
  }
  function addExercise() {
    setExercises([...exercises, ""]);
  }
  function moveExercise(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= exercises.length) return;
    const next = [...exercises];
    [next[i], next[j]] = [next[j], next[i]];
    setExercises(next);
  }

  async function regenerateWithAi() {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/regenerate-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainingId,
          moduleId,
          duration,
          prompt: description,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `regenerate failed: ${res.status}`);
      }
      const draft = (await res.json()) as {
        name: string;
        description: string;
        exercises: string[];
      };
      setName(draft.name);
      setDescription(draft.description);
      setExercises(draft.exercises);
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
      {/* Edit Training header */}
      <h1 className="font-display text-[22px] text-accent">
        Edit Training -{" "}
        <span className="font-semibold">{trainingTitle}</span>
      </h1>

      {/* Back link + Regenerate */}
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

      {/* Name + Status */}
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

      {/* Duration */}
      <div className="space-y-2">
        <div className="text-[13px] font-semibold text-ink">
          Duration (Number of Activities)
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {DURATIONS.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => setDuration(d.key)}
              role="radio"
              aria-checked={duration === d.key}
              suppressHydrationWarning
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-md border-2 text-[13px] font-semibold transition-colors text-left",
                duration === d.key
                  ? "border-accent bg-surface text-ink"
                  : "border-border bg-surface text-ink-3 hover:border-accent-pale",
              )}
            >
              <span
                className={cn(
                  "w-4 h-4 rounded-full border-2 grid place-items-center shrink-0",
                  duration === d.key ? "border-accent" : "border-border-strong",
                )}
              >
                {duration === d.key ? (
                  <span className="w-2 h-2 rounded-full bg-accent" />
                ) : null}
              </span>
              <span className={cn("flex-1", duration !== d.key && "text-ink-3")}>
                {d.label} ({d.mins} mins)
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div className="bg-surface border border-border rounded-[12px] p-5 space-y-2">
        <div className="text-[14.5px] font-semibold text-ink">
          Activity Description
        </div>
        <p className="text-[12px] text-ink-3">
          Describe how the activity is set up, the skill it exercises, and the
          mechanics the learner will use.
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="Ex: A drag-and-drop simulation where the learner sequences the discovery questions for a B2B prospecting call."
          className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent resize-y leading-relaxed"
          suppressHydrationWarning
        />
      </div>

      {/* Exercises */}
      <div className="bg-surface border border-border rounded-[12px] p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[14.5px] font-semibold text-ink">Exercises</div>
            <p className="text-[12px] text-ink-3">
              Each exercise becomes a step the learner works through. Aim for{" "}
              {duration === "long" ? "5–6" : duration === "medium" ? "3–4" : "2–3"}.
            </p>
          </div>
          <span className="text-[11.5px] font-semibold text-ink-2">
            {exercises.length} step{exercises.length === 1 ? "" : "s"}
          </span>
        </div>

        {exercises.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-md py-6 text-center text-[12.5px] text-ink-3">
            No exercises yet. Add one below or click{" "}
            <span className="font-semibold text-accent">Generate using AI</span>{" "}
            to draft from the description.
          </div>
        ) : (
          <ol className="space-y-2">
            {exercises.map((ex, i) => (
              <li
                key={i}
                className="flex items-start gap-2 px-3 py-2.5 bg-surface-2 border border-border rounded-md"
              >
                <span className="mt-1 text-[11.5px] font-mono text-ink-3 w-5 text-center shrink-0">
                  {i + 1}.
                </span>
                <textarea
                  value={ex}
                  onChange={(e) => updateExercise(i, e.target.value)}
                  rows={2}
                  placeholder="Describe what the learner does in this step…"
                  className="flex-1 bg-surface border border-border rounded-md px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-accent resize-y"
                  suppressHydrationWarning
                />
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => moveExercise(i, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="w-6 h-6 grid place-items-center text-ink-3 hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveExercise(i, 1)}
                    disabled={i === exercises.length - 1}
                    aria-label="Move down"
                    className="w-6 h-6 grid place-items-center text-ink-3 hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ▼
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeExercise(i)}
                  aria-label="Remove exercise"
                  className="w-7 h-7 grid place-items-center text-ink-3 hover:text-bad shrink-0"
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        )}

        <button
          type="button"
          onClick={addExercise}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-dashed border-accent text-accent text-[12.5px] font-semibold hover:bg-accent-pale/20"
        >
          + Add Exercise
        </button>
      </div>

      {error ? (
        <p className="text-[11.5px] text-bad font-mono">{error}</p>
      ) : null}

      {/* Footer */}
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
