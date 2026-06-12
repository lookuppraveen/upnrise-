// Step 2 → Question Bank sub-tab.
//
// Two kinds of reusable MCQs scoped to this training:
//   - evaluation   → Assessment modules draw from these at quiz time.
//   - whatsapp_mcq → Future WhatsApp follow-up pipeline pulls from
//                    these for nudge sessions.
//
// Items can be authored inline (this component) or AI-generated in
// bulk via the Add Module modal's two QB cards.

"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createQuestionBankItem,
  deleteQuestionBankItem,
} from "@/app/admin/trainings/actions";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export type QbItem = {
  id: string;
  kind: "evaluation" | "whatsapp_mcq";
  question: string;
  options: string[];
  // Nullable now that evaluation items are open-ended (no MCQ answer).
  // whatsapp_mcq items still set this; the row renderer treats null as
  // "no correct option" and skips the highlight.
  answer: number | null;
  tags: string[];
  createdAt: Date;
};

type KindFilter = "all" | "evaluation" | "whatsapp_mcq";

const KIND_LABEL: Record<QbItem["kind"], string> = {
  evaluation: "Evaluation",
  whatsapp_mcq: "WhatsApp MCQ",
};

const KIND_ACCENT: Record<QbItem["kind"], string> = {
  evaluation: "#7c5cd6",
  whatsapp_mcq: "#10b981",
};

