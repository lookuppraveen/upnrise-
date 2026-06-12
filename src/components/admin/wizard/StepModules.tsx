// Step 2 — Modules.
//
// Card-grid layout per the redesign. Each module is a card with a type
// glyph, Published toggle, AI quality pill, and Edit Module button that
// opens the per-module modal. A final dashed "+ Add New Module" tile
// opens the "What would you like to create today?" modal. The legacy
// inline-expanded row editor moved into ModuleEditModal; KB sources
// moved to Step 1.

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  deleteModule,
  goToStep,
  publishAllModules,
  reorderModules,
  saveDraftAndExit,
  updateModule,
} from "@/app/admin/trainings/actions";
import type { ModuleType } from "@prisma/client";
import { Icon, type IconName } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { WizardFooter } from "./StepBasic";
import { AddModuleModal } from "./AddModuleModal";
import { AddModuleMenu } from "./AddModuleMenu";
import { QuestionBankTab, type QbItem } from "./QuestionBankTab";
import { cn } from "@/lib/cn";

export type EditableModule = {
  id: string;
  name: string;
  type: ModuleType;
  published: boolean;
  aiScore: number | null;
  updatedAt: Date;
  body: Record<string, unknown> | null;
  roleplayConfig: { persona: string; scenario: string } | null;
};

type Tab = "modules" | "question-bank";

const MODULE_ICON: Record<ModuleType, IconName> = {
  video: "play",
  roleplay: "mic",
  quiz: "clipboard",
  document: "book",
  gamified: "trophy",
  evaluation: "wand",
};

const MODULE_ACCENT: Record<ModuleType, string> = {
  video: "#ff7c52",
  roleplay: "#7c5cd6",
  quiz: "#10b981",
  document: "#2563eb",
  gamified: "#d4a017",
  evaluation: "#06b6d4",
};

const MODULE_TYPE_LABEL: Record<ModuleType, string> = {
  video: "Video",
  roleplay: "Roleplay",
  quiz: "Assessment",
  document: "Document",
  gamified: "Activity",
  evaluation: "Evaluation",
};

// Document storage covers Document + Coach + SCORM (body.kind
// discriminates). Reach into body to pick the right icon/accent/label
// so the Step 2 grid doesn't just say "Document" for all three.
function moduleDisplay(
  type: ModuleType,
  body: Record<string, unknown> | null,
): { icon: IconName; accent: string; label: string } {
  if (type === "document" && body) {
    if (body.kind === "coach")
      return { icon: "trophy", accent: "#d4a017", label: "Coach" };
    if (body.kind === "scorm")
      return { icon: "layers", accent: "#14b8a6", label: "SCORM" };
  }
  return {
    icon: MODULE_ICON[type],
    accent: MODULE_ACCENT[type],
    label: MODULE_TYPE_LABEL[type],
  };
}

