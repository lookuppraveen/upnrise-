// AIDrawer — right-side panel toggled by the AI button or Cmd/Ctrl+K.
//
//   • Trainee (/learn/*)  — LearnerCoach: Claude streaming chat.
//   • Admin (/admin/*)    — AdminCopilot: Claude + tool-use (read + assign).
//   • Super (/super/*)    — PlatformCopilot: cross-tenant Claude + tool-use.
//
// The drawer chassis (header, close button, hotkey) is shared.

"use client";

import { useEffect } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import type { SurfaceTheme } from "./nav-types";
import { LearnerCoach } from "./LearnerCoach";
import { AdminCopilot } from "./AdminCopilot";
import { PlatformCopilot } from "./PlatformCopilot";

const HEADER: Record<SurfaceTheme, { title: string; tagline: string }> = {
  admin: {
    title: "Admin Copilot",
    tagline: "Context-aware for the current page + tenant.",
  },
  super: {
    title: "Platform AI Copilot",
    tagline: "Watching all tenants. Aggregated, never leaks across.",
  },
  learn: {
    title: "AI Coach",
    tagline: "Personalized to your sessions. Always learning.",
  },
};

export function AIDrawer({
  surface,
  width,
  open,
  onClose,
}: {
  surface: SurfaceTheme;
  width: number;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const h = HEADER[surface];

  return (
    <aside
      aria-hidden={!open}
      className={cn(
        "border-l border-border bg-surface flex flex-col",
        "sticky top-0 h-screen",
        open ? "" : "hidden",
      )}
      style={{ width }}
    >
      <div className="px-5 py-4 border-b border-border flex items-center gap-2 shrink-0">
        <Icon name="ai-sparkle" size={14} className="text-accent" />
        <div className="flex flex-col leading-tight">
          <span className="text-[13.5px] font-semibold">{h.title}</span>
          <span className="text-[11.5px] text-ink-3">{h.tagline}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-ink-3 hover:text-ink text-[11px] font-mono"
          aria-label="Close"
        >
          ⌘K
        </button>
      </div>

      {surface === "learn" ? (
        <LearnerCoach />
      ) : surface === "admin" ? (
        <AdminCopilot />
      ) : (
        <PlatformCopilot />
      )}
    </aside>
  );
}
