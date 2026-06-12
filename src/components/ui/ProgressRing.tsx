// ProgressRing — SVG ring, accent stroke, % in center.
// Sizes 40/56/72 per DESIGN_TOKENS.md §Core components.

import { cn } from "@/lib/cn";

type Size = 40 | 56 | 72;

export function ProgressRing({
  value,
  size = 56,
  className,
}: {
  /** 0–100 */
  value: number;
  size?: Size;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const stroke = size === 40 ? 4 : size === 56 ? 5 : 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const fontSize = size === 40 ? 11 : size === 56 ? 13 : 16;

  return (
    <div
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--border)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--accent)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span
        className="absolute font-mono font-semibold text-ink"
        style={{ fontSize }}
      >
        {Math.round(clamped)}%
      </span>
    </div>
  );
}