export function StepModules({
  trainingId,
  trainingTitle,
  modules,
  questionBankItems,
  hasDefaultVideoProvider,
}: {
  trainingId: string;
  trainingTitle: string;
  modules: EditableModule[];
  questionBankItems: QbItem[];
  hasDefaultVideoProvider: boolean;
}) {
  const [tab, setTab] = useState<Tab>("modules");
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  // Optimistic local copy so up/down arrows feel instant. We persist
  // through reorderModules in the background; the server-revalidated
  // `modules` prop is the source of truth on the next render.
  const [orderedModules, setOrderedModules] = useState<EditableModule[]>(modules);
  // Sync local order back to the server payload when the *set* of
  // module IDs changes (add or delete), but not on every prop change
  // — otherwise we'd lose the optimistic reorder mid-flight.
  const serverIdsKey = modules.map((m) => m.id).sort().join(",");
  useEffect(() => {
    setOrderedModules(modules);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverIdsKey]);

  const draftCount = modules.filter((m) => !m.published).length;

  function publishAll() {
    startTransition(() => void publishAllModules(trainingId));
  }

  function moveModule(index: number, direction: -1 | 1) {
    const j = index + direction;
    if (j < 0 || j >= orderedModules.length) return;
    const next = [...orderedModules];
    [next[index], next[j]] = [next[j], next[index]];
    setOrderedModules(next);
    startTransition(async () => {
      try {
        await reorderModules(
          trainingId,
          next.map((m) => m.id),
        );
      } catch (e) {
        // Roll back local state on failure so the UI matches the server.
        setOrderedModules(orderedModules);
        toast.error(
          "Reorder failed",
          e instanceof Error ? e.message : "Could not save new order",
        );
      }
    });
  }

  function next() {
    if (draftCount > 0) {
      const ok = window.confirm(
        `${draftCount} module${draftCount === 1 ? " is" : "s are"} still a draft.\n\n` +
          `Mark them all as Published so this training can go live?\n\n` +
          `OK = publish all + continue\n` +
          `Cancel = continue without publishing`,
      );
      if (ok) {
        startTransition(async () => {
          await publishAllModules(trainingId);
          await goToStep(trainingId, 3);
        });
        return;
      }
    }
    startTransition(() => void goToStep(trainingId, 3));
  }

  return (
    <div className="space-y-6">
      {/* AI suggestion banner */}
      <AiSuggestionBanner
        trainingTitle={trainingTitle}
        moduleCount={modules.length}
        onBulkGenerate={() => setAdding(true)}
      />

      {/* Sub-tabs + toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex items-center bg-surface-2 border border-border rounded-md p-0.5">
          <TabPill active={tab === "modules"} onClick={() => setTab("modules")}>
            <Icon name="layers" size={11} />
            Modules
          </TabPill>
          <TabPill
            active={tab === "question-bank"}
            onClick={() => setTab("question-bank")}
          >
            <Icon name="clipboard" size={11} />
            Question Bank
          </TabPill>
        </div>
        <div className="flex items-center gap-2">
          {draftCount > 0 ? (
            <button
              type="button"
              onClick={publishAll}
              disabled={pending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-white text-[12px] font-semibold hover:bg-accent-strong disabled:opacity-60"
            >
              <Icon name="ai-sparkle" size={11} />
              Publish all {draftCount}
            </button>
          ) : null}
          <span className="text-[11.5px] text-ink-3 hidden sm:inline">
            Use ↑ ↓ on each card to reorder
          </span>
          <AddModuleMenu trainingId={trainingId} variant="button" />
        </div>
      </div>

      {tab === "modules" ? (
        <>
          {/* Modules header */}
          <div>
            <h2 className="font-display text-[22px] leading-tight">
              Modules <span className="text-ink-3 font-normal">({modules.length})</span>
            </h2>
            <p className="text-[12px] text-ink-3">
              Click on Edit Module to view and modify the module&apos;s
              content.
            </p>
          </div>

          {/* Card grid */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {orderedModules.map((m, i) => (
              <ModuleCard
                key={m.id}
                trainingId={trainingId}
                order={i + 1}
                module={m}
                canMoveUp={i > 0}
                canMoveDown={i < orderedModules.length - 1}
                onMoveUp={() => moveModule(i, -1)}
                onMoveDown={() => moveModule(i, 1)}
                reorderPending={pending}
              />
            ))}
            <AddModuleMenu trainingId={trainingId} variant="tile" />
          </div>
        </>
      ) : (
        <QuestionBankTab
          trainingId={trainingId}
          items={questionBankItems}
          onOpenBulkGenerate={() => setAdding(true)}
        />
      )}

      {adding ? (
        <AddModuleModal
          trainingId={trainingId}
          onClose={() => setAdding(false)}
        />
      ) : null}

      <WizardFooter
        onBack={() => startTransition(() => void goToStep(trainingId, 1))}
        onSaveDraft={() =>
          startTransition(() => void saveDraftAndExit(trainingId))
        }
        onSaveNext={next}
        pending={pending}
      />
    </div>
  );
}

// ─────────────── AI suggestion banner ───────────────

