// AIBadge — small chip marking AI-powered features. Uses the AI gradient
// soft fill + sparkle glyph (DESIGN_TOKENS.md §AI gradients + §Iconography).

import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

export function AIBadge({
  children = "AI",
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-2 py-[2px]",
        "text-[10.5px] font-semibold uppercase tracking-[0.08em]",
        "bg-ai-grad-soft text-accent-strong",
        className,
      )}
    >
      <Icon name="ai-sparkle" size={10} className="text-accent" />
      {children}
    </span>
  );
}
