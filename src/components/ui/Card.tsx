// Card — prototype.css `.card` (white, 1px border, radius `--r-md`, padding 18px).
// `.card-pad-lg` = 24, `.card-pad-sm` = 12. No box-shadow by default — both
// prototype.css `.card` and admin.css `.acard` ship flat. `elevated` adds
// `--shadow-sm` to match admin.css `.acard.elevated`.

import { cn } from "@/lib/cn";

type Pad = "sm" | "md" | "lg";

const PAD: Record<Pad, string> = {
  sm: "p-3",
  md: "p-[18px]",
  lg: "p-6",
};

export function Card({
  pad = "md",
  elevated = false,
  className,
  ...rest
}: {
  pad?: Pad;
  elevated?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-surface border border-border rounded-md",
        elevated && "shadow-sm",
        PAD[pad],
        className,
      )}
      {...rest}
    />
  );
}
