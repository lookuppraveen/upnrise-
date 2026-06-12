// Button — base styles ported from prototype.css `.btn`.
// Variants and sizes match the prototype 1:1 (DESIGN_TOKENS.md §Core components).

import { cn } from "@/lib/cn";

type Variant = "default" | "secondary" | "ghost" | "accent";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  default:
    "bg-ink text-white border border-ink hover:bg-[#2a2a2a] hover:border-[#2a2a2a]",
  secondary:
    "bg-surface text-ink border border-border-strong hover:bg-surface-2",
  ghost:
    "bg-transparent text-ink-2 border border-transparent hover:bg-surface-2 hover:text-ink",
  accent:
    "bg-accent text-white border border-accent hover:bg-accent-strong hover:border-accent-strong",
};

const SIZES: Record<Size, string> = {
  sm: "px-[10px] py-[4px] text-[12px]",
  md: "px-[14px] py-[7px] text-[13px]",
  lg: "px-[18px] py-[10px] text-[14px]",
};

export function Button({
  variant = "default",
  size = "md",
  className,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      // Browser autofill / form-fill extensions inject `fdprocessedid`
      // client-side on every button, which trips a hydration warning
      // even though nothing's broken. Silence it at the source.
      suppressHydrationWarning
      className={cn(
        "inline-flex items-center gap-1.5 font-medium leading-none rounded-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
}
