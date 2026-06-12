// Trainee sidebar nav — ported from 03_TRAINEE.md §Sidebar nav.

import type { ShellConfig } from "./nav-types";

export const LEARN_SHELL: ShellConfig = {
  surface: "learn",
  surfaceTag: "Module 3",
  brandSub: "Trainee app",
  sidebarWidth: 224,
  copilotWidth: 360,
  copilotLabel: "Coach",
  nav: [
    {
      label: "Overview",
      items: [
        { label: "Dashboard", href: "/learn/dashboard", icon: "home" },
      ],
    },
    {
      label: "Learn",
      items: [
        { label: "Trainings", href: "/learn/trainings", icon: "training" },
        {
          label: "Assignments",
          href: "/learn/assignments",
          icon: "clipboard",
        },
        { label: "Dictionary", href: "/learn/dictionary", icon: "book" },
      ],
    },
    {
      label: "You",
      items: [
        { label: "History", href: "/learn/history", icon: "history" },
        { label: "Feedbacks", href: "/learn/feedbacks", icon: "message" },
        { label: "Feeds", href: "/learn/feeds", icon: "megaphone" },
      ],
    },
  ],
  pageTitles: [
    {
      match: "/learn/dashboard",
      title: "Your learning",
      subtitle: "Today's queue, due-soon, and recent wins",
    },
    {
      match: "/learn/trainings",
      title: "Trainings",
      subtitle: "Catalog assigned to you",
    },
    {
      match: "/learn/assignments",
      title: "Assignments",
      subtitle: "What you owe and by when",
    },
    {
      match: "/learn/dictionary",
      title: "Dictionary",
      subtitle: "Glossary the Coach uses with you",
    },
    {
      match: "/learn/history",
      title: "History",
      subtitle: "Past attempts and scores",
    },
    {
      match: "/learn/feedbacks",
      title: "Feedbacks",
      subtitle: "Coach notes you've shared",
    },
    {
      match: "/learn/feeds",
      title: "Feeds",
      subtitle: "Announcements from your tenant",
    },
  ],
};
