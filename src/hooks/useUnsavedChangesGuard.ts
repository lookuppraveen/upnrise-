// useUnsavedChangesGuard — wires up the browser's native
// `beforeunload` prompt when the caller has unsaved edits.
//
// Browser support: every modern browser. The exact message shown
// is browser-controlled (typically "Changes you made may not be
// saved.") — we can't customise it, only opt in.
//
// What this does NOT cover: Next.js client-side route changes via
// <Link>. The browser's prompt only fires on actual navigations
// away from the document (close tab, hard refresh, type a new URL).
// For in-app route changes we lean on the router not firing
// beforeunload — see https://github.com/vercel/next.js/discussions/9750.
// Practical answer: it catches the most common data-loss path
// (tab close, browser back, accidental refresh).

"use client";

import { useEffect } from "react";

export function useUnsavedChangesGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      // Older spec: set returnValue. Newer spec: preventDefault().
      // Setting both covers every browser we care about.
      e.preventDefault();
      e.returnValue = "";
      return "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

/**
 * Stable JSON-based equality check. Convenient for comparing the
 * editor's current state object to an initial snapshot when computing
 * `dirty` — handles arrays, plain objects, primitives. Skip if you
 * care about NaN/-0/Symbol — that's never the case here.
 */
export function deepEqualJson<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
