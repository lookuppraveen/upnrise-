// Super Admin sidebar nav — ported from 02_SUPER_ADMIN.md §Sidebar nav.

import type { ShellConfig } from "./nav-types";

export const SUPER_SHELL: ShellConfig = {
  surface: "super",
  surfaceTag: "Module 2",
  brandSub: "Super Admin",
  sidebarWidth: 252,
  copilotWidth: 440,
  copilotLabel: "Ask AI",
  nav: [
    {
      label: "Operations",
      items: [
        { label: "Platform Overview", href: "/super/overview", icon: "home" },
        {
          label: "Companies",
          href: "/super/companies",
          icon: "layers",
        },
        { label: "Users", href: "/super/users", icon: "users" },
      ],
    },
    {
      label: "Commercial",
      items: [
        { label: "Plans", href: "/super/plans", icon: "credit-card" },
        {
          label: "Credits & Billing",
          href: "/super/credits",
          icon: "credit-card",
        },
      ],
    },
    {
      label: "Platform",
      items: [
        {
          label: "AI Configuration",
          href: "/super/ai-config",
          icon: "bot",
          ai: true,
        },
        { label: "Content Library", href: "/super/content", icon: "book" },
        { label: "Analytics", href: "/super/analytics", icon: "chart" },
        {
          label: "Support & Audit",
          href: "/super/support",
          icon: "lifebuoy",
        },
        {
          label: "Master Settings",
          href: "/super/settings",
          icon: "settings",
        },
      ],
    },
  ],
  pageTitles: [
    {
      match: "/super/overview",
      title: "Platform Overview",
      subtitle: "Cross-tenant health & activity",
    },
    {
      match: "/super/companies",
      title: "Companies",
      subtitle: "All tenants on the platform",
    },
    {
      match: "/super/users",
      title: "Users",
      subtitle: "All accounts across tenants",
    },
    {
      match: "/super/plans",
      title: "Plans",
      subtitle: "Pricing tiers & catalog",
    },
    {
      match: "/super/credits",
      title: "Credits & Billing",
      subtitle: "Subscription & AI spend per tenant",
    },
    {
      match: "/super/ai-config",
      title: "AI Configuration",
      subtitle: "Models, defaults, and spend caps",
    },
    {
      match: "/super/analytics",
      title: "Analytics",
      subtitle: "Platform-wide engagement & spend",
    },
    {
      match: "/super/support",
      title: "Support & Audit",
      subtitle: "Cross-tenant audit log",
    },
    {
      match: "/super/settings",
      title: "Master Settings",
      subtitle: "Platform configuration",
    },
  ],
};
