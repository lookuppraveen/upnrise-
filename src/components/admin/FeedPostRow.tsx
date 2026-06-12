// Single feed post row. Three visual variants tied to FeedPostKind:
//   - ai_nudge   → "UPnRise AI · Insight" header, purple circle badge,
//                  pinkish soft card outline
//   - announcement (peer post) → brand gradient avatar, author name +
//                  email handle as subtitle, no extra chrome
//   - win (milestone) → trophy badge with "Milestone" pill
//
// Admin caller passes deletable=true to surface the hover Delete button.

"use client";

import { useState, useTransition } from "react";
import { deleteFeedPost } from "@/app/admin/feeds/actions";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type Post = {
  id: string;
  kind: "announcement" | "win" | "ai_nudge";
  body: string;
  createdAt: Date | string;
  author: { id: string; name: string | null; email: string } | null;
};

export function FeedPostRow({
  post,
  deletable,
}: {
  post: Post;
  deletable: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);

  function remove() {
    startTransition(async () => {
      await deleteFeedPost(post.id);
    });
  }

  const authorName =
    post.author?.name ?? post.author?.email?.split("@")[0] ?? "UPnRise AI";
  const handle = post.author?.email?.split("@")[0];
  const dateLabel = fmtDate(new Date(post.createdAt));

  const isAi = post.kind === "ai_nudge" || !post.author;
  const isWin = post.kind === "win";

  return (
    <div
      className={cn(
        "group bg-surface border rounded-[12px] p-4 transition-colors",
        isAi
          ? "border-[#e6d2f1]"
          : "border-border hover:border-border-strong",
      )}
      style={
        isAi
          ? {
              background:
                "linear-gradient(135deg, #fbf6fd 0%, #fdf4f7 100%)",
            }
          : undefined
      }
    >
      <div className="flex items-start gap-3">
        <Avatar
          kind={isAi ? "ai" : isWin ? "win" : "peer"}
          name={authorName}
        />
        <div className="flex-1 min-w-0">
          <Header
            kind={isAi ? "ai" : isWin ? "win" : "peer"}
            name={authorName}
            handle={handle}
            dateLabel={dateLabel}
          />
          <p
            className={cn(
              "text-[13.5px] mt-2 whitespace-pre-wrap leading-[1.55]",
              "text-ink",
            )}
          >
            {post.body}
          </p>
        </div>
        {deletable ? (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {confirm ? (
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="text-[12px] font-semibold text-white px-2 py-1 rounded-md bg-bad hover:bg-bad/90"
              >
                {pending ? "…" : "Confirm"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirm(true)}
                className="text-[12px] text-ink-3 hover:text-bad px-2 py-1 rounded-md hover:bg-bad-pale"
              >
                Delete
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Avatar({
  kind,
  name,
}: {
  kind: "ai" | "win" | "peer";
  name: string;
}) {
  if (kind === "ai") {
    return (
      <div
        className="w-9 h-9 rounded-full grid place-items-center text-white shrink-0"
        style={{
          background: "linear-gradient(135deg, #7c3aed 0%, #b94e8d 100%)",
          boxShadow: "0 3px 10px rgba(124,58,237,0.28)",
        }}
        aria-hidden
      >
        <Icon name="ai-sparkle" size={14} />
      </div>
    );
  }
  if (kind === "win") {
    return (
      <div
        className="w-9 h-9 rounded-full grid place-items-center text-white shrink-0"
        style={{
          background: "linear-gradient(135deg, #f0a042 0%, #c97a1b 100%)",
          boxShadow: "0 3px 10px rgba(201,122,27,0.25)",
        }}
        aria-hidden
      >
        <Icon name="trophy" size={14} />
      </div>
    );
  }
  // Peer
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className="w-9 h-9 rounded-full grid place-items-center text-white shrink-0 font-semibold text-[12.5px]"
      style={{
        background: avatarGradient(name),
      }}
    >
      {initial}
    </div>
  );
}

function Header({
  kind,
  name,
  handle,
  dateLabel,
}: {
  kind: "ai" | "win" | "peer";
  name: string;
  handle?: string;
  dateLabel: string;
}) {
  if (kind === "ai") {
    return (
      <div className="flex items-center gap-2 flex-wrap text-[12.5px]">
        <span className="font-semibold text-ink">UPnRise AI</span>
        <span className="text-ink-3">·</span>
        <span className="text-ink-2">Insight</span>
        <span className="ml-auto text-ink-3 font-mono text-[11px]">
          {dateLabel}
        </span>
      </div>
    );
  }
  if (kind === "win") {
    return (
      <div className="flex items-center gap-2 flex-wrap text-[12.5px]">
        <span className="font-semibold text-ink truncate">{name}</span>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] px-[7px] py-[2px] rounded-sm bg-warn-pale text-warn border border-warn/20">
          Milestone
        </span>
        <span className="ml-auto text-ink-3 font-mono text-[11px]">
          {dateLabel}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 flex-wrap text-[12.5px]">
      <span className="font-semibold text-ink truncate">{name}</span>
      {handle ? (
        <span className="text-ink-3 font-mono">@{handle}</span>
      ) : null}
      <span className="ml-auto text-ink-3 font-mono text-[11px]">
        {dateLabel}
      </span>
    </div>
  );
}

const AVATAR_PALETTES = [
  ["#e85d3a", "#c64a2b"],
  ["#7c5cd6", "#5b2eea"],
  ["#2a7d4f", "#1a5a36"],
  ["#2f80f5", "#1b56c2"],
  ["#c97a1b", "#a45c0b"],
  ["#b94e8d", "#7c2e5e"],
];

function avatarGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const [from, to] = AVATAR_PALETTES[Math.abs(h) % AVATAR_PALETTES.length];
  return `linear-gradient(135deg, ${from}, ${to})`;
}

function fmtDate(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
