// Minimal toast system — no library dep.
//
// Components call the exported `toast` helpers (toast.success / .error /
// .info) from anywhere — client or server-action callback. The
// <ToastViewport /> in the root layout subscribes to the same event
// emitter and renders the stack with auto-dismiss.
//
// Why a singleton emitter and not React Context:
//   * Lets non-React code (server-action error catches, fetch failures
//     in helpers) post a toast without prop-drilling a hook.
//   * Avoids forcing every page using toast to be wrapped in a Provider.

"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Variant = "success" | "error" | "info";

type ToastEntry = {
  id: number;
  variant: Variant;
  title: string;
  description?: string;
};

type Listener = (entries: ToastEntry[]) => void;

let entries: ToastEntry[] = [];
let listeners: Listener[] = [];
let nextId = 1;

function emit() {
  for (const l of listeners) l(entries);
}

function push(variant: Variant, title: string, description?: string) {
  const id = nextId++;
  entries = [...entries, { id, variant, title, description }];
  emit();
  // Auto-dismiss after 4s. Errors stick a bit longer so the user can
  // actually read them.
  const timeout = variant === "error" ? 6000 : 4000;
  setTimeout(() => dismiss(id), timeout);
}

function dismiss(id: number) {
  entries = entries.filter((e) => e.id !== id);
  emit();
}

export const toast = {
  success(title: string, description?: string) {
    push("success", title, description);
  },
  error(title: string, description?: string) {
    push("error", title, description);
  },
  info(title: string, description?: string) {
    push("info", title, description);
  },
};

// ─────────────── Viewport ───────────────

export function ToastViewport() {
  const [items, setItems] = useState<ToastEntry[]>([]);

  useEffect(() => {
    const listener: Listener = (next) => setItems(next);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  return (
    <div
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {items.map((t) => (
        <ToastCard key={t.id} entry={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({
  entry,
  onDismiss,
}: {
  entry: ToastEntry;
  onDismiss: () => void;
}) {
  const palette = entry.variant === "success"
    ? { bg: "#ecfdf5", border: "#a7f3d0", text: "#065f46", icon: "✓" }
    : entry.variant === "error"
      ? { bg: "#fef2f2", border: "#fecaca", text: "#991b1b", icon: "!" }
      : { bg: "#f3f4f6", border: "#d1d5db", text: "#1f2937", icon: "ⓘ" };
  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-2.5 min-w-[280px] max-w-[400px]",
        "px-3.5 py-2.5 rounded-md border shadow-lg",
        "animate-[toast-in_180ms_ease-out]",
      )}
      style={{
        background: palette.bg,
        borderColor: palette.border,
      }}
    >
      <span
        className="inline-grid place-items-center w-5 h-5 rounded-full text-[12px] font-bold shrink-0 mt-0.5"
        style={{
          background: palette.border,
          color: palette.text,
        }}
        aria-hidden
      >
        {palette.icon}
      </span>
      <div className="flex-1 min-w-0">
        <div
          className="text-[13px] font-semibold leading-tight"
          style={{ color: palette.text }}
        >
          {entry.title}
        </div>
        {entry.description ? (
          <div
            className="text-[11.5px] mt-0.5 leading-snug"
            style={{ color: palette.text, opacity: 0.85 }}
          >
            {entry.description}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-[14px] leading-none shrink-0 hover:opacity-70"
        style={{ color: palette.text }}
      >
        ×
      </button>
    </div>
  );
}
