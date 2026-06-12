// /admin/trainings/generator — "What would you like to create today?"
//
// Full-page version of the old in-wizard AddModuleModal. Differences:
//   - "Create Manually" jumps straight into the wizard (Step 1) on a
//      brand-new draft, skipping AI entirely.
//   - "Use Template" populates the prompt with a real 11-section
//      training-design template (PDF p6).
//   - "Enhance Prompt" rewrites the prompt into a structured brief via
//     /api/admin/training-draft/enhance.
//   - "Generate" creates a fresh draft training, calls the existing
//     bulk-generate route, then redirects into Step 2 of that training.
//
// PPT Coach is still parked as "Coming soon" — no schema row for it
// yet. Everything else (Roleplay, Gamified Activity, Assessment,
// Evaluation Questions, WhatsApp MCQ) is wired live.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createDraftTraining,
  createDraftTrainingForGenerator,
} from "@/app/admin/trainings/actions";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

// LiveKey maps to the bulk-generate route's `counts` field names.
// `evaluation_module` disambiguates the new evaluation module type
// from the QB `evaluation` kind.
type LiveKey =
  | "roleplay"
  | "quiz"
  | "gamified"
  | "evaluation_module"
  | "evaluation"
  | "whatsapp_mcq";
type FutureKey = "ppt_coach";

type CardConfig =
  | {
      key: LiveKey;
      label: string;
      kind: "Module" | "Question Bank";
      unit: "module" | "question";
      defaultCount: number;
      live: true;
      accent: string;
      icon: "chart" | "message" | "trophy" | "wand" | "clipboard";
    }
  | {
      key: FutureKey;
      label: string;
      kind: "Module" | "Question Bank";
      live: false;
      accent: string;
      icon: "chart" | "message" | "trophy" | "wand" | "clipboard";
    };

const CARDS: CardConfig[] = [
  {
    key: "ppt_coach",
    label: "PPT Coach",
    kind: "Module",
    live: false,
    accent: "#2563eb",
    icon: "chart",
  },
  {
    key: "roleplay",
    label: "Roleplay",
    kind: "Module",
    unit: "module",
    defaultCount: 1,
    live: true,
    accent: "#7c5cd6",
    icon: "message",
  },
  {
    key: "gamified",
    label: "Gamified Activity",
    kind: "Module",
    unit: "module",
    defaultCount: 1,
    live: true,
    accent: "#d4a017",
    icon: "trophy",
  },
  {
    key: "quiz",
    label: "Assessment",
    kind: "Module",
    unit: "question",
    defaultCount: 5,
    live: true,
    accent: "#10b981",
    icon: "clipboard",
  },
  {
    key: "evaluation",
    label: "Evaluation Questions",
    kind: "Question Bank",
    unit: "question",
    defaultCount: 5,
    live: true,
    accent: "#7c5cd6",
    icon: "wand",
  },
  {
    key: "whatsapp_mcq",
    label: "WhatsApp MCQ",
    kind: "Question Bank",
    unit: "question",
    defaultCount: 5,
    live: true,
    accent: "#10b981",
    icon: "message",
  },
];

const QUICK_PROMPTS = [
  "Voice · price objection",
  "Video · pharma + doctor",
  "Voice+video · 1:1",
];

// 11-section training-design template the "Use Template" button pastes
// into the prompt textarea. Matches PDF p6 verbatim minus the leading
// "# Training Generation Template" header so the admin can edit each
// bracketed slot freely.
const TEMPLATE = `Target audience:
[Enter target audience — e.g. Mid-market sales team, 1–3 years experience]

What is this training about?
[Enter topic, context, and the problem it solves — e.g. This training helps sales reps move from product-led pitches to needs-based consultative conversations with enterprise buyers]

Industry / domain:
[Enter industry or domain — e.g. Pharma, Healthcare, Financial Services]

Primary learning objective:
[Enter one clear, measurable goal — e.g. Learners will be able to identify customer pain points and tailor a solution pitch accordingly]

Supporting objectives:
1. [Enter objective — e.g. Understand the difference between features and value propositions]
2. [Enter objective — e.g. Handle common objections around price and timing]
3. [Enter objective — e.g. Ask effective discovery questions]

Core skills to develop:
[Enter skills — e.g. Active listening, Objection handling, Empathy, Negotiation, Stakeholder communication]

Evaluation criteria:
[Enter what "good" looks like — e.g. Rep asks at least 2 discovery questions before pitching. Rep acknowledges objection before responding. Rep closes with a clear next step.]

Must-cover topics:
[Enter core concepts or frameworks — e.g. SPIN selling methodology, Challenger Sale framework, discovery call structure, ROI calculation basics]

Mandatory keywords / terminology:
[Enter terms learners must use correctly — e.g. TCO, MQL, champion buyer, land-and-expand, proof of concept, SLA]

Typical scenarios to simulate:
[Enter situations learners regularly face — e.g. Cold call with a skeptical procurement manager, renewal call with a churning client, inbound demo request from an SMB]

Personas the learner will interact with:
[Enter role, attitude, and objections — e.g. CFO — cost-focused, skeptical of ROI claims / IT Manager — technical, worried about integration / Champion — enthusiastic but lacks budget authority]`;

