// Evaluation per-module editor — matches the design's "Evaluation
// Settings" page layout.
//
// Rendered from ModuleEditPage when `m.type === "evaluation"`. All
// knobs live on body.evaluation; one Save call writes the whole
// shape through saveEvaluationModule.

"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteModule,
  saveEvaluationModule,
} from "@/app/admin/trainings/actions";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import {
  deepEqualJson,
  useUnsavedChangesGuard,
} from "@/hooks/useUnsavedChangesGuard";
import { cn } from "@/lib/cn";

type SelectionMode = "random" | "manual";
type TimeLimitMode = "global" | "per_question";
type Scoring = "keyword_weightage" | "ai";
type Mode = "user_choice" | "video" | "audio";

type EvaluationBody = {
  selectionMode?: SelectionMode;
  numberOfQuestions?: number | null;
  timeLimit?: TimeLimitMode;
  totalTimeLimitMin?: number;
  perQuestionTimeLimitSec?: number;
  attempts?: { kind: "unlimited" | "limited"; limit: number };
  scoring?: Scoring;
  speechDelivery?: boolean;
  hideAnswerFromUser?: boolean;
  modeOfEvaluation?: Mode;
};

const Q_COUNT_OPTIONS = [5, 10, 15, 20, 25, 30, 50];