function AiSuggestionBanner({
  trainingTitle,
  moduleCount,
  onBulkGenerate,
}: {
  trainingTitle: string;
  moduleCount: number;
  onBulkGenerate: () => void;
}) {
  const [showStructure, setShowStructure] = useState(false);
  const headline =
    moduleCount === 0
      ? `AI suggests 4 modules for "${trainingTitle}":`
      : `Add more AI-drafted modules to "${trainingTitle}":`;
  return (
    <div
      className="border rounded-[12px] p-3"
      style={{
        background:
          "linear-gradient(120deg, rgba(124,92,214,0.10) 0%, rgba(255,124,82,0.08) 100%)",
        borderColor: "rgba(124,92,214,0.30)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 grid place-items-center rounded-md text-white shrink-0"
          style={{ background: "var(--ai-grad, #7c5cd6)" }}
          aria-hidden
        >
          <Icon name="ai-sparkle" size={13} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-ink leading-[1.45]">
            <strong className="font-semibold">{headline}</strong> 1 video
            intro, 2 roleplays (voice + video), 1 evaluation.{" "}
            <button
              type="button"
              onClick={() => setShowStructure((s) => !s)}
              className="text-[#6d4ad9] font-semibold hover:underline"
            >
              {showStructure ? "Hide" : "See structure →"}
            </button>
          </div>
          {showStructure ? (
            <ul className="mt-1.5 text-[12px] text-ink-2 space-y-0.5 list-disc pl-5">
              <li>Welcome video & framing (3 min)</li>
              <li>Two-way voice roleplay — discovery</li>
              <li>Two-way video roleplay — close</li>
              <li>5-question evaluation</li>
            </ul>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onBulkGenerate}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-accent text-white text-[12px] font-semibold hover:bg-accent-strong shrink-0"
        >
          <Icon name="ai-sparkle" size={11} />
          Bulk Generate
        </button>
      </div>
    </div>
  );
}

// ─────────────── Module card ───────────────

function ModuleCard({
  trainingId,
  order,
  module: m,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  reorderPending,
}: {
  trainingId: string;
  order: number;
  module: EditableModule;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  reorderPending: boolean;
}) {
  const editHref = `/admin/trainings/${trainingId}/modules/${m.id}/edit`;
  const [published, setPublished] = useState(m.published);
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the kebab menu on outside click / Escape so it behaves like a
  // proper popover. The confirmation dialog has its own handlers.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function togglePublished(next: boolean) {
    setPublished(next);
    startTransition(async () => {
      await updateModule(trainingId, m.id, { name: m.name, published: next });
    });
  }

  function onDelete() {
    setDeleteError(null);
    startDeleteTransition(async () => {
      try {
        await deleteModule(trainingId, m.id);
        // revalidatePath inside the action drops the card from the next
        // render — no local list mutation needed.
      } catch (e) {
        setDeleteError(e instanceof Error ? e.message : "Delete failed");
      }
    });
  }

  const display = moduleDisplay(m.type, m.body);

  return (
    <div className="bg-surface border border-border rounded-[12px] p-4 flex flex-col gap-3 min-h-[180px]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <div
            className="w-10 h-10 grid place-items-center rounded-md text-white shrink-0"
            style={{ background: display.accent }}
            aria-hidden
          >
            <Icon name={display.icon} size={16} />
          </div>
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={!canMoveUp || reorderPending}
              aria-label={`Move "${m.name}" up`}
              suppressHydrationWarning
              className="w-5 h-4 grid place-items-center rounded text-[10px] text-ink-3 hover:text-ink hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={!canMoveDown || reorderPending}
              aria-label={`Move "${m.name}" down`}
              suppressHydrationWarning
              className="w-5 h-4 grid place-items-center rounded text-[10px] text-ink-3 hover:text-ink hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ▼
            </button>
          </div>
        </div>
        <PublishedToggle
          checked={published}
          onChange={togglePublished}
          disabled={pending}
        />
      </div>
      <div className="space-y-1">
        <div className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3 bg-surface-2 px-1.5 py-0.5 rounded">
          {display.label}
        </div>
        <h3 className="text-[14.5px] font-semibold leading-snug text-ink">
          {order}. {m.name}
        </h3>
        {m.aiScore != null ? (
          <div
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: "rgba(124,92,214,0.12)",
              color: "#6d4ad9",
            }}
          >
            <Icon name="ai-sparkle" size={9} />
            AI quality {m.aiScore}%
          </div>
        ) : null}
      </div>
      <div className="text-[11px] text-ink-3 mt-auto">
        <div>
          Last Updated ·{" "}
          {new Date(m.updatedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </div>
        <div>Last Updated By · You</div>
      </div>
      <div className="border-t border-dashed border-border pt-3 flex items-center gap-2">
        <Link
          href={editHref}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-strong"
        >
          <Icon name="wand" size={11} />
          Edit Module
        </Link>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            suppressHydrationWarning
            className="w-9 h-9 grid place-items-center rounded-md border border-border bg-surface text-ink-2 hover:text-ink"
          >
            ⋮
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 bottom-full mb-1 z-20 min-w-[160px] bg-surface border border-border rounded-md shadow-lg py-1"
            >
              <Link
                href={editHref}
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="block px-3 py-1.5 text-[12.5px] text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                Edit
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setDeleteError(null);
                  setConfirmOpen(true);
                }}
                suppressHydrationWarning
                className="w-full text-left px-3 py-1.5 text-[12.5px] text-bad hover:bg-bad-pale/50"
              >
                Delete module
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => {
            if (!deletePending) setConfirmOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete module"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-bg border border-border rounded-[12px] w-full max-w-[420px] shadow-xl"
          >
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-[15px] font-semibold text-ink">
                Delete module?
              </h3>
            </div>
            <div className="px-5 py-4 space-y-2">
              <p className="text-[12.5px] text-ink-2 leading-snug">
                <span className="font-semibold text-ink">
                  &ldquo;{m.name}&rdquo;
                </span>{" "}
                will be permanently removed. Any sessions, completions, and
                feedback tied to this module will be deleted too.
              </p>
              <p className="text-[11.5px] text-ink-3">
                This action can&apos;t be undone.
              </p>
              {deleteError ? (
                <p className="text-[11.5px] text-bad font-mono break-words">
                  {deleteError}
                </p>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={deletePending}
                suppressHydrationWarning
                className="px-4 py-2 rounded-md border border-border bg-surface text-[12.5px] font-semibold text-ink-2 hover:text-ink hover:bg-surface-2 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={deletePending}
                suppressHydrationWarning
                className="px-4 py-2 rounded-md bg-bad text-white text-[12.5px] font-semibold hover:opacity-90 disabled:opacity-60"
              >
                {deletePending ? "Deleting…" : "Delete module"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PublishedToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em]",
        "rounded-full pl-1 pr-2 py-0.5 transition-colors",
        checked
          ? "bg-accent text-white"
          : "bg-surface-2 border border-border text-ink-3",
        "disabled:opacity-60",
      )}
    >
      <span
        className={cn(
          "w-3.5 h-3.5 rounded-full bg-white shadow",
          checked ? "" : "opacity-70",
        )}
      />
      {checked ? "Published" : "Draft"}
    </button>
  );
}

function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded text-[12.5px] font-semibold transition-colors",
        active
          ? "bg-accent text-white"
          : "text-ink-2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