export function GeneratorConsole() {
  const [counts, setCounts] = useState<Record<LiveKey, number>>({
    roleplay: 1,
    quiz: 0,
    gamified: 0,
    evaluation_module: 0,
    evaluation: 0,
    whatsapp_mcq: 0,
  });
  const [prompt, setPrompt] = useState("");
  const [enhancing, setEnhancing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function bump(key: LiveKey, delta: number) {
    setCounts((prev) => ({
      ...prev,
      [key]: Math.max(0, Math.min(20, prev[key] + delta)),
    }));
  }

  function useTemplate() {
    setPrompt(TEMPLATE);
  }

  async function enhancePrompt() {
    setError(null);
    if (prompt.trim().length < 10) {
      setError("Add a sentence first, then enhance.");
      return;
    }
    setEnhancing(true);
    try {
      const res = await fetch("/api/admin/training-draft/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `enhance failed: ${res.status}`);
      }
      const data = (await res.json()) as { prompt: string };
      setPrompt(data.prompt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setEnhancing(false);
    }
  }

  async function createManually() {
    setError(null);
    setGenerating(true);
    try {
      // Server action will redirect into Step 1 of the new draft.
      await createDraftTraining();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setGenerating(false);
    }
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
      // 1. Create the draft training (returns id, no redirect).
      const { id: trainingId } = await createDraftTrainingForGenerator();
      // 2. Kick off bulk-generate against the new training. This is the
      //    long-running Anthropic call (~10-30s). The route persists in
      //    a single transaction and revalidates the edit path itself.
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
      // 3. Jump into Step 2 of the freshly-populated training.
      router.push(`/admin/trainings/${trainingId}/edit?step=2`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setGenerating(false);
    }
  }

  const busy = enhancing || generating;

  return (
    <div className="max-w-[1080px] mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <a
          href="/admin/trainings"
          className="inline-flex items-center gap-1 text-[12.5px] text-ink-2 hover:text-ink"
        >
          <Icon name="chevron-right" size={12} className="rotate-180" />
          Back to Trainings
        </a>
        <button
          type="button"
          onClick={createManually}
          disabled={busy}
          suppressHydrationWarning
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-border-strong bg-surface text-[12.5px] font-semibold hover:bg-surface-2 disabled:opacity-50"
        >
          <Icon name="wand" size={11} />
          Create Manually
        </button>
      </div>

      {/* Title */}
      <h1 className="font-display text-[34px] leading-tight text-center">
        What would you like to{" "}
        <span className="text-accent relative inline-block">
          create
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-2 bg-accent-pale/70 -z-10 -mb-0.5"
          />
        </span>{" "}
        today?
      </h1>

      {/* Cards grid */}
      <div className="grid gap-3 md:grid-cols-3">
        {CARDS.map((c) => (
          <ModuleTypeCard
            key={c.key}
            cfg={c}
            count={c.live ? counts[c.key as LiveKey] : 0}
            onBump={(delta) =>
              c.live ? bump(c.key as LiveKey, delta) : undefined
            }
          />
        ))}
      </div>

      {/* Prompt + actions */}
      <div className="space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
          placeholder="Ex: A sales negotiation training for a pharmaceutical rep handling a doctor's price objection… AI will use your knowledge base as context."
          className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent resize-y leading-[1.5]"
          suppressHydrationWarning
          disabled={busy}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setPrompt("")}
            disabled={busy || !prompt}
            aria-label="Clear prompt"
            suppressHydrationWarning
            className="w-9 h-9 grid place-items-center rounded-full border border-border bg-surface text-ink-3 hover:text-ink disabled:opacity-40"
          >
            +
          </button>
          <button
            type="button"
            onClick={useTemplate}
            disabled={busy}
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
              disabled={busy || !prompt.trim()}
              suppressHydrationWarning
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border-strong bg-surface text-[12.5px] font-semibold text-ink-2 hover:text-ink disabled:opacity-50"
            >
              <Icon name="ai-sparkle" size={11} />
              {enhancing ? "Enhancing…" : "+ Enhance Prompt"}
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={busy}
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
              disabled={busy}
              suppressHydrationWarning
              className="text-[11.5px] font-semibold text-[#6d4ad9] bg-[#f3eafa] border border-[#c9b8f0] rounded-full px-2.5 py-1 hover:bg-[#ead9f8] disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
        {error ? (
          <p className="text-[12px] text-bad font-mono">{error}</p>
        ) : null}
      </div>

      {/* Full-page generating overlay — keeps the admin oriented while
          the bulk-generate Anthropic call (~10-30s) runs. */}
      {generating ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm grid place-items-center"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="bg-bg border border-border rounded-[14px] px-6 py-5 shadow-xl flex items-center gap-3 max-w-md">
            <div
              className="w-8 h-8 grid place-items-center rounded-md text-white"
              style={{ background: "var(--ai-grad, #7c5cd6)" }}
              aria-hidden
            >
              <Icon name="ai-sparkle" size={14} />
            </div>
            <div className="space-y-0.5">
              <div className="font-semibold text-[14px]">
                Generating your training…
              </div>
              <p className="text-[12px] text-ink-2">
                Drafting modules with AI. This usually takes 10–30 seconds.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModuleTypeCard({
  cfg,
  count,
  onBump,
}: {
  cfg: CardConfig;
  count: number;
  onBump: (delta: number) => void;
}) {
  const selected = cfg.live && count > 0;
  const isComingSoon = !cfg.live;
  return (
    <div
      className={cn(
        "border rounded-[12px] p-4 transition-colors bg-surface",
        selected ? "border-accent bg-accent-pale/30" : "border-border",
        isComingSoon && "opacity-60",
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
      {cfg.live ? (
        <Stepper value={count} unit={cfg.unit} onBump={onBump} />
      ) : (
        <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border bg-surface-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
          Coming soon
        </div>
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
        suppressHydrationWarning
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
        suppressHydrationWarning
        className="w-9 h-8 grid place-items-center text-[14px] font-semibold text-ink-2 hover:bg-surface-2"
      >
        +
      </button>
    </div>
  );
}
