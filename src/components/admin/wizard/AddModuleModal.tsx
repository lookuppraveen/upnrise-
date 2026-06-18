// "What would you like to create today?" modal.
//
// Type cards × stepper + prompt + Generate. Most cards feed counts into
// the bulk-generate route. PPT Coach is a direct-jump card: clicking it
// routes to the existing Coach create page (where "PPT" is the default
// coach type), so the admin can configure usecase / objective / upload
// the deck before persisting. Quick-prompts at the bottom seed the
// prompt textarea.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addModule } from "@/app/admin/trainings/actions";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  TrainingTemplatePickerModal,
  type TrainingTemplate,
} from "./TrainingTemplatePickerModal";

type LiveKey =
  | "roleplay"
  | "quiz"
  | "gamified"
  | "evaluation_module"
  | "evaluation"
  | "whatsapp_mcq";
type JumpKey = "ppt_coach";

type CardConfig =
  | {
      key: LiveKey;
      label: string;
      kind: "Module" | "Question Bank";
      unit: "module" | "question";
      defaultCount: number;
      mode: "count";
      accent: string;
      icon: "chart" | "message" | "trophy" | "wand";
    }
  | {
      key: JumpKey;
      label: string;
      kind: "Module" | "Question Bank";
      mode: "jump";
      accent: string;
      icon: "chart" | "message" | "trophy" | "wand";
    };

const CARDS: CardConfig[] = [
  {
    key: "ppt_coach",
    label: "PPT Coach",
    kind: "Module",
    mode: "jump",
    accent: "#2563eb",
    icon: "chart",
  },
  {
    key: "roleplay",
    label: "Roleplay",
    kind: "Module",
    unit: "module",
    defaultCount: 1,
    mode: "count",
    accent: "#7c5cd6",
    icon: "message",
  },
  {
    key: "gamified",
    label: "Gamified Activity",
    kind: "Module",
    unit: "module",
    defaultCount: 1,
    mode: "count",
    accent: "#d4a017",
    icon: "trophy",
  },
  {
    key: "quiz",
    label: "Assessment",
    kind: "Module",
    unit: "question",
    defaultCount: 5,
    mode: "count",
    accent: "#10b981",
    icon: "wand",
  },
  {
    key: "evaluation_module",
    label: "Evaluation Module",
    kind: "Module",
    unit: "module",
    defaultCount: 0,
    mode: "count",
    accent: "#06b6d4",
    icon: "wand",
  },
  {
    key: "evaluation",
    label: "Evaluation Questions",
    kind: "Question Bank",
    unit: "question",
    defaultCount: 5,
    mode: "count",
    accent: "#7c5cd6",
    icon: "wand",
  },
  {
    key: "whatsapp_mcq",
    label: "WhatsApp MCQ",
    kind: "Question Bank",
    unit: "question",
    defaultCount: 5,
    mode: "count",
    accent: "#10b981",
    icon: "message",
  },
];

const QUICK_PROMPTS = [
  "Voice · price objection",
  "Video · pharma + doctor",
  "Voice+video · 1:1",
];

