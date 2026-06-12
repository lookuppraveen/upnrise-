// Step 2 — "+ Add New Module" dropdown.
//
// Click trigger → small floating menu with 8 module-type options. Each
// live option calls addModule() then routes to the per-module edit page.
// Coach and Scorm are placeholders until their backend types ship.
//
// Two trigger variants share the same menu logic:
//   - "button"  → toolbar "+ Add New Module" pill (top-right of Step 2)
//   - "tile"    → dashed tile at the end of the module grid
// Both anchor the menu directly below the trigger.

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ModuleType } from "@prisma/client";
import { addModule, createScormModule } from "@/app/admin/trainings/actions";
import { createNarrationModule } from "@/app/admin/trainings/narration-actions";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type MenuItem =
  | {
      key: ModuleType;
      label: string;
      icon: IconName;
      color: string;
      live: true;
    }
  | {
      // "coach" lives at the UI level (own intermediate page +
      // dedicated Create flow) but is persisted as `document` type
      // with body.kind=coach until ModuleType gains a real value.
      key: "coach";
      label: string;
      icon: IconName;
      color: string;
      live: true;
      kind: "coach";
    }
  | {
      // "scorm" lives at the UI level (own dedicated editor) but is
      // persisted as `document` type with body.kind=scorm until
      // ModuleType gains a real value. Same convention as Coach.
      key: "scorm";
      label: string;
      icon: IconName;
      color: string;
      live: true;
      kind: "scorm";
    }
  | {
      // "narration" — voice-only audio module powered by ElevenLabs.
      // Persisted as `document` with body.kind=narration. Same
      // piggyback convention as Coach/Scorm.
      key: "narration";
      label: string;
      icon: IconName;
      color: string;
      live: true;
      kind: "narration";
    };

// Order matches the screenshot top-to-bottom.
const ITEMS: MenuItem[] = [
  { key: "roleplay", label: "Roleplay", icon: "message", color: "#7c5cd6", live: true },
  { key: "coach", label: "Coach", icon: "trophy", color: "#d4a017", live: true, kind: "coach" },
  { key: "video", label: "Video", icon: "play", color: "#ec4899", live: true },
  { key: "document", label: "Document", icon: "book", color: "#ef4444", live: true },
  { key: "quiz", label: "Assessment", icon: "clipboard", color: "#2563eb", live: true },
  { key: "gamified", label: "Activities", icon: "chart", color: "#10b981", live: true },
  { key: "evaluation", label: "Evaluation Module", icon: "wand", color: "#06b6d4", live: true },
  { key: "scorm", label: "Scorm", icon: "layers", color: "#14b8a6", live: true, kind: "scorm" },
  { key: "narration", label: "Narration", icon: "mic", color: "#8b5cf6", live: true, kind: "narration" },
];

export function AddModuleMenu({
  trainingId,
  variant,
}: {
  trainingId: string;
  variant: "button" | "tile";
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on outside click / Escape so the menu doesn't trap focus.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(item: MenuItem) {
    if (!item.live) {
      window.alert(`${item.label} is coming soon.`);
      return;
    }
    // Roleplay and Coach each have their own intermediate "Create
    // New …" screen so admins can frame the module before it's
    // persisted. Other live types still create+route straight to
    // the per-module edit page.
    if (item.key === "roleplay") {
      setOpen(false);
      router.push(`/admin/trainings/${trainingId}/modules/new/roleplay`);
      return;
    }
    if (item.key === "coach") {
      setOpen(false);
      router.push(`/admin/trainings/${trainingId}/modules/new/coach`);
      return;
    }
    // Assessment (stored as ModuleType.quiz) has its own intermediate
    // page so admins can pick question count + scope before persisting.
    if (item.key === "quiz") {
      setOpen(false);
      router.push(`/admin/trainings/${trainingId}/modules/new/assessment`);
      return;
    }
    // Activities (ModuleType.gamified) — duration preset + learning
    // goals brief, then create or AI-generate.
    if (item.key === "gamified") {
      setOpen(false);
      router.push(`/admin/trainings/${trainingId}/modules/new/activity`);
      return;
    }
    // Scorm — direct-create through createScormModule (persists as
    // document type with body.kind=scorm), then route to the
    // dedicated ScormModuleEditor.
    if (item.key === "scorm") {
      setCreating("scorm");
      startTransition(async () => {
        try {
          const { id } = await createScormModule(trainingId);
          setOpen(false);
          router.push(`/admin/trainings/${trainingId}/modules/${id}/edit`);
        } catch (e) {
          window.alert(
            e instanceof Error ? e.message : "Failed to create SCORM module",
          );
        } finally {
          setCreating(null);
        }
      });
      return;
    }
    // Narration — same direct-create pattern as Scorm. Routes to the
    // NarrationModuleEditor where the admin pastes the script and
    // hits Generate audio.
    if (item.key === "narration") {
      setCreating("narration");
      startTransition(async () => {
        try {
          const { id } = await createNarrationModule(trainingId);
          setOpen(false);
          router.push(`/admin/trainings/${trainingId}/modules/${id}/edit`);
        } catch (e) {
          window.alert(
            e instanceof Error ? e.message : "Failed to create narration",
          );
        } finally {
          setCreating(null);
        }
      });
      return;
    }
    setCreating(item.key);
    startTransition(async () => {
      try {
        const { id } = await addModule(trainingId, item.key);
        setOpen(false);
        router.push(`/admin/trainings/${trainingId}/modules/${id}/edit`);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Failed to create module");
      } finally {
        setCreating(null);
      }
    });
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      {variant === "button" ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={pending}
          aria-haspopup="menu"
          aria-expanded={open}
          suppressHydrationWarning
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border-strong bg-surface text-[12.5px] font-semibold hover:bg-surface-2 disabled:opacity-60"
        >
          + Add New Module
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={pending}
          aria-haspopup="menu"
          aria-expanded={open}
          suppressHydrationWarning
          className="w-full min-h-[180px] border-2 border-dashed border-border rounded-[12px] grid place-items-center bg-surface-2 hover:border-accent-pale hover:bg-accent-pale/20 transition-colors disabled:opacity-60"
        >
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 grid place-items-center rounded-md border border-border bg-surface text-ink-2">
              +
            </div>
            <div className="text-[13px] font-semibold text-ink">
              Add New Module
            </div>
            <div className="text-[11.5px] text-ink-3">
              Click to expand your training
            </div>
          </div>
        </button>
      )}

      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute z-30 mt-2 w-[220px] bg-surface border border-border rounded-[10px] shadow-lg py-1.5",
            variant === "button" ? "right-0" : "left-1/2 -translate-x-1/2",
          )}
        >
          {ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => pick(item)}
              disabled={pending}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-ink hover:bg-surface-2 transition-colors disabled:opacity-60",
                !item.live && "opacity-70",
              )}
            >
              <span
                aria-hidden
                style={{ color: item.color }}
                className="shrink-0 grid place-items-center"
              >
                <Icon name={item.icon} size={16} />
              </span>
              <span className="flex-1 truncate">{item.label}</span>
              {creating === item.key ? (
                <span className="text-[10.5px] font-mono text-ink-3">…</span>
              ) : !item.live ? (
                <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
                  Soon
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
