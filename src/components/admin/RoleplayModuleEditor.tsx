// Roleplay per-module editor — full Step 1/2/3 layout.
//
// Rendered from ModuleEditPage when `m.type === "roleplay"`. Replaces
// the simple persona+scenario textareas with the design's three-step
// structure:
//
//   Step 1 — Roleplay setup
//       Characters (Person 1 / Person 2 + Persona card)
//       Scenario (rich text editor — toolbar is visual-only for now)
//       Ideal Conversation
//   Step 2 — Visual Aid
//   Step 3 — Reporting
//       Keywords (+ Show Keywords toggle)
//       Evaluation Criteria (Scoring Mode + checklist items)
//       Additional Settings (modal — Phase L)
//
// All state lives in module.body except scenario which is mirrored
// into RoleplayConfig.scenario for runtime compatibility. One Save
// button writes the whole shape through saveRoleplayModule.

"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteModule,
  saveRoleplayModule,
} from "@/app/admin/trainings/actions";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import {
  deepEqualJson,
  useUnsavedChangesGuard,
} from "@/hooks/useUnsavedChangesGuard";
import {
  DEFAULT_PERSONA,
  PersonaModal,
  type PersonaData,
} from "@/components/admin/PersonaModal";
import type { SavedPortrait } from "@/components/admin/DidPortraitPickerModal";
import {
  AdditionalSettingsModal,
  DEFAULT_ADDITIONAL_SETTINGS,
  type AdditionalSettings,
} from "@/components/admin/AdditionalSettingsModal";
import { cn } from "@/lib/cn";

type VisualAid = { name: string; url: string };
type ChecklistItem = { id: string; label: string; visible: boolean };
type EvalCriterion = { id: string; label: string; items: ChecklistItem[] };

type RoleplayBody = {
  person1?: string;
  person2?: string;
  scenario?: string;
  idealConversation?: string;
  visualAids?: VisualAid[];
  keywords?: string[];
  showKeywords?: boolean;
  scoringMode?: "checklist" | "standard";
  evaluationCriteria?: EvalCriterion[];
  additionalSettings?: AdditionalSettings | Record<string, unknown>;
  persona?: PersonaData;
};

