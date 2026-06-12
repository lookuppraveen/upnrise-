// Composer for admin /admin/feeds. Pick post kind, write body, post.

"use client";

import { useState, useTransition } from "react";
import { createFeedPost } from "@/app/admin/feeds/actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const KINDS: Array<{ key: "announcement" | "win"; label: string }> = [
  { key: "announcement", label: "Announcement" },
  { key: "win", label: "Win" },
];

export function FeedsComposer() {
  const [kind, setKind] = useState<"announcement" | "win">("announcement");
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function post() {
    if (!body.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        await createFeedPost({ kind, body });
        setBody("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <Card pad="lg" className="space-y-3">
      <div className="flex items-center gap-1.5">
        {KINDS.map((k) => {
          const active = k.key === kind;
          return (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              className={cn(
                "px-3 py-1.5 rounded-md text-[12.5px] border",
                active
                  ? "bg-ink text-white border-ink"
                  : "bg-surface border-border-strong text-ink hover:bg-surface-2",
              )}
            >
              {k.label}
            </button>
          );
        })}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder={
          kind === "announcement"
            ? "Share an update with your team…"
            : "Celebrate a win — name the rep and what they did…"
        }
        className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[13.5px] focus:outline-none focus:border-accent resize-none"
        suppressHydrationWarning
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-ink-3 font-mono">
          {body.length} / 2000
        </span>
        <div className="flex items-center gap-2">
          {error ? (
            <span className="text-[11.5px] text-bad font-mono">{error}</span>
          ) : null}
          <Button
            variant="accent"
            size="md"
            onClick={post}
            disabled={pending || !body.trim()}
          >
            {pending ? "Posting…" : "Post"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