export function QuestionBankTab({
  trainingId,
  items,
  onOpenBulkGenerate,
}: {
  trainingId: string;
  items: QbItem[];
  onOpenBulkGenerate: () => void;
}) {
  const [filter, setFilter] = useState<KindFilter>("all");
  const [adding, setAdding] = useState(false);

  const filtered = useMemo(() => {
    return filter === "all" ? items : items.filter((i) => i.kind === filter);
  }, [items, filter]);

  const counts = useMemo(() => {
    let evalC = 0;
    let waC = 0;
    for (const i of items) {
      if (i.kind === "evaluation") evalC++;
      else waC++;
    }
    return { evaluation: evalC, whatsapp_mcq: waC, total: items.length };
  }, [items]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-[22px] leading-tight">
            Question Bank{" "}
            <span className="text-ink-3 font-normal">({counts.total})</span>
          </h2>
          <p className="text-[12px] text-ink-3">
            Reusable MCQs. Assessment modules pull from{" "}
            <strong className="text-ink-2">
              {counts.evaluation} evaluation
            </strong>{" "}
            items; the WhatsApp follow-up pipeline pulls from{" "}
            <strong className="text-ink-2">
              {counts.whatsapp_mcq} nudge
            </strong>{" "}
            items.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <KindFilterPills value={filter} onChange={setFilter} />
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            suppressHydrationWarning
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border-strong bg-surface text-[12.5px] font-semibold hover:bg-surface-2"
          >
            {adding ? "Cancel" : "+ Add Question"}
          </button>
          <button
            type="button"
            onClick={onOpenBulkGenerate}
            suppressHydrationWarning
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-strong"
          >
            <Icon name="ai-sparkle" size={11} />
            Bulk Generate
          </button>
        </div>
      </div>

      {adding ? (
        <AddQuestionForm
          trainingId={trainingId}
          onDone={() => setAdding(false)}
        />
      ) : null}

      {filtered.length === 0 ? (
        <div className="bg-surface border border-dashed border-border rounded-[12px] p-10 text-center">
          <p className="text-[13px] text-ink-2">
            {items.length === 0
              ? "No questions yet. Add one, or use Bulk Generate to draft a batch with AI."
              : "No questions match that filter."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((q) => (
            <QbItemRow key={q.id} trainingId={trainingId} item={q} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────── Item row ───────────────

function QbItemRow({
  trainingId,
  item,
}: {
  trainingId: string;
  item: QbItem;
}) {
  const [pending, startTransition] = useTransition();
  function remove() {
    if (!window.confirm("Delete this question?")) return;
    startTransition(() => {
      void deleteQuestionBankItem(trainingId, item.id);
    });
  }
  return (
    <li className="bg-surface border border-border rounded-[12px] p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold uppercase tracking-[0.08em] text-white shrink-0"
          style={{ background: KIND_ACCENT[item.kind] }}
        >
          {KIND_LABEL[item.kind]}
        </span>
        <div className="flex-1 min-w-0 text-[13.5px] font-semibold text-ink leading-snug">
          {item.question}
        </div>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label="Delete question"
          suppressHydrationWarning
          className="w-7 h-7 grid place-items-center rounded-md border border-border bg-surface-2 text-ink-3 hover:text-bad hover:bg-bad-pale disabled:opacity-50 shrink-0"
        >
          ×
        </button>
      </div>
      <ol className="space-y-1 pl-1">
        {item.options.map((opt, i) => {
          const correct = item.answer != null && i === item.answer;
          return (
            <li
              key={i}
              className={cn(
                "flex items-center gap-2 text-[12.5px] pl-2 pr-1 py-1 rounded",
                correct ? "bg-good-pale text-good font-semibold" : "text-ink-2",
              )}
            >
              <span
                className={cn(
                  "w-4 h-4 grid place-items-center rounded-full text-[9px] font-bold shrink-0",
                  correct
                    ? "bg-good text-white"
                    : "bg-surface-2 text-ink-3 border border-border",
                )}
                aria-hidden
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span className="flex-1 min-w-0 truncate">{opt}</span>
              {correct ? (
                <span className="text-[10.5px] font-bold uppercase tracking-[0.08em]">
                  Correct
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {item.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {item.tags.map((t) => (
            <span
              key={t}
              className="text-[10.5px] font-semibold text-ink-3 bg-surface-2 border border-border rounded px-1.5 py-0.5"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}

// ─────────────── Add form ───────────────

function AddQuestionForm({
  trainingId,
  onDone,
}: {
  trainingId: string;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<QbItem["kind"]>("evaluation");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [answer, setAnswer] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function updateOption(idx: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? value : o)));
  }

  function addOption() {
    if (options.length >= 6) return;
    setOptions((prev) => [...prev, ""]);
  }

  function removeOption(idx: number) {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, i) => i !== idx));
    setAnswer((a) => (a === idx ? 0 : a > idx ? a - 1 : a));
  }

  function submit() {
    setError(null);
    if (question.trim().length < 3) {
      setError("Question must be at least 3 characters.");
      return;
    }
    if (options.some((o) => !o.trim())) {
      setError("Every option needs text.");
      return;
    }
    startTransition(async () => {
      try {
        await createQuestionBankItem(trainingId, {
          kind,
          question: question.trim(),
          options: options.map((o) => o.trim()),
          answer,
        });
        // Reset for the next entry; keep the form open for fast batch authoring.
        setQuestion("");
        setOptions(["", ""]);
        setAnswer(0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <div className="bg-surface border border-border rounded-[12px] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] font-semibold text-ink">Kind</span>
        <div className="inline-flex items-center bg-surface-2 border border-border rounded-md p-0.5">
          {(["evaluation", "whatsapp_mcq"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              suppressHydrationWarning
              className={cn(
                "px-3 py-1 rounded text-[12px] font-semibold",
                kind === k ? "bg-accent text-white" : "text-ink-2 hover:text-ink",
              )}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={2}
        placeholder="Question text"
        className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
        suppressHydrationWarning
      />
      <div className="space-y-1.5">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name="qb-answer"
              checked={answer === i}
              onChange={() => setAnswer(i)}
              className="accent-good shrink-0"
              aria-label={`Mark option ${i + 1} as correct`}
            />
            <input
              type="text"
              value={opt}
              onChange={(e) => updateOption(i, e.target.value)}
              placeholder={`Option ${String.fromCharCode(65 + i)}`}
              className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-[12.5px] focus:outline-none focus:border-accent"
              suppressHydrationWarning
            />
            {options.length > 2 ? (
              <button
                type="button"
                onClick={() => removeOption(i)}
                suppressHydrationWarning
                aria-label="Remove option"
                className="w-7 h-7 grid place-items-center rounded-md text-ink-3 hover:text-bad hover:bg-bad-pale"
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
        {options.length < 6 ? (
          <button
            type="button"
            onClick={addOption}
            suppressHydrationWarning
            className="text-[11.5px] font-semibold text-accent hover:text-accent-strong"
          >
            + Add option
          </button>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-2">
        {error ? (
          <span className="text-[11.5px] text-bad font-mono mr-auto">
            {error}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onDone}
          suppressHydrationWarning
          className="text-[12px] text-ink-3 hover:text-ink px-2 py-1"
        >
          Close
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          suppressHydrationWarning
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-strong disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save + add next"}
        </button>
      </div>
    </div>
  );
}

// ─────────────── Filter pills ───────────────

function KindFilterPills({
  value,
  onChange,
}: {
  value: KindFilter;
  onChange: (v: KindFilter) => void;
}) {
  return (
    <div className="inline-flex items-center bg-surface-2 border border-border rounded-md p-0.5">
      {(
        [
          { v: "all" as const, label: "All" },
          { v: "evaluation" as const, label: "Evaluation" },
          { v: "whatsapp_mcq" as const, label: "WhatsApp" },
        ]
      ).map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          suppressHydrationWarning
          className={cn(
            "px-3 py-1 rounded text-[12px] font-semibold transition-colors",
            o.v === value
              ? "bg-accent text-white"
              : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
