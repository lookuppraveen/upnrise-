// Topbar — ported from design_files/admin.css `.atop`.
// Sticky 60px bar with title + subtitle, command bar (Cmd+K), bell, AI button,
// avatar. The AI button is the trigger for the AIDrawer (hotkey handled there).

"use client";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export function Topbar({
  title,
  subtitle,
  email,
  copilotLabel,
  onToggleAI,
  signOutAction,
}: {
  title: string;
  subtitle?: string;
  email: string;
  copilotLabel: string;
  onToggleAI: () => void;
  signOutAction: () => void;
}) {
  const initial = email.charAt(0).toUpperCase();
  return (
    <header
      className={cn(
        "sticky top-0 z-10 flex items-center gap-4 px-6",
        "bg-surface border-b border-border",
      )}
      style={{ height: 60 }}
    >
      <div className="flex flex-col">
        <span className="font-display text-[22px] leading-none -tracking-[0.01em]">
          {title}
        </span>
        {subtitle ? (
          <span className="text-[11.5px] text-ink-3 mt-[3px]">{subtitle}</span>
        ) : null}
      </div>

      <button
        type="button"
        suppressHydrationWarning
        className={cn(
          "flex items-center gap-[10px] w-[380px] px-[14px] py-[7px]",
          "bg-surface-2 border border-border rounded-[9px] text-ink-3 text-[13px]",
          "hover:border-border-strong text-left",
        )}
        onClick={() => onToggleAI()}
      >
        <Icon name="search" size={14} />
        <span>Ask AI or search…</span>
        <span className="ml-auto font-mono text-[10.5px] bg-surface border border-border rounded-[4px] text-ink-2 px-[6px] py-[1px]">
          ⌘K
        </span>
      </button>

      <div className="flex items-center gap-1.5 ml-auto">
        <button
          type="button"
          suppressHydrationWarning
          className={cn(
            "relative w-[34px] h-[34px] rounded-[8px] border border-border bg-surface",
            "grid place-items-center text-ink-2 hover:bg-surface-2 hover:text-ink",
          )}
          aria-label="Notifications"
        >
          <Icon name="bell" size={16} />
          <span
            className="absolute top-[6px] right-[6px] w-[7px] h-[7px] rounded-full bg-accent"
            style={{ border: "1.5px solid var(--surface)" }}
          />
        </button>

        <button
          type="button"
          onClick={onToggleAI}
          suppressHydrationWarning
          className={cn(
            "h-[34px] inline-flex items-center gap-[7px] px-3 rounded-[8px]",
            "bg-ai-grad text-white text-[12.5px] font-semibold tracking-[0.01em]",
            "hover:brightness-[1.05]",
          )}
        >
          <Icon name="ai-sparkle" size={12} />
          {copilotLabel}
        </button>

        <form action={signOutAction} className="ml-2">
          <button
            type="submit"
            suppressHydrationWarning
            className={cn(
              "h-[34px] px-3 rounded-[8px] border border-border bg-surface",
              "text-[12.5px] text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            Sign out
          </button>
        </form>

        <div
          className="w-[34px] h-[34px] rounded-full grid place-items-center text-white text-[12px] font-semibold cursor-pointer"
          style={{
            background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
          }}
          title={email}
        >
          {initial}
        </div>
      </div>
    </header>
  );
}
