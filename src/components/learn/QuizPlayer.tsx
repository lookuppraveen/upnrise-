// Trainee quiz module player. Renders each question with radio choices,
// computes a percent score on submit, then calls markModuleComplete with
// the score. Retake is allowed — re-submitting upserts the row with the
// latest score.

"use client";

import { useState, useTransition } from "react";
import { markModuleComplete } from "@/app/learn/trainings/[id]/modules/[mid]/actions";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type Question = { q: string; options: string[]; answer: number };

export function QuizPlayer({
  moduleId,
  questions,
  lastScorePct,
  alreadyCompleted,
}: {
  moduleId: string;
  questions: Question[];
  lastScorePct: number | null;
  alreadyCompleted: boolean;
}) {
  const [picks, setPicks] = useState<Array<number | null>>(
    () => questions.map(() => null),
  );
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  const answeredCount = picks.filter((p) => p != null).length;
  const allAnswered = answeredCount === questions.length;

  const correct: number = picks.reduce<number>(
    (acc, pick, i) => acc + (pick === questions[i].answer ? 1 : 0),
    0,
  );
  const scorePct = Math.round((correct / questions.length) * 100);

  function submit() {
    if (!allAnswered || pending) return;
    setSubmitted(true);
    startTransition(() => {
      void markModuleComplete({ moduleId, scorePct });
    });
  }

  function retake() {
    setPicks(questions.map(() => null));
    setSubmitted(false);
  }

  return (
    <div className="space-y-5">
      {alreadyCompleted && !submitted ? (
        <div
          className="rounded-[12px] border px-5 py-4 flex items-start gap-3"
          style={{
            background: "linear-gradient(135deg, #f3eafa, #fce8f0)",
            borderColor: "#e6d2f1",
          }}
        >
          <div
            className="w-[28px] h-[28px] rounded-[7px] grid place-items-center text-white shrink-0"
            style={{
              background: "linear-gradient(135deg, #a855f7, #ec4899)",
            }}
          >
            <Icon name="trophy" size={12} />
          </div>
          <div className="text-[13px] text-ink leading-[1.55]">
            You&apos;ve already completed this quiz
            {lastScorePct != null ? ` with ${lastScorePct}%` : ""}. Answer
            again to update your score, or head back to the training.
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {questions.map((q, i) => (
          <QuestionCard
            key={i}
            index={i}
            question={q}
            pick={picks[i]}
            submitted={submitted}
            onPick={(opt) => {
              if (submitted) return;
              setPicks((p) => {
                const next = [...p];
                next[i] = opt;
                return next;
              });
            }}
          />
        ))}
      </div>

      {submitted ? (
        <ResultSummary
          scorePct={scorePct}
          correct={correct}
          total={questions.length}
          pending={pending}
          onRetake={retake}
        />
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={!allAnswered || pending}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 rounded-md",
              "bg-accent text-white text-[13px] font-semibold",
              "hover:bg-accent-strong disabled:opacity-60",
            )}
          >
            <Icon name="ai-sparkle" size={12} />
            Submit answers
          </button>
          <span className="text-[12px] text-ink-3 font-mono">
            {answeredCount} / {questions.length} answered
          </span>
        </div>
      )}
    </div>
  );
}

function QuestionCard({
  index,
  question,
  pick,
  submitted,
  onPick,
}: {
  index: number;
  question: Question;
  pick: number | null;
  submitted: boolean;
  onPick: (opt: number) => void;
}) {
  return (
    <div className="bg-surface border border-border rounded-[12px] p-5 space-y-3">
      <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
        Question {index + 1}
      </div>
      <div className="text-[14px] font-semibold text-ink leading-[1.4]">
        {question.q}
      </div>
      <ul className="space-y-2">
        {question.options.map((opt, i) => {
          const picked = pick === i;
          const isAnswer = submitted && i === question.answer;
          const isWrongPick = submitted && picked && !isAnswer;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onPick(i)}
                disabled={submitted}
                className={cn(
                  "w-full text-left rounded-[10px] border px-3 py-2.5 text-[13px]",
                  "flex items-start gap-2.5 transition-colors",
                  submitted
                    ? "cursor-default"
                    : "cursor-pointer hover:border-border-strong",
                  isAnswer
                    ? "border-good bg-good-pale text-ink"
                    : isWrongPick
                      ? "border-bad bg-bad-pale text-ink"
                      : picked
                        ? "border-accent bg-accent-pale text-ink"
                        : "border-border bg-surface text-ink-2",
                )}
              >
                <span
                  className={cn(
                    "w-4 h-4 rounded-full border-2 grid place-items-center shrink-0 mt-0.5",
                    isAnswer
                      ? "border-good bg-good"
                      : isWrongPick
                        ? "border-bad bg-bad"
                        : picked
                          ? "border-accent bg-accent"
                          : "border-border-strong bg-surface",
                  )}
                >
                  {picked || isAnswer ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  ) : null}
                </span>
                <span className="flex-1">{opt}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ResultSummary({
  scorePct,
  correct,
  total,
  pending,
  onRetake,
}: {
  scorePct: number;
  correct: number;
  total: number;
  pending: boolean;
  onRetake: () => void;
}) {
  const tone =
    scorePct >= 75 ? "good" : scorePct >= 50 ? "warn" : "bad";
  const toneCls =
    tone === "good"
      ? "border-good bg-good-pale"
      : tone === "warn"
        ? "border-warn bg-warn-pale"
        : "border-bad bg-bad-pale";
  const scoreCls =
    tone === "good"
      ? "text-good"
      : tone === "warn"
        ? "text-warn"
        : "text-bad";
  return (
    <div className={cn("rounded-[12px] border p-5 space-y-3", toneCls)}>
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "font-display text-[44px] leading-none -tracking-[0.01em]",
            scoreCls,
          )}
        >
          {scorePct}%
        </div>
        <div>
          <div className="text-[13.5px] font-semibold text-ink">
            {correct} of {total} correct
          </div>
          <div className="text-[12px] text-ink-2 mt-0.5">
            {pending
              ? "Saving your score…"
              : "Score recorded. You can retake to improve it."}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetake}
        disabled={pending}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-surface text-[12.5px] font-semibold text-ink-2 hover:text-ink hover:border-border-strong disabled:opacity-60"
      >
        Retake
      </button>
    </div>
  );
}
