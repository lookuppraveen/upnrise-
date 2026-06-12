// Shared type for sidebar nav config. Each surface (super/admin/learn) defines
// its own NavConfig and passes it to AppShell.

import type { IconName } from "@/components/ui/Icon";

export type NavItem = {
  label: string;
  href: string;
  icon: IconName;
  /** Numeric badge (e.g. pending count). 0 / undefined → hidden. */
  badge?: number;
  /** "AI" badge — uses the ai-gradient chip. */
  ai?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export type SurfaceTheme = "admin" | "super" | "learn";

/**
 * Per-route topbar override. `match` is a path prefix (exact match OR
 * `pathname.startsWith(match + "/")` — so "/super/companies" matches the
 * detail route "/super/companies/abc"). Longest match wins, and entries
 * here outrank the nav-derived titles.
 */
export type PageTitleEntry = {
  match: string;
  title: string;
  subtitle?: string;
};

export type ShellConfig = {
  surface: SurfaceTheme;
  /** Module tag shown in topbar (e.g. "Module 1"). */
  surfaceTag: string;
  /** Brand line under the logo (e.g. "Admin Console"). */
  brandSub: string;
  /** Width tokens. Admin = 252, Trainee = 224. */
  sidebarWidth: number;
  /** Width of the AI drawer when open. Admin = 360, Super = 440. */
  copilotWidth: number;
  /** Topbar AI button label. */
  copilotLabel: string;
  /** Nav groups in order. */
  nav: NavGroup[];
  /** Optional overrides for sub-routes (detail pages, wizards, etc.). */
  pageTitles?: PageTitleEntry[];
};
