// Shared inline-SVG icon set. One <Icon name=…/> across all three surfaces, as
// per BUILD_PLAN.md §Fidelity. New icons get added to the GLYPHS map below —
// ported from design_files/prototype-icons.jsx + admin-icons.jsx.
//
// Style rules (from DESIGN_TOKENS.md §Iconography):
//   stroke-width: 2, round caps/joins, 16–22px.
//   AI sparkle is a filled 4-point star, not stroked.

import { cn } from "@/lib/cn";

export type IconName =
  | "ai-sparkle"
  | "search"
  | "bell"
  | "chevron-right"
  | "chevron-down"
  | "home"
  | "training"
  | "book"
  | "mic"
  | "wand"
  | "users"
  | "trophy"
  | "gift"
  | "megaphone"
  | "rocket"
  | "clipboard"
  | "chart"
  | "message"
  | "activity"
  | "bot"
  | "settings"
  | "credit-card"
  | "globe"
  | "shield"
  | "lifebuoy"
  | "layers"
  | "calendar"
  | "history"
  | "alert"
  | "play"
  | "command"
  | "image"
  | "edit"
  | "trash";

const STROKE_GLYPHS: Record<
  Exclude<IconName, "ai-sparkle">,
  React.ReactNode
> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </>
  ),
  "chevron-right": <path d="m9 6 6 6-6 6" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  home: (
    <>
      <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
    </>
  ),
  training: (
    <>
      <rect x="3" y="5" width="18" height="13" rx="2" />
      <path d="m10 9 5 3-5 3z" />
    </>
  ),
  book: (
    <>
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v15H6.5A2.5 2.5 0 0 0 4 19.5z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  wand: (
    <>
      <path d="m15 4 1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
      <path d="M3 21 14 10" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.5-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M14 16c.5-1.6 1.7-2.5 3-2.5 2.2 0 4 1.6 4.5 4" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 5h10v4a5 5 0 0 1-10 0z" />
      <path d="M7 7H4v2a3 3 0 0 0 3 3M17 7h3v2a3 3 0 0 1-3 3" />
      <path d="M9 21h6M12 14v7" />
    </>
  ),
  gift: (
    <>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M4 12v9h16v-9M12 8v13" />
      <path d="M8 8a2.5 2.5 0 0 1 0-5c2 0 4 5 4 5s2-5 4-5a2.5 2.5 0 0 1 0 5" />
    </>
  ),
  megaphone: (
    <>
      <path d="M4 11v3a2 2 0 0 0 2 2h2v4l3-4h2l8-2V7l-8-2H6a2 2 0 0 0-2 2z" />
    </>
  ),
  rocket: (
    <>
      <path d="M4 20s-1-3 2-6l6-6 4 4-6 6c-3 3-6 2-6 2z" />
      <circle cx="14" cy="10" r="1.5" />
      <path d="m14 4 6 6M5 19l-2 2" />
    </>
  ),
  clipboard: (
    <>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4h6v3H9z" />
      <path d="M9 12h6M9 16h4" />
    </>
  ),
  chart: (
    <>
      <path d="M3 21h18M6 17v-5M11 17v-9M16 17v-3M21 17v-7" />
    </>
  ),
  message: (
    <>
      <path d="M4 5h16v11H8l-4 4z" />
    </>
  ),
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  bot: (
    <>
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <path d="M12 4v3M8 12h.01M16 12h.01" />
      <path d="M9 17h6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  "credit-card": (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
    </>
  ),
  shield: <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z" />,
  lifebuoy: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="m4.6 4.6 4.9 4.9M14.5 14.5l4.9 4.9M19.4 4.6l-4.9 4.9M9.5 14.5l-4.9 4.9" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5M3 18l9 5 9-5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2 21h20z" />
      <path d="M12 10v5M12 18v.01" />
    </>
  ),
  play: <path d="m8 5 11 7-11 7z" />,
  command: (
    <>
      <path d="M9 6a3 3 0 1 0 0 6h6a3 3 0 1 0 0-6 3 3 0 0 0-3 3v6a3 3 0 0 1-3 3 3 3 0 1 1 0-6h6a3 3 0 1 1 3 3 3 3 0 0 1-3-3" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m21 16-5-5-7 7" />
    </>
  ),
  edit: (
    <>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  className,
  ...rest
}: {
  name: IconName;
  size?: number;
  className?: string;
} & React.SVGAttributes<SVGSVGElement>) {
  if (name === "ai-sparkle") {
    return (
      <svg
        viewBox="0 0 14 14"
        width={size}
        height={size}
        aria-hidden
        className={cn("inline-block", className)}
        {...rest}
      >
        <path
          d="M7 0 L8.2 5.8 L14 7 L8.2 8.2 L7 14 L5.8 8.2 L0 7 L5.8 5.8 Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("inline-block", className)}
      {...rest}
    >
      {STROKE_GLYPHS[name]}
    </svg>
  );
}