export function RoleplayModuleEditor({
  trainingId,
  trainingTitle,
  moduleId,
  initialName,
  initialPublished,
  body,
  roleplayConfig,
  savedPortraits = [],
}: {
  trainingId: string;
  trainingTitle: string;
  moduleId: string;
  initialName: string;
  initialPublished: boolean;
  body: Record<string, unknown> | null;
  roleplayConfig: { persona: string; scenario: string } | null;
  savedPortraits?: SavedPortrait[];
}) {
  const initial = useMemo(() => {
    const b = (body ?? {}) as RoleplayBody;
    return {
      person1: b.person1 ?? "Sales Rep",
      person2: b.person2 ?? roleplayConfig?.persona ?? "Customer",
      scenario: b.scenario ?? roleplayConfig?.scenario ?? "",
      idealConversation: b.idealConversation ?? "",
      visualAids: b.visualAids ?? [],
      keywords: b.keywords ?? [],
      showKeywords: b.showKeywords ?? true,
      scoringMode: b.scoringMode ?? "checklist",
      evaluationCriteria: b.evaluationCriteria ?? [],
      // Merge stored persona over defaults so modules saved before the
      // LiveAvatar override fields landed still parse cleanly — without
      // this `initial.liveAvatarId` is undefined and useState binds to
      // undefined, drifting from the `string | null` contract.
      persona: { ...DEFAULT_PERSONA, ...(b.persona ?? {}) },
      additionalSettings: isAdditionalSettings(b.additionalSettings)
        ? (b.additionalSettings as AdditionalSettings)
        : DEFAULT_ADDITIONAL_SETTINGS,
    };
  }, [body, roleplayConfig]);

  const [name, setName] = useState(initialName);
  const [published, setPublished] = useState(initialPublished);
  const [person1, setPerson1] = useState(initial.person1);
  const [person2, setPerson2] = useState(initial.person2);
  const [scenario, setScenario] = useState(initial.scenario);
  const [idealConversation, setIdealConversation] = useState(
    initial.idealConversation,
  );
  const [visualAids, setVisualAids] = useState<VisualAid[]>(initial.visualAids);
  const [keywords, setKeywords] = useState<string[]>(initial.keywords);
  const [showKeywords, setShowKeywords] = useState(initial.showKeywords);
  const [scoringMode, setScoringMode] = useState<"checklist" | "standard">(
    initial.scoringMode,
  );
  const [criteria, setCriteria] = useState<EvalCriterion[]>(
    initial.evaluationCriteria,
  );
  const [persona, setPersona] = useState<PersonaData>(initial.persona);
  const [additionalSettings, setAdditionalSettings] = useState<AdditionalSettings>(
    initial.additionalSettings,
  );
  const [showPersona, setShowPersona] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);
  const [generatingIdeal, setGeneratingIdeal] = useState(false);
  const [idealError, setIdealError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idealRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // Track unsaved edits so a tab close / hard refresh prompts.
  const dirty = !deepEqualJson(
    {
      name,
      published,
      person1,
      person2,
      scenario,
      idealConversation,
      visualAids,
      keywords,
      showKeywords,
      scoringMode,
      criteria,
      persona,
      additionalSettings,
    },
    {
      name: initialName,
      published: initialPublished,
      person1: initial.person1,
      person2: initial.person2,
      scenario: initial.scenario,
      idealConversation: initial.idealConversation,
      visualAids: initial.visualAids,
      keywords: initial.keywords,
      showKeywords: initial.showKeywords,
      scoringMode: initial.scoringMode,
      criteria: initial.evaluationCriteria,
      persona: initial.persona,
      additionalSettings: initial.additionalSettings,
    },
  );
  useUnsavedChangesGuard(dirty);

  async function save(thenBack: boolean) {
    setError(null);
    return new Promise<void>((resolve, reject) => {
      startTransition(async () => {
        try {
          await saveRoleplayModule(trainingId, moduleId, {
            name,
            published,
            person1,
            person2,
            scenario,
            idealConversation,
            visualAids,
            keywords,
            showKeywords,
            scoringMode,
            evaluationCriteria: criteria,
            persona,
            additionalSettings,
          });
          toast.success("Module saved");
          if (thenBack) {
            router.push(`/admin/trainings/${trainingId}/edit?step=2`);
          } else {
            router.refresh();
          }
          resolve();
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Save failed";
          setError(msg);
          toast.error("Save failed", msg);
          reject(e);
        }
      });
    });
  }

  async function generateWithAi() {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/regenerate-roleplay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainingId,
          moduleId,
          person1,
          person2,
          scenario,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `regenerate failed: ${res.status}`);
      }
      const draft = (await res.json()) as {
        name: string;
        persona: string;
        scenario: string;
        keywords: string[];
        idealConversation: string;
      };
      setName(draft.name);
      setScenario(draft.scenario);
      setKeywords(draft.keywords);
      setIdealConversation(draft.idealConversation);
      toast.success("AI draft ready", "Review and click Save to keep it.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generate failed";
      setError(msg);
      toast.error("Generate failed", msg);
    } finally {
      setGenerating(false);
    }
  }

  async function generateIdealConversation() {
    setIdealError(null);
    setGeneratingIdeal(true);
    try {
      const res = await fetch(
        "/api/admin/create-roleplay/ideal-conversation",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trainingId,
            person1,
            person2,
            scenario,
            persona: {
              title: persona.title,
              behavior: persona.behavior,
              backgroundDetails: persona.backgroundDetails,
              additionalPrompt: persona.additionalPrompt,
            },
          }),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          issues?: { fieldErrors?: Record<string, string[]> };
        };
        const fields = data.issues?.fieldErrors;
        const detail = fields
          ? Object.entries(fields)
              .flatMap(([k, vs]) => (vs ?? []).map((v) => `${k}: ${v}`))
              .join("; ")
          : "";
        throw new Error(
          [data.error, detail].filter(Boolean).join(" — ") ||
            `generate failed: ${res.status}`,
        );
      }
      const data = (await res.json()) as { idealConversation: string };
      setIdealConversation(data.idealConversation);
      toast.success("Ideal conversation drafted");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      setIdealError(msg);
      toast.error("Generate failed", msg);
    } finally {
      setGeneratingIdeal(false);
    }
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

  return (
    <div className="space-y-6">
      {/* Top training title */}
      <h1 className="font-display text-[22px] text-accent">
        Edit Training -{" "}
        <span className="font-semibold">{trainingTitle}</span>
      </h1>

      {/* Back link + Back/Generate buttons row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link
          href={`/admin/trainings/${trainingId}/edit?step=2`}
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink"
        >
          <Icon name="chevron-right" size={12} className="rotate-180" />
          Back to Modules
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/trainings/${trainingId}/edit?step=2`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-surface text-[12.5px] font-semibold text-ink-2 hover:text-ink"
          >
            <Icon name="chevron-right" size={11} className="rotate-180" />
            Back
          </Link>
          <a
            href={`/admin/preview/trainings/${trainingId}/modules/${moduleId}/play`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-surface text-[12.5px] font-semibold text-ink-2 hover:text-ink"
            title="Open the trainee player in a new tab — talk to the persona to test the conversation."
          >
            <Icon name="play" size={11} />
            Preview as trainee
          </a>
          <button
            type="button"
            onClick={generateWithAi}
            disabled={pending || generating}
            suppressHydrationWarning
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-strong disabled:opacity-60"
          >
            <Icon name="ai-sparkle" size={11} />
            {generating ? "Generating…" : "Generate using AI"}
          </button>
        </div>
      </div>

      {/* Name + Status row */}
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

      {/* ── Step 1 ── */}
      <div className="space-y-4">
        <SectionTitle>
          Step 1 - <span className="text-accent">Roleplay setup</span>
        </SectionTitle>

        {/* Characters */}
        <Card>
          <div className="flex items-start justify-between gap-4">
            <CardTitle>Characters</CardTitle>
            <PersonaThumb
              persona={persona}
              onOpen={() => setShowPersona(true)}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2 mt-3">
            <Field label="Person 1 (Human)">
              <input
                value={person1}
                onChange={(e) => setPerson1(e.target.value)}
                placeholder="Sales Rep"
                className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent"
                suppressHydrationWarning
              />
            </Field>
            <Field label="Person 2 (AI)">
              <input
                value={person2}
                onChange={(e) => setPerson2(e.target.value)}
                placeholder="Customer"
                className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent"
                suppressHydrationWarning
              />
            </Field>
          </div>
        </Card>

        {/* Scenario */}
        <Card>
          <CardTitle>Scenario</CardTitle>
          <p className="text-[12px] text-ink-3 mt-1">
            Provide the background and situation for the roleplay.
          </p>
          <FakeRichEditor
            value={scenario}
            onChange={setScenario}
            highlightBorder={!scenario.trim()}
            minHeight={120}
          />
        </Card>

        {/* Ideal Conversation */}
        <Card>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <CardTitle>Ideal Conversation</CardTitle>
              <p className="text-[12px] text-ink-3 mt-1">
                Add a sample dialogue flow that guides how the AI should
                respond. Choose how to add it:
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => idealRef.current?.focus()}
                disabled={generatingIdeal}
                suppressHydrationWarning
                title="Type the conversation yourself"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-surface text-[12px] font-semibold text-ink-2 hover:text-ink hover:bg-surface-2 disabled:opacity-60"
              >
                <Icon name="wand" size={11} />
                Manual
              </button>
              <button
                type="button"
                onClick={generateIdealConversation}
                disabled={generatingIdeal}
                suppressHydrationWarning
                title="Auto-generate from scenario + persona"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                style={{ background: "var(--ai-grad, #7c5cd6)" }}
              >
                <Icon name="ai-sparkle" size={11} />
                {generatingIdeal ? "Generating…" : "AI Generate"}
              </button>
            </div>
          </div>
          <textarea
            ref={idealRef}
            value={idealConversation}
            onChange={(e) => setIdealConversation(e.target.value)}
            rows={9}
            placeholder={`${person1 || "Customer"}: Hello, can you tell me about your pricing?\n${person2 || "Sales Rep"}: Sure — happy to walk you through it.`}
            className="mt-3 w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent resize-y leading-relaxed"
            suppressHydrationWarning
          />
          {idealError ? (
            <p className="mt-2 text-[11.5px] text-bad font-mono break-words">
              {idealError}
            </p>
          ) : null}
        </Card>
      </div>

      {/* ── Step 2 — Visual Aid ── */}
      <div className="space-y-4">
        <SectionTitle>
          Step 2 - <span className="text-accent">Visual Aid</span>
        </SectionTitle>
        <VisualAidsCard aids={visualAids} onChange={setVisualAids} />
      </div>

      {/* ── Step 3 — Reporting ── */}
      <div className="space-y-4">
        <SectionTitle>
          Step 3 - <span className="text-accent">Reporting</span>
        </SectionTitle>

        {/* Keywords */}
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Keywords</CardTitle>
              <p className="text-[12px] text-ink-3 mt-1">
                Provide keywords to be covered by the user during roleplay
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-[12.5px] text-ink shrink-0">
              <input
                type="checkbox"
                checked={showKeywords}
                onChange={(e) => setShowKeywords(e.target.checked)}
                className="w-4 h-4 accent-accent"
                suppressHydrationWarning
              />
              Show Keywords
            </label>
          </div>
          <KeywordsList values={keywords} onChange={setKeywords} />
        </Card>

        {/* Evaluation Criteria */}
        <Card>
          <CardTitle>Evaluation Criteria</CardTitle>
          <p className="text-[12px] text-ink-3 mt-1">
            Add Skills &amp; Checklist items on which user will be evaluated
          </p>
          <div className="mt-3 space-y-2">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
              Scoring Mode
            </div>
            <ScoringToggle value={scoringMode} onChange={setScoringMode} />
            <p className="text-[11.5px] text-ink-3">
              {scoringMode === "checklist"
                ? "Attach checklist items to each criterion for structured scoring."
                : "Score each criterion on a 0–100 scale; no per-item checklist."}
            </p>
          </div>
          <CriteriaList
            scoringMode={scoringMode}
            criteria={criteria}
            onChange={setCriteria}
          />
        </Card>

        <div>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            suppressHydrationWarning
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-strong"
          >
            <Icon name="settings" size={11} />
            Additional Settings
          </button>
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
            onClick={() => void save(false)}
            disabled={pending}
            suppressHydrationWarning
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-ink text-white text-[12.5px] font-semibold hover:bg-[#2a2a2a] disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => void save(true)}
            disabled={pending}
            suppressHydrationWarning
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-strong disabled:opacity-60"
          >
            <Icon name="chevron-right" size={11} className="rotate-180" />
            Save &amp; Back to Modules
          </button>
        </div>
      </div>

      {showSettings ? (
        <AdditionalSettingsModal
          trainingId={trainingId}
          moduleId={moduleId}
          initial={additionalSettings}
          seedPrompt={
            [trainingTitle, scenario].filter(Boolean).join(" — ") ||
            undefined
          }
          onClose={() => setShowSettings(false)}
          onSave={(next) => {
            setAdditionalSettings(next);
            setShowSettings(false);
          }}
        />
      ) : null}

      {showPersona ? (
        <PersonaModal
          initial={persona}
          trainingId={trainingId}
          person1={person1}
          person2={person2}
          scenario={scenario}
          savedPortraits={savedPortraits}
          onClose={() => setShowPersona(false)}
          onSave={(p) => {
            setPersona(p);
            setShowPersona(false);
          }}
        />
      ) : null}
    </div>
  );
}

