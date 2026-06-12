// Assessment per-module editor (quiz) — replaces the legacy
// QuizBodyEditor inside the legacy ModuleEditPage shell.
//
// Body shape: { questions[], scopeAndCriteria, targetCount }.
// One Save call writes name + published + the whole body through
// saveAssessmentModule.

"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteModule,
  saveAssessmentModule,
} from "@/app/admin/trainings/actions";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import {
  deepEqualJson,
  useUnsavedChangesGuard,
} from "@/hooks/useUnsavedChangesGuard";
import { cn } from "@/lib/cn";

type Question = {
  q: string;
  options: string[];
  answer: number;
};

type AssessmentBody = {
  questions?: Question[];
  scopeAndCriteria?: string;
  targetCount?: number;
};

export function AssessmentModuleEditor({
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
    const b = (body ?? {}) as AssessmentBody;
    return {
      questions: b.questions ?? [],
      scopeAndCriteria: b.scopeAndCriteria ?? "",
      targetCount: b.targetCount ?? 15,
    };
  }, [body]);

  const [name, setName] = useState(initialName);
  const [published, setPublished] = useState(initialPublished);
  const [scope, setScope] = useState(initial.scopeAndCriteria);
  const [questions, setQuestions] = useState<Question[]>(initial.questions);
  const [pending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const dirty = !deepEqualJson(
    { name, published, scope, questions },
    {
      name: initialName,
      published: initialPublished,
      scope: initial.scopeAndCriteria,
      questions: initial.questions,
    },
  );
  useUnsavedChangesGuard(dirty);

  function save(thenBack: boolean) {
    setError(null);
    if (questions.length === 0) {
      setError("Add at least one question before saving.");
      return;
    }
    // Validate each question: non-empty stem, ≥2 non-empty options, answer in range.
    for (let i = 0; i < questions.length; i++) {
      const qn = questions[i];
      if (qn.q.trim().length === 0) {
        setError(`Question ${i + 1} is missing its prompt.`);
        return;
      }
      const validOpts = qn.options.filter((o) => o.trim().length > 0);
      if (validOpts.length < 2) {
        setError(`Question ${i + 1} needs at least 2 options with text.`);
        return;
      }
      if (qn.answer >= validOpts.length) {
        setError(`Question ${i + 1}'s correct answer points at a blank option.`);
        return;
      }
    }
    startTransition(async () => {
      try {
        // Strip blank options before persisting.
        const cleaned = questions.map((qn) => {
          const opts = qn.options.filter((o) => o.trim().length > 0);
          return {
            q: qn.q.trim(),
            options: opts,
            answer: Math.min(qn.answer, opts.length - 1),
          };
        });
        await saveAssessmentModule(trainingId, moduleId, {
          name,
          published,
          scopeAndCriteria: scope,
          questions: cleaned,
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

  function updateQ(i: number, patch: Partial<Question>) {
    setQuestions(questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function addQuestion() {
    setQuestions([
      ...questions,
      { q: "", options: ["", ""], answer: 0 },
    ]);
  }
  function removeQuestion(i: number) {
    setQuestions(questions.filter((_, idx) => idx !== i));
  }
  function moveQuestion(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[i], next[j]] = [next[j], next[i]];
    setQuestions(next);
  }
  function updateOption(qi: number, oi: number, value: string) {
    const next = [...questions[qi].options];
    next[oi] = value;
    updateQ(qi, { options: next });
  }
  function addOption(qi: number) {
    if (questions[qi].options.length >= 8) return;
    updateQ(qi, { options: [...questions[qi].options, ""] });
  }
  function removeOption(qi: number, oi: number) {
    const opts = questions[qi].options.filter((_, idx) => idx !== oi);
    let ans = questions[qi].answer;
    if (oi === ans) ans = 0;
    else if (oi < ans) ans -= 1;
    updateQ(qi, { options: opts, answer: ans });
  }

  async function regenerateWithAi() {
    setError(null);
    setGenerating(true);
    try {
      const target = questions.length > 0 ? questions.length : 15;
      const res = await fetch("/api/admin/regenerate-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainingId,
          moduleId,
          numberOfQuestions: target,
          scopeAndCriteria: scope,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `regenerate failed: ${res.status}`);
      }
      const draft = (await res.json()) as {
        name: string;
        questions: Question[];
      };
      setName(draft.name);
      setQuestions(draft.questions);
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

      <div className="bg-surface border border-border rounded-[12px] p-5 space-y-2">
        <div className="text-[14.5px] font-semibold text-ink">
          Scope &amp; Criteria
        </div>
        <p className="text-[12px] text-ink-3">
          The brief AI used (or you used) to source these questions. Surface
          for context + the next regeneration pass.
        </p>
        <textarea
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          rows={3}
          placeholder="Ex: Cover discovery questioning, pricing objections, and closing techniques. Mixed difficulty, 4-option MCQs."
          className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent resize-y leading-relaxed"
          suppressHydrationWarning
        />
      </div>

      <div className="bg-surface border border-border rounded-[12px] p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[14.5px] font-semibold text-ink">
              Questions
            </div>
            <p className="text-[12px] text-ink-3">
              {questions.length} question
              {questions.length === 1 ? "" : "s"} on this assessment.
            </p>
          </div>
        </div>

        {questions.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-md py-6 text-center text-[12.5px] text-ink-3">
            No questions yet. Click{" "}
            <span className="font-semibold text-accent">
              + Add Question
            </span>{" "}
            below or use{" "}
            <span className="font-semibold text-accent">Generate using AI</span>.
          </div>
        ) : (
          <ol className="space-y-3">
            {questions.map((qn, qi) => (
              <li
                key={qi}
                className="bg-surface-2/60 border border-border rounded-md p-3 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 text-[11.5px] font-mono text-ink-3 w-6 text-right shrink-0">
                    Q{qi + 1}
                  </span>
                  <textarea
                    value={qn.q}
                    onChange={(e) => updateQ(qi, { q: e.target.value })}
                    rows={2}
                    placeholder="Question prompt…"
                    className="flex-1 bg-surface border border-border rounded-md px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-accent resize-y"
                    suppressHydrationWarning
                  />
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveQuestion(qi, -1)}
                      disabled={qi === 0}
                      aria-label="Move up"
                      className="w-6 h-6 grid place-items-center text-ink-3 hover:text-ink disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveQuestion(qi, 1)}
                      disabled={qi === questions.length - 1}
                      aria-label="Move down"
                      className="w-6 h-6 grid place-items-center text-ink-3 hover:text-ink disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeQuestion(qi)}
                    aria-label="Remove question"
                    className="w-7 h-7 grid place-items-center text-ink-3 hover:text-bad shrink-0"
                  >
                    ×
                  </button>
                </div>
                <ul className="pl-8 space-y-1.5">
                  {qn.options.map((opt, oi) => (
                    <li key={oi} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQ(qi, { answer: oi })}
                        role="radio"
                        aria-checked={qn.answer === oi}
                        aria-label="Mark correct"
                        className={cn(
                          "w-4 h-4 rounded-full border-2 grid place-items-center shrink-0",
                          qn.answer === oi
                            ? "border-accent"
                            : "border-border-strong",
                        )}
                      >
                        {qn.answer === oi ? (
                          <span className="w-2 h-2 rounded-full bg-accent" />
                        ) : null}
                      </button>
                      <input
                        value={opt}
                        onChange={(e) => updateOption(qi, oi, e.target.value)}
                        placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                        className={cn(
                          "flex-1 bg-surface border rounded-md px-2.5 py-1 text-[12.5px] focus:outline-none focus:border-accent",
                          qn.answer === oi
                            ? "border-accent text-ink"
                            : "border-border text-ink",
                        )}
                        suppressHydrationWarning
                      />
                      <button
                        type="button"
                        onClick={() => removeOption(qi, oi)}
                        disabled={qn.options.length <= 2}
                        aria-label="Remove option"
                        className="w-6 h-6 grid place-items-center text-ink-3 hover:text-bad disabled:opacity-30"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                  {qn.options.length < 8 ? (
                    <li>
                      <button
                        type="button"
                        onClick={() => addOption(qi)}
                        className="text-[11.5px] font-semibold text-accent hover:text-accent-strong"
                      >
                        + Add option
                      </button>
                    </li>
                  ) : null}
                </ul>
              </li>
            ))}
          </ol>
        )}

        <button
          type="button"
          onClick={addQuestion}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-dashed border-accent text-accent text-[12.5px] font-semibold hover:bg-accent-pale/20"
        >
          + Add Question
        </button>
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
