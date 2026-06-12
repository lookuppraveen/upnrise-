// GenerateConsole — client UI for /admin/generate.
//
// Dark "Copilot Studio" hero centerpiece (matches admin-05-generate.png).
// Inside the hero: artifact toggle + brief textarea + attachment placeholder
// buttons + house-tone chip + Generate CTA. Quick Starts row underneath.
// Generated draft previews land below in their existing edit cards.
//
// Attachments (docs / URL / KB) are visual placeholders for now — they're
// labelled "soon" via tooltip and don't fire any action. Wiring real
// uploads needs file storage + URL fetcher + KB lookup, which are real
// engineering, not a styling pass.

"use client";

import { useState, useTransition } from "react";
import {
  saveGeneratedDictionary,
  saveGeneratedTraining,
} from "@/app/admin/generate/actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { AIBadge } from "@/components/ui/AIBadge";
import { cn } from "@/lib/cn";

type Kind = "training" | "dictionary";

type VideoBody = { videoScript: string; duration_min: number };
type QuizBody = {
  questions: Array<{ q: string; options: string[]; answer: number }>;
};
type DocumentBody = { markdown: string };

type ModuleDraft =
  | {
      type: "video";
      name: string;
      reason?: string;
      body: VideoBody;
    }
  | {
      type: "roleplay";
      name: string;
      reason?: string;
      persona?: string;
      scenario?: string;
    }
  | {
      type: "quiz";
      name: string;
      reason?: string;
      body: QuizBody;
    }
  | {
      type: "document";
      name: string;
      reason?: string;
      body: DocumentBody;
    };

type TrainingDraft = {
  title: string;
  description: string;
  categories: string[];
  modules: ModuleDraft[];
};

type DictionaryDraft = {
  terms: Array<{ term: string; definition: string }>;
};

export type KbSourceLite = {
  id: string;
  kind: "pdf" | "doc" | "url" | "text";
  name: string;
  size: number | null;
  sourceUrl: string | null;
};

const QUICK_STARTS: Array<{
  kind: Kind;
  title: string;
  icon: IconName;
  brief: string;
}> = [
  {
    kind: "training",
    title: "Cold-call discovery",
    icon: "training",
    brief:
      "First-call discovery for new SDRs selling fleet logistics software to mid-market ops VPs. 4 modules: a 5-min anatomy video, a roleplay with a skeptical buyer, a knowledge check on BANT, and a recap.",
  },
  {
    kind: "training",
    title: "Pricing objections",
    icon: "credit-card",
    brief:
      "Handling pricing objections for enterprise account execs. Skeptical CTO persona, 30% over budget pushback, and a 10-question assessment on quantified value framing.",
  },
  {
    kind: "training",
    title: "Empathy in tough talks",
    icon: "message",
    brief:
      "Empathy in difficult conversations for customer success managers. Roleplays for renewal at-risk accounts, churn-causing outage incidents, and post-mortem ownership.",
  },
  {
    kind: "dictionary",
    title: "Sales glossary",
    icon: "book",
    brief:
      "Sales acronyms and house terms for an enterprise SaaS team — BANT, MEDDPICC, ICP, ARR, NRR, expansion, churn, and the difference between qualified and committed.",
  },
];