// ─────────────── Small UI primitives ───────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display text-[18px] text-ink leading-tight">
      {children}
    </h3>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-[12px] p-5">
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[14.5px] font-semibold text-ink">{children}</div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[12.5px] font-semibold text-ink">{label}</span>
      {children}
    </label>
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

// ─────────────── Persona thumbnail (Phase J landing) ───────────────

// Click → opens the PersonaModal. The swatch hints at the selected
// background; the glyph hints at the selected avatar gender. Empty
// state (no avatarId) falls back to the default gradient.
function PersonaThumb({
  persona,
  onOpen,
}: {
  persona: PersonaData;
  onOpen: () => void;
}) {
  const bgSwatch = PERSONA_BG_SWATCH[persona.backgroundId ?? ""] ??
    "linear-gradient(140deg, #c9d6ea 0%, #e2e8f4 50%, #f4eedd 100%)";
  const glyph =
    persona.avatarGender === "female"
      ? "👩"
      : persona.avatarGender === "neutral"
        ? "🧑"
        : "👨";
  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={onOpen}
        suppressHydrationWarning
        className="block w-[120px] rounded-[10px] border border-border bg-surface-2 overflow-hidden hover:border-accent transition-colors"
      >
        <div className="px-2 py-1 flex items-center gap-1 text-[11.5px] font-semibold text-accent">
          <Icon name="wand" size={10} />
          Persona
        </div>
        <div
          className="h-[78px] w-full grid place-items-end justify-center pb-1"
          style={{ background: bgSwatch }}
          aria-hidden
        >
          <span className="text-[32px] leading-none">{glyph}</span>
        </div>
      </button>
    </div>
  );
}