export function EvaluationModuleEditor({
  trainingId,
  trainingTitle: _trainingTitle,
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
    const eval_ =
      body && typeof body === "object" && "evaluation" in body
        ? ((body as { evaluation?: EvaluationBody }).evaluation ?? {})
        : {};
    return {
      selectionMode: eval_.selectionMode ?? "random",
      numberOfQuestions: eval_.numberOfQuestions ?? null,
      timeLimit: eval_.timeLimit ?? "global",
      totalTimeLimitMin: eval_.totalTimeLimitMin ?? 5,
      perQuestionTimeLimitSec: eval_.perQuestionTimeLimitSec ?? 60,
      attempts: eval_.attempts ?? { kind: "unlimited" as const, limit: 1 },
      scoring: eval_.scoring ?? "ai",
      speechDelivery: eval_.speechDelivery ?? false,
      hideAnswerFromUser: eval_.hideAnswerFromUser ?? false,
      modeOfEvaluation: eval_.modeOfEvaluation ?? "video",
    };
  }, [body]);

  const [name, setName] = useState(initialName);
  const [published, setPublished] = useState(initialPublished);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(
    initial.selectionMode,
  );
  const [numberOfQuestions, setNumberOfQuestions] = useState<number | null>(
    initial.numberOfQuestions,
  );
  const [timeLimit, setTimeLimit] = useState<TimeLimitMode>(initial.timeLimit);
  const [totalTimeLimitMin, setTotalTimeLimitMin] = useState<number>(
    initial.totalTimeLimitMin,
  );
  const [perQuestionTimeLimitSec, setPerQuestionTimeLimitSec] = useState<number>(
    initial.perQuestionTimeLimitSec,
  );
  const [attempts, setAttempts] = useState(initial.attempts);
  const [scoring, setScoring] = useState<Scoring>(initial.scoring);
  const [speechDelivery, setSpeechDelivery] = useState(initial.speechDelivery);
  const [hideAnswerFromUser, setHideAnswerFromUser] = useState(
    initial.hideAnswerFromUser,
  );
  const [modeOfEvaluation, setModeOfEvaluation] = useState<Mode>(
    initial.modeOfEvaluation,
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const dirty = !deepEqualJson(
    {
      name,
      published,
      selectionMode,
      numberOfQuestions,
      timeLimit,
      totalTimeLimitMin,
      perQuestionTimeLimitSec,
      attempts,
      scoring,
      speechDelivery,
      hideAnswerFromUser,
      modeOfEvaluation,
    },
    { name: initialName, published: initialPublished, ...initial },
  );
  useUnsavedChangesGuard(dirty);

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

  function save(thenBack: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await saveEvaluationModule(trainingId, moduleId, {
          name,
          published,
          selectionMode,
          numberOfQuestions,
          timeLimit,
          totalTimeLimitMin,
          perQuestionTimeLimitSec,
          attempts,
          scoring,
          speechDelivery,
          hideAnswerFromUser,
          modeOfEvaluation,
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

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <Link
          href={`/admin/trainings/${trainingId}/edit?step=2`}
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink"
        >
          <Icon name="chevron-right" size={12} className="rotate-180" />
          Back to Modules
        </Link>
      </div>

      {/* Name + Status */}
      <div className="grid gap-5 md:grid-cols-[1fr_auto] items-start">
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

      {/* Evaluation Settings */}
      <div className="space-y-5">
        <div className="text-[14px] font-semibold text-ink">
          Evaluation Settings
        </div>

        {/* Selection Mode + Number of Questions */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-5 flex-wrap">
            <Radio
              checked={selectionMode === "random"}
              onChange={() => setSelectionMode("random")}
              label="Select Randomly"
            />
            <Radio
              checked={selectionMode === "manual"}
              onChange={() => setSelectionMode("manual")}
              label="Select Manually"
            />
          </div>
          <div className="max-w-[520px]">
            <FloatingSelect
              label="Number of Questions per Evaluation"
              required
              value={numberOfQuestions != null ? String(numberOfQuestions) : ""}
              onChange={(v) =>
                setNumberOfQuestions(v === "" ? null : Number(v))
              }
              placeholder="Select Number of Questions"
              options={Q_COUNT_OPTIONS.map((n) => ({
                value: String(n),
                label: String(n),
              }))}
            />
          </div>
        </div>

        {/* Time Limit */}
        <div className="grid gap-5 md:grid-cols-2 items-end">
          <div className="space-y-2.5">
            <div className="text-[13px] font-semibold text-ink">Time Limit</div>
            <div className="flex items-center gap-5 flex-wrap">
              <Radio
                checked={timeLimit === "global"}
                onChange={() => setTimeLimit("global")}
                label="Global Time Limit"
              />
              <Radio
                checked={timeLimit === "per_question"}
                onChange={() => setTimeLimit("per_question")}
                label="Per Question"
              />
            </div>
          </div>
          {timeLimit === "global" ? (
            <FloatingInput
              label="Total Time Limit (minutes)"
              required
              type="number"
              min={1}
              max={600}
              value={String(totalTimeLimitMin)}
              onChange={(v) => {
                const n = Number(v);
                if (Number.isFinite(n)) setTotalTimeLimitMin(Math.max(1, n));
              }}
            />
          ) : (
            <FloatingInput
              label="Per-question Time Limit (seconds)"
              required
              type="number"
              min={5}
              max={600}
              value={String(perQuestionTimeLimitSec)}
              onChange={(v) => {
                const n = Number(v);
                if (Number.isFinite(n))
                  setPerQuestionTimeLimitSec(Math.max(5, n));
              }}
            />
          )}
        </div>

        {/* Attempts */}
        <div className="space-y-2.5">
          <div className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
            Number of Evaluation Attempts
            <InfoDot title="Cap how many times a learner can run this evaluation." />
          </div>
          <div className="flex items-center gap-5 flex-wrap">
            <Radio
              checked={attempts.kind === "unlimited"}
              onChange={() =>
                setAttempts({ ...attempts, kind: "unlimited" })
              }
              label="Unlimited"
            />
            <div className="flex items-center gap-2">
              <Radio
                checked={attempts.kind === "limited"}
                onChange={() =>
                  setAttempts({ ...attempts, kind: "limited" })
                }
                label="Limited - Show up to"
              />
              <input
                type="number"
                value={attempts.limit}
                min={1}
                max={50}
                disabled={attempts.kind !== "limited"}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n))
                    setAttempts({
                      ...attempts,
                      limit: Math.max(1, Math.min(50, Math.round(n))),
                    });
                }}
                className="w-14 bg-surface border border-border-strong rounded-md px-2 py-1 text-[12.5px] focus:outline-none focus:border-accent disabled:opacity-50"
                suppressHydrationWarning
              />
              <span className="text-[12.5px] text-ink-2">attempts</span>
            </div>
          </div>
        </div>

        {/* Scoring */}
        <div className="space-y-2.5">
          <div className="text-[13px] font-semibold text-ink">Scoring</div>
          <div className="flex items-center gap-5 flex-wrap">
            <Radio
              checked={scoring === "keyword_weightage"}
              onChange={() => setScoring("keyword_weightage")}
              label="keyword weightage"
            />
            <Radio
              checked={scoring === "ai"}
              onChange={() => setScoring("ai")}
              label="AI Scoring"
            />
          </div>
        </div>

        {/* Evaluation Speech Delivery toggle */}
        <div className="max-w-[520px]">
          <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border border-border-strong bg-surface">
            <span className="text-[13px] text-ink">
              Evaluation Speech Delivery
            </span>
            <Switch
              checked={speechDelivery}
              onChange={() => setSpeechDelivery(!speechDelivery)}
              ariaLabel="Toggle evaluation speech delivery"
            />
          </div>
        </div>

        {/* Hide Answer */}
        <Check
          checked={hideAnswerFromUser}
          onChange={() => setHideAnswerFromUser(!hideAnswerFromUser)}
          label="Hide Answer from User"
        />

        {/* Mode of Evaluation */}
        <div className="space-y-2.5">
          <div className="text-[13px] font-semibold text-ink">
            Mode of Evaluation
          </div>
          <div className="flex items-center gap-5 flex-wrap">
            <Radio
              checked={modeOfEvaluation === "user_choice"}
              onChange={() => setModeOfEvaluation("user_choice")}
              label="User Choice"
            />
            <Radio
              checked={modeOfEvaluation === "video"}
              onChange={() => setModeOfEvaluation("video")}
              label="Video"
            />
            <Radio
              checked={modeOfEvaluation === "audio"}
              onChange={() => setModeOfEvaluation("audio")}
              label="Audio"
            />
          </div>
        </div>
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

// ─────────────── Primitives ───────────────

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

function Radio({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button"
        onClick={onChange}
        role="radio"
        aria-checked={checked}
        suppressHydrationWarning
        className={cn(
          "w-4 h-4 rounded-full border-2 grid place-items-center transition-colors",
          checked ? "border-accent" : "border-border-strong",
        )}
      >
        {checked ? <span className="w-2 h-2 rounded-full bg-accent" /> : null}
      </button>
      <span className="text-[12.5px] font-semibold text-ink">{label}</span>
    </label>
  );
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button"
        onClick={onChange}
        role="checkbox"
        aria-checked={checked}
        suppressHydrationWarning
        className={cn(
          "w-4 h-4 grid place-items-center rounded border transition-colors",
          checked
            ? "bg-accent border-accent text-white"
            : "bg-surface border-border-strong text-transparent",
        )}
      >
        <span className="text-[10px] leading-none">✓</span>
      </button>
      <span className="text-[12.5px] text-ink">{label}</span>
    </label>
  );
}

