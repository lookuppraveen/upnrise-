// Admin Console sidebar nav — ported from 01_ADMIN.md §Sidebar nav.
// Badges are NOT hardcoded — they'll be injected dynamically from the layout
// when we have a count-injection path. Phase 3.3+ wires real counts.

import type { ShellConfig } from "./nav-types";

export const ADMIN_SHELL: ShellConfig = {
  surface: "admin",
  surfaceTag: "Module 1",
  brandSub: "Admin Console",
  sidebarWidth: 252,
  copilotWidth: 360,
  copilotLabel: "Copilot",
  nav: [
    {
      label: "Overview",
      items: [
        { label: "Training Dashboard", href: "/admin/dashboard", icon: "home" },
      ],
    },
    {
      label: "Content",
      items: [
        { label: "Trainings", href: "/admin/trainings", icon: "training" },
        { label: "Dictionary", href: "/admin/dictionary", icon: "book" },
        {
          label: "Knowledge Base",
          href: "/admin/knowledge",
          icon: "layers",
        },
        {
          label: "AI Pronunciations",
          href: "/admin/pronunciations",
          icon: "mic",
          ai: true,
        },
        {
          label: "Generate with AI",
          href: "/admin/generate",
          icon: "wand",
          ai: true,
        },
      ],
    },
    {
      label: "People",
      items: [
        { label: "Employees", href: "/admin/employees", icon: "users" },
        { label: "Leaderboard", href: "/admin/leaderboard", icon: "trophy" },
        { label: "Reward Points", href: "/admin/rewards", icon: "gift" },
      ],
    },
    {
      label: "Engagement",
      items: [
        { label: "Feeds", href: "/admin/feeds", icon: "megaphone" },
        { label: "Campaigns", href: "/admin/campaigns", icon: "rocket" },
        {
          label: "Assignments",
          href: "/admin/assignments",
          icon: "clipboard",
        },
      ],
    },
    {
      label: "Insights & AI",
      items: [
        { label: "Reports", href: "/admin/reports", icon: "chart" },
        {
          label: "Feedbacks",
          href: "/admin/feedbacks",
          icon: "message",
        },
        { label: "Activities", href: "/admin/activities", icon: "activity" },
        {
          label: "Global Bot",
          href: "/admin/global-bot",
          icon: "bot",
          ai: true,
        },
        {
          label: "Video Providers",
          href: "/admin/video-providers",
          icon: "play",
          ai: true,
        },
      ],
    },
  ],
  pageTitles: [
    {
      match: "/admin/dashboard",
      title: "Training Dashboard",
      subtitle: "Adoption, gaps, and what to fix this week",
    },
    {
      match: "/admin/trainings",
      title: "Trainings",
      subtitle: "Your tenant's training catalog",
    },
    {
      match: "/admin/dictionary",
      title: "Dictionary",
      subtitle: "Tenant glossary used by the Coach",
    },
    {
      match: "/admin/pronunciations",
      title: "AI Pronunciations",
      subtitle: "Custom term phonetics for voice mode",
    },
    {
      match: "/admin/generate",
      title: "Generate with AI",
      subtitle: "Draft trainings & dictionary entries from a brief",
    },
    {
      match: "/admin/employees",
      title: "Employees",
      subtitle: "Trainee accounts in your tenant",
    },
    {
      match: "/admin/leaderboard",
      title: "Leaderboard",
      subtitle: "Top performers by points",
    },
    {
      match: "/admin/rewards",
      title: "Reward Points",
      subtitle: "Point rules & redemption catalog",
    },
    {
      match: "/admin/feeds",
      title: "Feeds",
      subtitle: "Announcements & wins for trainees",
    },
    {
      match: "/admin/campaigns",
      title: "Campaigns",
      subtitle: "Targeted training pushes",
    },
    {
      match: "/admin/assignments",
      title: "Assignments",
      subtitle: "Who's been assigned what, and when",
    },
    {
      match: "/admin/reports",
      title: "Reports",
      subtitle: "Engagement, scores, and outcomes",
    },
    {
      match: "/admin/feedbacks",
      title: "Feedbacks",
      subtitle: "Trainee feedback by training & module",
    },
    {
      match: "/admin/activities",
      title: "Activities",
      subtitle: "Audit log for your tenant",
    },
    {
      match: "/admin/global-bot",
      title: "Global Bot",
      subtitle: "Tenant Coach persona & guardrails",
    },
    {
      match: "/admin/knowledge",
      title: "Knowledge Base",
      subtitle: "Source material that grounds AI-drafted content",
    },
    {
      match: "/admin/video-providers",
      title: "Video Providers",
      subtitle: "Avatar render integrations (HeyGen, Synthesia, D-ID)",
    },
  ],
};