// Mini swatch lookup so the Characters thumbnail mirrors whatever
// background the admin picked inside the modal. Subset of the full
// list — synced manually so PersonaModal stays the source of truth.
const PERSONA_BG_SWATCH: Record<string, string> = {
  office: "linear-gradient(140deg,#eaf2fa,#cfdfee 70%,#a8c0db)",
  lounge: "linear-gradient(140deg,#e6e8e0,#cdd2c4 70%,#b8bca9)",
  hospital: "linear-gradient(140deg,#f0f6fa,#dee7ec 70%,#c2cfd6)",
  studio: "linear-gradient(140deg,#bee7f0,#86d6e2 70%,#54bcca)",
  factory: "linear-gradient(140deg,#a4adb6,#4f5762 60%,#2c2f36)",
  blank: "linear-gradient(140deg,#f5f9fc,#e2ecf3)",
  clinic: "linear-gradient(140deg,#7ebcd1,#3a82a0)",
  pharmacy: "linear-gradient(140deg,#3a3a3a,#1a1a1a)",
  retail: "linear-gradient(140deg,#dfe6eb,#aab8c0 70%,#8693a1)",
};

// ─────────────── Fake rich editor ───────────────

function FakeRichEditor({
  value,
  onChange,
  highlightBorder,
  minHeight = 100,
}: {
  value: string;
  onChange: (v: string) => void;
  highlightBorder?: boolean;
  minHeight?: number;
}) {
  return (
    <div
      className={cn(
        "mt-3 rounded-md overflow-hidden bg-surface",
        highlightBorder
          ? "border border-bad"
          : "border border-border-strong",
      )}
    >
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-border bg-surface-2 text-[11.5px] text-ink-2">
        <FakeBtn>Paragraph ▾</FakeBtn>
        <FakeBtn>System Font ▾</FakeBtn>
        <FakeBtn>12pt ▾</FakeBtn>
        <Sep />
        <FakeBtn ariaLabel="Bold"><b>B</b></FakeBtn>
        <FakeBtn ariaLabel="Italic"><i>I</i></FakeBtn>
        <FakeBtn ariaLabel="Underline"><u>U</u></FakeBtn>
        <Sep />
        <FakeBtn ariaLabel="Align">≡▾</FakeBtn>
        <FakeBtn ariaLabel="Ordered list">1.</FakeBtn>
        <FakeBtn ariaLabel="Bulleted list">•</FakeBtn>
        <Sep />
        <FakeBtn ariaLabel="Text color"><span style={{ color: "#ef4444" }}>A</span>▾</FakeBtn>
        <FakeBtn ariaLabel="Highlight"><span style={{ background: "#fde68a", padding: "0 2px" }}>A</span>▾</FakeBtn>
        <Sep />
        <FakeBtn ariaLabel="Link">🔗</FakeBtn>
        <FakeBtn ariaLabel="Table">⊞▾</FakeBtn>
        <FakeBtn ariaLabel="Variables">{"{ }"}</FakeBtn>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ minHeight }}
        className="w-full px-3 py-2.5 text-[13px] bg-transparent border-0 focus:outline-none resize-y leading-relaxed"
        suppressHydrationWarning
      />
    </div>
  );
}