function Switch({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      suppressHydrationWarning
      className={cn(
        "relative inline-flex items-center w-10 h-5 rounded-full transition-colors",
        checked ? "bg-accent" : "bg-[#cfd0d6]",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}

function InfoDot({ title }: { title: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      className="inline-grid place-items-center w-4 h-4 rounded-full border border-border bg-surface-2 text-[10px] text-ink-3 cursor-help"
    >
      i
    </span>
  );
}

// Material-style outlined field with a floating label notched into
// the top border — used for Number of Questions and Total Time Limit.
function FloatingSelect({
  label,
  required,
  value,
  onChange,
  placeholder,
  options,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 -top-2 px-1 bg-bg text-[10.5px] font-medium text-accent z-10 pointer-events-none">
        {label} {required ? <span>*</span> : null}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full appearance-none bg-surface border rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent pr-9",
            value === "" ? "text-ink-3 border-border" : "text-ink border-border-strong",
          )}
          suppressHydrationWarning
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon
          name="chevron-down"
          size={14}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3"
        />
      </div>
    </div>
  );
}

function FloatingInput({
  label,
  required,
  value,
  onChange,
  type = "text",
  min,
  max,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 -top-2 px-1 bg-bg text-[10.5px] font-medium text-accent z-10 pointer-events-none">
        {label} {required ? <span>*</span> : null}
      </span>
      <input
        type={type}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent"
        suppressHydrationWarning
      />
    </div>
  );
}
