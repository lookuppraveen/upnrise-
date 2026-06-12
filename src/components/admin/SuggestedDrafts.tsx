// Copilot-drafted feed posts. Click "Suggest drafts" → fast model composes
// up to 3 posts grounded in real tenant activity (high scores, streaks,
// completions, at-risk learners). Admin can publish or dismiss each.

"use client";

import { useState, useTransition } from "react";
import {
  generateDrafts,
  publishDraftedPost,
} from "@/app/admin/feeds/actions";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type Draft = {
  kind: "announcement" | "win" | "ai_nudge";
  body: string;
  reason: string;
};

type Status = "idle" | "loading" | "ready" | "empty" | "error";

export function SuggestedDrafts() {
  const [status, setStatus] = useState<Status>("idle");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [publishing, startPublish] = useTransition();
  const [publishedIdx, setPublishedIdx] = useState<Set<number>>(new Set());
  const [dismissedIdx, setDismissedIdx] = useState<Set<number>>(new Set());

  async function refresh() {
    setStatus("loading");
    setErrorMsg(null);
    setPublishedIdx(new Set());
    setDismissedIdx(new Set());
    try {
      const out = await generateDrafts();
      setDrafts(out);
      setStatus(out.length === 0 ? "empty" : "ready");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  function publish(i: number) {
    const d = drafts[i];
    if (!d) return;
    startPublish(async () => {
      try {
        await publishDraftedPost({ kind: d.kind, body: d.body });
        setPublishedIdx((s) => new Set(s).add(i));
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Publish failed");
      }
    });
  }

  function dismiss(i: number) {
    setDismissedIdx((s) => new Set(s).add(i));
  }

  const visibleCount = drafts.filter(
    (_, i) => !dismissedIdx.has(i) && !publishedIdx.has(i),
  ).length;

  return (
    <div
      className="rounded-[12px] border p-5 space-y-4"
      style={{
        background: "linear-gradient(135deg, #f3eafa, #fce8f0)",
        borderColor: "#e6d2f1",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-[32px] h-[32px] rounded-[8px] grid place-items-center text-white shrink-0"
          style={{
            background: "linear-gradient(135deg, #a855f7, #ec4899)",
          }}
        >
          <Icon name="ai-sparkle" size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#6d4ad9]">
            UPnRise AI · Suggested drafts
          </div>
          <p className="text-[13px] text-ink leading-[1.5] mt-1">
            {status === "ready" && visibleCount > 0
              ? `${visibleCount} draft${visibleCount === 1 ? "" : "s"} ready — review, publish, or skip.`
              : status === "ready" && visibleCount === 0
                ? "All drafts handled. Suggest again any time."
                : status === "loading"
                  ? "Watching tenant activity and composing posts…"
                  : status === "empty"
                    ? "Nothing post-worthy in the last 7 days yet — try after more sessions land."
                    : "Copilot drafts shout-outs and nudges based on real activity in the tenant."}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={status === "loading"}
          className={cn(
            "shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold",
            "bg-ink text-white hover:brightness-110 disabled:opacity-60",
          )}
        >
          <Icon name="ai-sparkle" size={11} />
          {status === "idle"
            ? "Suggest drafts"
            : status === "loading"
              ? "Drafting…"
              : "Suggest again"}
        </button>
      </div>

      {errorMsg ? (
        <div className="text-[11.5px] text-bad font-mono">{errorMsg}</div>
      ) : null}

      {status === "ready" && visibleCount > 0 ? (
        <div className="space-y-3">
          {drafts.map((d, i) =>
            dismissedIdx.has(i) || publishedIdx.has(i) ? null : (
              <DraftCard
                key={i}
                draft={d}
                publishing={publishing}
                onPublish={() => publish(i)}
                onDismiss={() => dismiss(i)}
              />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function DraftCard({
  draft,
  publishing,
  onPublish,
  onDismiss,
}: {
  draft: Draft;
  publishing: boolean;
  onPublish: () => void;
  onDismiss: () => void;
}) {
  const kindLabel =
    draft.kind === "win"
      ? "Win"
      : draft.kind === "announcement"
        ? "Announcement"
        : "Nudge";
  const kindCls =
    draft.kind === "win"
      ? "bg-good-pale text-good"
      : draft.kind === "announcement"
        ? "bg-accent-pale text-accent-strong"
        : "bg-[#ede9fe] text-[#6d4ad9]";
  return (
    <article className="bg-surface border border-border rounded-[10px] p-4 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={cn(
            "text-[10.5px] font-bold uppercase tracking-[0.08em] px-2 py-1 rounded-[6px]",
            kindCls,
          )}
        >
          {kindLabel}
        </span>
        <span className="text-[11px] text-ink-3 truncate flex-1 min-w-0">
          {draft.reason}
        </span>
      </div>
      <p className="text-[13.5px] text-ink leading-[1.55] whitespace-pre-wrap">
        {draft.body}
      </p>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onPublish}
          disabled={publishing}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12.5px] font-semibold",
            "bg-accent text-white hover:bg-accent-strong disabled:opacity-60",
          )}
        >
          {publishing ? "Publishing…" : "Publish"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={publishing}
          className="px-3 py-1.5 rounded-md text-[12.5px] font-semibold text-ink-3 hover:text-ink hover:bg-surface-2"
        >
          Dismiss
        </button>
      </div>
    </article>
  );
}