function FakeBtn({
  children,
  ariaLabel,
}: {
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={(e) => e.preventDefault()}
      className="px-1.5 py-0.5 rounded text-[11.5px] text-ink-2 hover:bg-surface"
      suppressHydrationWarning
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-1 h-4 w-px bg-border" aria-hidden />;
}

// ─────────────── Visual Aids ───────────────

function VisualAidsCard({
  aids,
  onChange,
}: {
  aids: VisualAid[];
  onChange: (a: VisualAid[]) => void;
}) {
  function add() {
    onChange([...aids, { name: "", url: "" }]);
  }
  function update(i: number, patch: Partial<VisualAid>) {
    onChange(aids.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }
  function remove(i: number) {
    onChange(aids.filter((_, idx) => idx !== i));
  }
  if (aids.length === 0) {
    return (
      <button
        type="button"
        onClick={add}
        suppressHydrationWarning
        className="w-full border-2 border-dashed border-accent rounded-[12px] p-5 text-left hover:bg-accent-pale/20 transition-colors"
      >
        <div className="text-[14.5px] font-semibold text-accent">
          + Add Visual Aid
        </div>
        <p className="text-[12px] text-ink-3 mt-1">
          Upload images the user can present during the roleplay.
        </p>
      </button>
    );
  }
  return (
    <div className="bg-surface border border-border rounded-[12px] p-5 space-y-3">
      {aids.map((a, i) => (
        <div
          key={i}
          className="grid gap-2 md:grid-cols-[1fr_2fr_auto] items-center"
        >
          <input
            value={a.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="Image label (e.g. Pricing sheet)"
            className="bg-surface border border-border-strong rounded-md px-3 py-2 text-[12.5px] focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
          <input
            value={a.url}
            onChange={(e) => update(i, { url: e.target.value })}
            placeholder="https://… or data: URL"
            className="bg-surface border border-border-strong rounded-md px-3 py-2 text-[12.5px] font-mono focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label="Remove"
            className="w-9 h-9 grid place-items-center rounded-md border border-border bg-surface text-ink-3 hover:text-bad"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        suppressHydrationWarning
        className="text-[12.5px] font-semibold text-accent hover:text-accent-strong"
      >
        + Add Visual Aid
      </button>
    </div>
  );
}

// ─────────────── Keywords ───────────────

function KeywordsList({
  values,
  onChange,
}: {
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = draft.trim();
    if (!v) return;
    onChange([...values, v]);
    setDraft("");
  }
  return (
    <div className="mt-3 space-y-2">
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((k, i) => (
            <span
              key={`${k}-${i}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-pale/40 text-accent text-[11.5px] font-semibold"
            >
              {k}
              <button
                type="button"
                onClick={() => onChange(values.filter((_, idx) => idx !== i))}
                aria-label={`Remove ${k}`}
                className="text-ink-3 hover:text-bad"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Type a keyword and press Enter"
          className="flex-1 bg-surface border border-border-strong rounded-md px-3 py-2 text-[12.5px] focus:outline-none focus:border-accent"
          suppressHydrationWarning
        />
        <button
          type="button"
          onClick={add}
          suppressHydrationWarning
          className="text-[12.5px] font-semibold text-accent hover:text-accent-strong"
        >
          + Add Keyword
        </button>
      </div>
    </div>
  );
}

// ─────────────── Scoring toggle ───────────────

function ScoringToggle({
  value,
  onChange,
}: {
  value: "checklist" | "standard";
  onChange: (v: "checklist" | "standard") => void;
}) {
  return (
    <div className="inline-flex items-center bg-surface-2 border border-border rounded-md p-0.5">
      <button
        type="button"
        onClick={() => onChange("checklist")}
        suppressHydrationWarning
        className={cn(
          "px-3 py-1 rounded text-[12px] font-semibold transition-colors",
          value === "checklist"
            ? "bg-accent text-white"
            : "text-ink-2 hover:text-ink",
        )}
      >
        Use checklist
      </button>
      <button
        type="button"
        onClick={() => onChange("standard")}
        suppressHydrationWarning
        className={cn(
          "px-3 py-1 rounded text-[12px] font-semibold transition-colors",
          value === "standard"
            ? "bg-accent text-white"
            : "text-ink-2 hover:text-ink",
        )}
      >
        Standard
      </button>
    </div>
  );
}

// ─────────────── Criteria list ───────────────

function CriteriaList({
  scoringMode,
  criteria,
  onChange,
}: {
  scoringMode: "checklist" | "standard";
  criteria: EvalCriterion[];
  onChange: (c: EvalCriterion[]) => void;
}) {
  function addCriterion() {
    const id = `c_${Date.now().toString(36)}`;
    onChange([...criteria, { id, label: "New criterion", items: [] }]);
  }
  function update(i: number, patch: Partial<EvalCriterion>) {
    onChange(criteria.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function remove(i: number) {
    onChange(criteria.filter((_, idx) => idx !== i));
  }
  function addItem(ci: number) {
    const id = `i_${Date.now().toString(36)}`;
    update(ci, {
      items: [
        ...criteria[ci].items,
        { id, label: "New checklist item", visible: true },
      ],
    });
  }
  function updateItem(ci: number, ii: number, patch: Partial<ChecklistItem>) {
    update(ci, {
      items: criteria[ci].items.map((it, idx) =>
        idx === ii ? { ...it, ...patch } : it,
      ),
    });
  }
  function removeItem(ci: number, ii: number) {
    update(ci, {
      items: criteria[ci].items.filter((_, idx) => idx !== ii),
    });
  }
  return (
    <div className="mt-4 space-y-2">
      {criteria.map((c, ci) => (
        <div
          key={c.id}
          className="border border-border rounded-md p-3 bg-surface-2/50 space-y-2"
        >
          <div className="flex items-center gap-2">
            <input
              value={c.label}
              onChange={(e) => update(ci, { label: e.target.value })}
              className="flex-1 bg-surface border border-border rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold focus:outline-none focus:border-accent"
              suppressHydrationWarning
            />
            <button
              type="button"
              onClick={() => remove(ci)}
              aria-label="Remove criterion"
              className="w-7 h-7 grid place-items-center rounded-md text-ink-3 hover:text-bad"
            >
              ×
            </button>
          </div>
          {scoringMode === "checklist" ? (
            <div className="space-y-1.5 pl-2">
              {c.items.map((it, ii) => (
                <div key={it.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateItem(ci, ii, { visible: !it.visible })
                    }
                    aria-label={
                      it.visible ? "Hide from trainee" : "Show to trainee"
                    }
                    className="w-6 h-6 grid place-items-center rounded text-ink-3 hover:text-accent"
                    title={
                      it.visible ? "Visible to trainee" : "Hidden from trainee"
                    }
                  >
                    {it.visible ? "👁" : "⊘"}
                  </button>
                  <input
                    value={it.label}
                    onChange={(e) =>
                      updateItem(ci, ii, { label: e.target.value })
                    }
                    className="flex-1 bg-surface border border-border rounded-md px-2.5 py-1 text-[12.5px] focus:outline-none focus:border-accent"
                    suppressHydrationWarning
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(ci, ii)}
                    aria-label="Remove item"
                    className="w-6 h-6 grid place-items-center rounded text-ink-3 hover:text-bad"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addItem(ci)}
                className="text-[11.5px] font-semibold text-accent hover:text-accent-strong"
              >
                + Add checklist item
              </button>
            </div>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        onClick={addCriterion}
        suppressHydrationWarning
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-dashed border-accent text-accent text-[12.5px] font-semibold hover:bg-accent-pale/20"
      >
        + Add Evaluation
      </button>
    </div>
  );
}

// ─────────────── Additional Settings (Phase L stub) ───────────────

// Persisted additionalSettings starts as Prisma Json — narrow it back
// to the AdditionalSettings shape if it looks like one (presence of
// .modes is the discriminator). Otherwise fall back to defaults.
function isAdditionalSettings(v: unknown): v is AdditionalSettings {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.modes === "object" && obj.modes != null;
}