export function GenerateConsole({
  houseTone,
  kbSources,
}: {
  houseTone: string | null;
  kbSources: KbSourceLite[];
}) {
  const [kind, setKind] = useState<Kind>("training");
  const [brief, setBrief] = useState("");
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);
  const [kbPickerOpen, setKbPickerOpen] = useState(false);
  const [training, setTraining] = useState<TrainingDraft | null>(null);
  const [dictionary, setDictionary] = useState<DictionaryDraft | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selectedKbSources = kbSources.filter((s) => selectedKbIds.includes(s.id));

  async function generate() {
    if (!brief.trim() || generating) return;
    setError(null);
    setTraining(null);
    setDictionary(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          brief,
          kbSourceIds: selectedKbIds.length > 0 ? selectedKbIds : undefined,
        }),
      });
      if (!res.ok) throw new Error(`generate failed: ${res.status}`);
      const data = await res.json();
      if (kind === "training") setTraining(data as TrainingDraft);
      else setDictionary(data as DictionaryDraft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setGenerating(false);
    }
  }

  function applyQuickStart(qs: (typeof QUICK_STARTS)[number]) {
    setKind(qs.kind);
    setBrief(qs.brief);
    setTraining(null);
    setDictionary(null);
  }

  function saveTraining() {
    if (!training) return;
    startTransition(() => void saveGeneratedTraining(training));
  }

  function saveDictionary() {
    if (!dictionary) return;
    startTransition(() => void saveGeneratedDictionary(dictionary));
  }

  return (
    <div className="space-y-6">
      {/* Copilot Studio hero */}
      <div
        className="relative overflow-hidden rounded-[16px] border text-white p-7"
        style={{
          background:
            "radial-gradient(circle at top right, rgba(232,93,58,0.22) 0%, transparent 55%), linear-gradient(135deg, #2a1f2e 0%, #1a1320 60%, #221624 100%)",
          borderColor: "#2a2230",
        }}
      >
        {/* Eyebrow + artifact toggle row */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-accent">
            <Icon name="ai-sparkle" size={11} />
            Copilot Studio
          </div>
          <span className="text-white/30">·</span>
          <div
            role="radiogroup"
            aria-label="Artifact type"
            className="inline-flex items-center gap-1 p-1 rounded-full"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <KindToggle
              value="training"
              active={kind === "training"}
              onClick={() => setKind("training")}
            >
              Training
            </KindToggle>
            <KindToggle
              value="dictionary"
              active={kind === "dictionary"}
              onClick={() => setKind("dictionary")}
            >
              Dictionary
            </KindToggle>
          </div>
        </div>

        <h2 className="font-display text-[32px] leading-[1.1] -tracking-[0.015em] mt-4">
          What would you like to create today?
        </h2>
        <p className="text-[14px] leading-[1.55] text-white/70 mt-2 max-w-[640px]">
          Drop a doc, paste a URL, or just describe it. I&apos;ll draft training
          modules, roleplay personas, quizzes, and more — already in your
          house style.
        </p>

        {/* Inset brief textarea */}
        <div
          className="mt-5 rounded-[12px] bg-white text-ink border"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={4}
            placeholder={
              kind === "training"
                ? "Create a 4-module training on handling pricing objections for our enterprise sales team. Include a skeptical CTO roleplay and a 10-question assessment."
                : "Sales acronyms and house terms for an enterprise SaaS team — BANT, MEDDPICC, ICP, ARR, expansion, churn."
            }
            className={cn(
              "w-full resize-none bg-transparent px-4 py-3 text-[13.5px] leading-[1.55]",
              "focus:outline-none placeholder:text-ink-3",
            )}
            suppressHydrationWarning
          />

          {/* Tool strip — placeholders + house tone + generate */}
          <div className="flex items-center gap-2 flex-wrap px-3 py-[10px] border-t border-border">
            <button
              type="button"
              onClick={() => setKbPickerOpen(true)}
              className={cn(
                "inline-flex items-center gap-1.5 text-[12px] font-medium px-[10px] py-[5px] rounded-[7px]",
                "border border-border hover:bg-border",
                selectedKbIds.length > 0
                  ? "bg-accent-pale text-accent-strong border-accent/30"
                  : "bg-surface-2 text-ink-2",
              )}
              title={`Pick KB sources to ground the draft (${kbSources.length} available)`}
            >
              <Icon name="book" size={12} />
              {selectedKbIds.length > 0
                ? `${selectedKbIds.length} source${selectedKbIds.length === 1 ? "" : "s"} attached`
                : "Knowledge base"}
            </button>

            <div className="ml-auto flex items-center gap-2 flex-wrap">
              {houseTone ? (
                <span
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-[10px] py-[5px] rounded-full bg-accent-pale text-accent-strong border border-accent/15 max-w-[260px] truncate"
                  title={`House tone · ${houseTone}`}
                >
                  <Icon name="ai-sparkle" size={11} />
                  House tone: {houseTone}
                </span>
              ) : null}

              <button
                type="button"
                onClick={generate}
                disabled={!brief.trim() || generating}
                className={cn(
                  "inline-flex items-center gap-1.5 h-[34px] px-4 rounded-[8px]",
                  "bg-ink text-white text-[12.5px] font-semibold",
                  "hover:bg-[#2a2a2a] disabled:opacity-50 disabled:cursor-not-allowed",
                )}
                style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.12)" }}
              >
                <Icon name="ai-sparkle" size={12} />
                {generating ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>
        </div>

        {selectedKbSources.length > 0 ? (
          <div className="flex items-center gap-1.5 flex-wrap mt-3">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/60 mr-1">
              Grounded in
            </span>
            {selectedKbSources.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 text-[11px] font-semibold bg-white/[0.08] text-white border border-white/15 rounded-full pl-2 pr-1 py-[2px]"
              >
                {s.name}
                <button
                  type="button"
                  onClick={() =>
                    setSelectedKbIds((ids) => ids.filter((x) => x !== s.id))
                  }
                  className="text-white/60 hover:text-white px-1"
                  aria-label={`Remove ${s.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {error ? (
          <div className="text-[12px] text-warn-pale bg-bad/40 border border-bad/30 rounded-md px-3 py-2 mt-3 font-mono">
            {error}
          </div>
        ) : null}
      </div>

      {kbPickerOpen ? (
        <KbPickerModal
          sources={kbSources}
          selected={selectedKbIds}
          onChange={setSelectedKbIds}
          onClose={() => setKbPickerOpen(false)}
        />
      ) : null}

      {/* Quick Starts */}
      <section className="space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
          Quick starts
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {QUICK_STARTS.map((qs) => (
            <button
              key={qs.title}
              type="button"
              onClick={() => applyQuickStart(qs)}
              className={cn(
                "text-left bg-surface border border-border rounded-[12px] p-[14px]",
                "hover:border-ink transition-colors min-h-[124px]",
                "flex flex-col gap-2",
              )}
            >
              <div
                className={cn(
                  "w-9 h-9 grid place-items-center rounded-md shrink-0",
                  qs.kind === "training"
                    ? "bg-accent-pale text-accent-strong"
                    : "bg-[#ede9fe] text-[#6d4ad9]",
                )}
              >
                <Icon name={qs.icon} size={16} />
              </div>
              <div className="space-y-1">
                <div className="font-semibold text-[13.5px] text-ink">
                  {qs.title}
                </div>
                <div className="text-[11.5px] text-ink-3 line-clamp-2 leading-[1.45]">
                  {qs.brief}
                </div>
              </div>
              <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3 mt-auto">
                {qs.kind === "training" ? "Training" : "Dictionary"} ·
                click to fill
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Generated previews */}
      {training ? (
        <TrainingPreview
          draft={training}
          onChange={setTraining}
          onSave={saveTraining}
          pending={pending}
        />
      ) : null}
      {dictionary ? (
        <DictionaryPreview
          draft={dictionary}
          onChange={setDictionary}
          onSave={saveDictionary}
          pending={pending}
        />
      ) : null}
    </div>
  );
}

// ─────────────── hero atoms ───────────────

function KindToggle({
  value,
  active,
  onClick,
  children,
}: {
  value: Kind;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      data-kind={value}
      className={cn(
        "px-[12px] py-[5px] rounded-full text-[12px] font-semibold transition-colors",
        active ? "bg-white text-ink" : "text-white/80 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

// ─────────────── Training preview ───────────────

function TrainingPreview({
  draft,
  onChange,
  onSave,
  pending,
}: {
  draft: TrainingDraft;
  onChange: (d: TrainingDraft) => void;
  onSave: () => void;
  pending: boolean;
}) {
  return (
    <Card pad="lg" className="space-y-4 rounded-[12px] border-accent/30">
      <div className="flex items-center gap-2">
        <AIBadge>Draft</AIBadge>
        <span className="text-[12.5px] text-ink-2">
          Review and edit, then save as a draft training.
        </span>
      </div>
      <label className="block space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          Title
        </span>
        <input
          value={draft.title}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
          className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[14px] font-semibold focus:outline-none focus:border-accent"
          suppressHydrationWarning
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          Description
        </span>
        <textarea
          value={draft.description}
          onChange={(e) =>
            onChange({ ...draft, description: e.target.value })
          }
          rows={3}
          className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent resize-none"
          suppressHydrationWarning
        />
      </label>
      <div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          Categories
        </span>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {draft.categories.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] bg-surface-2 border border-border rounded-sm pl-2 pr-1 py-[2px]"
            >
              {c}
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...draft,
                    categories: draft.categories.filter((x) => x !== c),
                  })
                }
                className="text-ink-3 hover:text-ink px-1"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      <div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          Modules ({draft.modules.length})
        </span>
        <div className="space-y-2 mt-2">
          {draft.modules.map((m, i) => (
            <ModulePreviewCard
              key={i}
              module={m}
              onRemove={() =>
                onChange({
                  ...draft,
                  modules: draft.modules.filter((_, j) => j !== i),
                })
              }
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          variant="accent"
          size="md"
          onClick={onSave}
          disabled={pending || draft.modules.length === 0}
        >
          {pending ? "Saving…" : "Save as draft training"}
        </Button>
      </div>
    </Card>
  );
}

// ─────────────── Module preview card ───────────────

const TYPE_LABEL: Record<ModuleDraft["type"], string> = {
  video: "Video",
  roleplay: "Roleplay",
  quiz: "Quiz",
  document: "Document",
};

function ModulePreviewCard({
  module: m,
  onRemove,
}: {
  module: ModuleDraft;
  onRemove: () => void;
}) {
  return (
    <div className="p-3 rounded-md bg-surface-2 border border-border space-y-2">
      <div className="flex items-start gap-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3 mt-0.5 shrink-0">
          {TYPE_LABEL[m.type]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[13px]">{m.name}</div>
          {m.reason ? (
            <div className="text-[11.5px] text-ink-3 mt-0.5">{m.reason}</div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-[11px] text-ink-3 hover:text-bad px-2 py-1 rounded-md hover:bg-bad-pale shrink-0"
        >
          Remove
        </button>
      </div>

      {m.type === "video" ? (
        <div className="space-y-1 pt-1 border-t border-border">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
            Video script · ~{m.body.duration_min} min
          </div>
          <p className="text-[12px] text-ink-2 leading-[1.55] whitespace-pre-wrap line-clamp-6">
            {m.body.videoScript}
          </p>
        </div>
      ) : null}

      {m.type === "quiz" ? (
        <div className="space-y-1 pt-1 border-t border-border">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
            {m.body.questions.length} question
            {m.body.questions.length === 1 ? "" : "s"}
          </div>
          <ol className="space-y-1 text-[11.5px] text-ink-2">
            {m.body.questions.slice(0, 3).map((q, i) => (
              <li key={i} className="leading-[1.45]">
                <span className="font-mono text-ink-3">{i + 1}.</span> {q.q}
              </li>
            ))}
            {m.body.questions.length > 3 ? (
              <li className="text-ink-3 italic">
                + {m.body.questions.length - 3} more
              </li>
            ) : null}
          </ol>
        </div>
      ) : null}

      {m.type === "document" ? (
        <div className="space-y-1 pt-1 border-t border-border">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
            Document body
          </div>
          <p className="text-[12px] text-ink-2 leading-[1.55] whitespace-pre-wrap line-clamp-6">
            {m.body.markdown}
          </p>
        </div>
      ) : null}

      {m.type === "roleplay" && (m.persona || m.scenario) ? (
        <div className="space-y-1 pt-1 border-t border-border text-[11.5px] text-ink-2">
          {m.persona ? (
            <div>
              <span className="font-semibold text-ink-3">Persona:</span>{" "}
              {m.persona}
            </div>
          ) : null}
          {m.scenario ? (
            <div>
              <span className="font-semibold text-ink-3">Scenario:</span>{" "}
              {m.scenario}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─────────────── KB picker modal ───────────────

const KB_KIND_LABEL: Record<KbSourceLite["kind"], string> = {
  text: "Text",
  url: "URL",
  doc: "File",
  pdf: "PDF",
};

function KbPickerModal({
  sources,
  selected,
  onChange,
  onClose,
}: {
  sources: KbSourceLite[];
  selected: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
}) {
  function toggle(id: string) {
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-[14px] shadow-xl w-[min(640px,calc(100vw-32px))] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-display text-[20px] -tracking-[0.01em] text-ink">
              Pick grounding sources
            </h3>
            <p className="text-[12px] text-ink-3 mt-0.5">
              The AI will reference these when drafting. Add more on{" "}
              <a href="/admin/knowledge" className="underline">
                Knowledge Base
              </a>
              .
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:text-ink w-8 h-8 grid place-items-center rounded-md hover:bg-surface-2 text-[18px]"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {sources.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-[13px] text-ink-2">
                No KB sources yet.
              </p>
              <a
                href="/admin/knowledge"
                className="text-[12.5px] text-accent underline mt-2 inline-block"
              >
                Add your first source →
              </a>
            </div>
          ) : (
            sources.map((s) => {
              const isOn = selected.includes(s.id);
              return (
                <label
                  key={s.id}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-md border cursor-pointer",
                    isOn
                      ? "bg-accent-pale border-accent/30"
                      : "bg-surface-2 border-border hover:border-border-strong",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isOn}
                    onChange={() => toggle(s.id)}
                    className="accent-accent mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[13px] text-ink truncate">
                        {s.name}
                      </span>
                      <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
                        {KB_KIND_LABEL[s.kind]}
                      </span>
                    </div>
                    <div className="text-[11.5px] font-mono text-ink-3 mt-0.5">
                      {s.size != null
                        ? `${s.size >= 1000 ? Math.round(s.size / 1000) + "k" : s.size} chars`
                        : "—"}
                      {s.sourceUrl ? ` · ${s.sourceUrl}` : ""}
                    </div>
                  </div>
                </label>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={selected.length === 0}
            className="text-[12.5px] text-ink-3 hover:text-ink disabled:opacity-40"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-[12.5px] font-semibold px-3 py-1.5 rounded-md bg-ink text-white hover:bg-[#2a2a2a]"
          >
            Done · {selected.length} attached
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────── Dictionary preview ───────────────

function DictionaryPreview({
  draft,
  onChange,
  onSave,
  pending,
}: {
  draft: DictionaryDraft;
  onChange: (d: DictionaryDraft) => void;
  onSave: () => void;
  pending: boolean;
}) {
  return (
    <Card pad="lg" className="space-y-4 rounded-[12px] border-accent/30">
      <div className="flex items-center gap-2">
        <AIBadge>Draft</AIBadge>
        <span className="text-[12.5px] text-ink-2">
          {draft.terms.length} entries. Edit or remove any before saving.
        </span>
      </div>
      <div className="space-y-2">
        {draft.terms.map((t, i) => (
          <div
            key={i}
            className="p-3 rounded-md bg-surface-2 border border-border space-y-2"
          >
            <input
              value={t.term}
              onChange={(e) => {
                const next = [...draft.terms];
                next[i] = { ...t, term: e.target.value };
                onChange({ terms: next });
              }}
              className="w-full bg-surface border border-border rounded-md px-2 py-1 text-[13.5px] font-semibold focus:outline-none focus:border-accent"
              suppressHydrationWarning
            />
            <textarea
              value={t.definition}
              onChange={(e) => {
                const next = [...draft.terms];
                next[i] = { ...t, definition: e.target.value };
                onChange({ terms: next });
              }}
              rows={2}
              className="w-full bg-surface border border-border rounded-md px-2 py-1 text-[12.5px] focus:outline-none focus:border-accent resize-none"
              suppressHydrationWarning
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() =>
                  onChange({
                    terms: draft.terms.filter((_, j) => j !== i),
                  })
                }
                className="text-[11px] text-ink-3 hover:text-bad px-2 py-1 rounded-md hover:bg-bad-pale"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button
          variant="accent"
          size="md"
          onClick={onSave}
          disabled={pending || draft.terms.length === 0}
        >
          {pending ? "Saving…" : `Save ${draft.terms.length} terms`}
        </Button>
      </div>
    </Card>
  );
}