export function AddModuleModal({
  trainingId,
  onClose,
}: {
  trainingId: string;
  onClose: () => void;
}) {
  // Counts: per-card quantity. roleplay/quiz/gamified/evaluation_module
  // are module counts; evaluation/whatsapp_mcq are question-count for
  // the bank. Keys match the bulk-generate route's `counts` payload.
  const [counts, setCounts] = useState<Record<LiveKey, number>>({
    roleplay: 1,
    quiz: 0,
    gamified: 0,
    evaluation_module: 0,
    evaluation: 0,
    whatsapp_mcq: 0,
  });
  const [prompt, setPrompt] = useState("");
  const [pending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const router = useRouter();

  function bump(key: LiveKey, delta: number) {
    setCounts((prev) => ({
      ...prev,
      [key]: Math.max(0, Math.min(20, prev[key] + delta)),
    }));
  }

  function createManually() {
    // Skip the bulk flow — drop one roleplay module straight in for the
    // admin to author from scratch, then dismiss.
    startTransition(async () => {
      try {
        await addModule(trainingId, "roleplay");
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  async function generate() {
    setError(null);
    const total =
      counts.roleplay +
      counts.quiz +
      counts.gamified +
      counts.evaluation_module +
      counts.evaluation +
      counts.whatsapp_mcq;
    if (total === 0) {
      setError("Pick at least one item to generate.");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/bulk-generate-modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainingId,
          counts: {
            roleplay: counts.roleplay,
            quiz: counts.quiz,
            gamified: counts.gamified,
            evaluation_module: counts.evaluation_module,
            evaluation: counts.evaluation,
            whatsapp_mcq: counts.whatsapp_mcq,
          },
          prompt: prompt.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `generate failed: ${res.status}`);
      }
      // Server revalidated the wizard path. Nudge the router so the
      // card grid behind the modal re-renders with the new cards before
      // we close, otherwise the admin sees a flash of stale state.
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setGenerating(false);
    }
  }

  function applyTemplate(t: TrainingTemplate) {
    setCounts({
      roleplay: t.counts.roleplay,
      quiz: t.counts.quiz,
      gamified: t.counts.gamified,
      evaluation_module: t.counts.evaluation_module,
      evaluation: t.counts.evaluation,
      whatsapp_mcq: t.counts.whatsapp_mcq,
    });
    setPrompt(t.prompt);
    setTemplatePickerOpen(false);
    setError(null);
  }

  function enhancePrompt() {
    // AI prompt-rewriter would go here. Stub to keep the surface honest.
    window.alert("Prompt enhancement is coming soon.");
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Add module"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-bg border border-border rounded-[14px] w-full max-w-[960px] max-h-[90vh] flex flex-col shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 text-[12.5px] text-ink-2 hover:text-ink"
          >
            <Icon name="chevron-right" size={12} className="rotate-180" />
            Back to Trainings
          </button>
          <button
            type="button"
            onClick={createManually}
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border-strong bg-surface text-[12.5px] font-semibold hover:bg-surface-2 disabled:opacity-50"
          >
            <Icon name="wand" size={11} />
            Create Manually
          </button>
        </div>

        {/* Title */}
        <div className="px-5 pt-5">
          <h2 className="font-display text-[26px] leading-tight text-center">
            What would you like to{" "}
            <span className="text-accent relative inline-block">
              create
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-1.5 bg-accent-pale/70 -z-10 -mb-0.5"
              />
            </span>{" "}
            today?
          </h2>
        </div>

        {/* Cards grid */}
        <div className="px-5 py-5 grid gap-3 md:grid-cols-3">
          {CARDS.map((c) => (
            <ModuleTypeCard
              key={c.key}
              cfg={c}
              count={c.mode === "count" ? counts[c.key] : 0}
              onBump={(delta) =>
                c.mode === "count" ? bump(c.key, delta) : undefined
              }
              onJump={
                c.mode === "jump"
                  ? () => {
                      onClose();
                      router.push(
                        `/admin/trainings/${trainingId}/modules/new/coach`,
                      );
                    }
                  : undefined
              }
              pending={pending}
            />
          ))}
        </div>

        {/* Prompt + actions */}
        <div className="px-5 pb-5 space-y-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="Ex: A sales negotiation training for a pharmaceutical rep handling a doctor's price objection… AI will use your knowledge base as context."
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent resize-y"
            suppressHydrationWarning
          />
          <div className="flex items-center gap-2 flex-wrap">
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
              onClick={() => setTemplatePickerOpen(true)}
              disabled={pending}
              suppressHydrationWarning
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-strong disabled:opacity-60"
            >
              <Icon name="layers" size={11} />
              Use Template
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={enhancePrompt}
                disabled={pending || !prompt.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border-strong bg-surface text-[12.5px] font-semibold text-ink-2 hover:text-ink disabled:opacity-50"
              >
                + Enhance Prompt
              </button>
              <button
                type="button"
                onClick={generate}
                disabled={pending || generating}
                suppressHydrationWarning
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-strong disabled:opacity-60"
              >
                <Icon name="ai-sparkle" size={11} />
                {generating ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
              Quick prompts:
            </span>
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setPrompt(q)}
                className="text-[11.5px] font-semibold text-[#6d4ad9] bg-[#f3eafa] border border-[#c9b8f0] rounded-full px-2.5 py-1 hover:bg-[#ead9f8]"
              >
                {q}
              </button>
            ))}
          </div>
          {error ? (
            <p className="text-[11.5px] text-bad font-mono">{error}</p>
          ) : null}
        </div>
      </div>

      {templatePickerOpen ? (
        <TrainingTemplatePickerModal
          onSelect={applyTemplate}
          onClose={() => setTemplatePickerOpen(false)}
        />
      ) : null}
    </div>
  );
}

function ModuleTypeCard({
  cfg,
  count,
  onBump,
  onJump,
  pending,
}: {
  cfg: CardConfig;
  count: number;
  onBump: (delta: number) => void;
  onJump?: () => void;
  pending: boolean;
}) {
  const selected = cfg.mode === "count" && count > 0;
  return (
    <div
      className={cn(
        "border rounded-[12px] p-4 transition-colors bg-surface",
        selected ? "border-accent bg-accent-pale/30" : "border-border",
      )}
    >
      <div className="flex items-start gap-3 mb-3">
        <div
          className="w-9 h-9 grid place-items-center rounded-md text-white shrink-0"
          style={{ background: cfg.accent }}
          aria-hidden
        >
          <Icon name={cfg.icon} size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold text-ink truncate">
            {cfg.label}
          </div>
          <div className="text-[11px] text-ink-3">{cfg.kind}</div>
        </div>
      </div>
      {cfg.mode === "count" ? (
        <Stepper value={count} unit={cfg.unit} onBump={onBump} />
      ) : (
        <button
          type="button"
          onClick={onJump}
          disabled={pending}
          suppressHydrationWarning
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border-strong bg-surface text-[12px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-50"
        >
          <Icon name="wand" size={11} />
          Configure & create
        </button>
      )}
    </div>
  );
}

function Stepper({
  value,
  unit,
  onBump,
}: {
  value: number;
  unit: "module" | "question";
  onBump: (delta: number) => void;
}) {
  const label = unit === "module" ? value : `${value}Q${value === 1 ? "" : "s"}`;
  return (
    <div className="inline-flex items-center border border-border-strong rounded-md bg-surface overflow-hidden">
      <button
        type="button"
        onClick={() => onBump(-1)}
        disabled={value <= 0}
        aria-label="Decrease"
        className="w-9 h-8 grid place-items-center text-[14px] font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-30"
      >
        −
      </button>
      <span className="px-3 text-[13px] font-semibold text-ink min-w-[44px] text-center">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onBump(1)}
        aria-label="Increase"
        className="w-9 h-8 grid place-items-center text-[14px] font-semibold text-ink-2 hover:bg-surface-2"
      >
        +
      </button>
    </div>
  );
}
