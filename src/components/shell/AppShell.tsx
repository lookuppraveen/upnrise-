// AppShell — wires Sidebar + Topbar + AIDrawer into the page grid.
//
// Server-renders the sidebar (no client cost), but the topbar + drawer need
// client state for the AI toggle + Cmd-K. The grid widens to fit the drawer
// when open, exactly like the prototype's `.aapp.copilot-open`.
//
// Title resolution: derive from the current pathname (a) ShellConfig.pageTitles
// overrides first, then (b) sidebar nav item labels, longest match wins. Falls
// back to the layout-provided `pageTitle` / `pageSubtitle` if nothing matches.

"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { AIDrawer } from "./AIDrawer";
import type { PageTitleEntry, ShellConfig } from "./nav-types";

export function AppShell({
  config,
  email,
  pageTitle,
  pageSubtitle,
  children,
  signOutAction,
}: {
  config: ShellConfig;
  email: string;
  pageTitle: string;
  pageSubtitle?: string;
  children: React.ReactNode;
  signOutAction: () => void;
}) {
  const pathname = usePathname();
  const [aiOpen, setAiOpen] = useState(false);

  const resolved = useMemo(
    () => resolvePageTitle(pathname, config, pageTitle, pageSubtitle),
    [pathname, config, pageTitle, pageSubtitle],
  );

  const gridTemplate = aiOpen
    ? `${config.sidebarWidth}px 1fr ${config.copilotWidth}px`
    : `${config.sidebarWidth}px 1fr`;

  return (
    <div
      className="min-h-screen"
      style={{
        display: "grid",
        gridTemplateColumns: gridTemplate,
        minWidth: 1180,
      }}
    >
      <Sidebar config={config} pathname={pathname} />

      <div className="flex flex-col min-w-0">
        <Topbar
          title={resolved.title}
          subtitle={resolved.subtitle}
          email={email}
          copilotLabel={config.copilotLabel}
          onToggleAI={() => setAiOpen((v) => !v)}
          signOutAction={signOutAction}
        />
        <main className="flex-1 min-w-0">{children}</main>
      </div>

      <AIDrawer
        surface={config.surface}
        width={config.copilotWidth}
        open={aiOpen}
        onClose={() => setAiOpen(false)}
      />
    </div>
  );
}

function resolvePageTitle(
  pathname: string,
  config: ShellConfig,
  defaultTitle: string,
  defaultSubtitle: string | undefined,
): { title: string; subtitle?: string } {
  const navEntries: PageTitleEntry[] = config.nav.flatMap((g) =>
    g.items.map((i) => ({ match: i.href, title: i.label })),
  );
  // pageTitles outrank nav (richer subtitles); sort by descending length so
  // the most specific prefix wins (e.g. /super/companies before /super).
  const entries = [...(config.pageTitles ?? []), ...navEntries].sort(
    (a, b) => b.match.length - a.match.length,
  );
  for (const e of entries) {
    if (pathname === e.match || pathname.startsWith(e.match + "/")) {
      return { title: e.title, subtitle: e.subtitle };
    }
  }
  return { title: defaultTitle, subtitle: defaultSubtitle };
}
