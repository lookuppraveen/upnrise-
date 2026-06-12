// AdminCopilot — chat UI for admin AI drawer.
//
// Non-streaming (Phase 3.3): send full conversation, wait for full reply +
// action log, then append. Actions show as small chips under the assistant
// message so the admin sees what was executed.

"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type Msg = {
  role: "user" | "assistant";
  content: string;
  actions?: Array<{ tool: string; summary: string; ok: boolean }>;
};

const QUICK_PROMPTS = [
  "What's the state of my tenant?",
  "Who's overdue and on what?",
  "List my drafts",
  "Anyone struggling?",
];

export function AdminCopilot() {
  const pathname = usePathname();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, thinking]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    setInput("");
    setError(null);

    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setThinking(true);

    try {
      const res = await fetch("/api/admin/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
          currentPath: pathname,
        }),
      });
      if (!res.ok) throw new Error(`chat failed: ${res.status}`);
      const data: {
        reply: string;
        actions: Array<{ tool: string; summary: string; ok: boolean }>;
      } = await res.json();
      setMessages((cur) => [
        ...cur,
        { role: "assistant", content: data.reply, actions: data.actions },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <div className="bg-ai-grad-soft rounded-md p-3 text-[12.5px] text-ink">
              I can read your tenant data and act on it. Try a starter or ask
              anything — for example, "assign Cold-call discovery to all
              trainees with avg below 70".
            </div>
            <div className="text-[11px] uppercase tracking-[0.1em] text-ink-3">
              Try
            </div>
            <div className="flex flex-col gap-1.5">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => void send(p)}
                  className={cn(
                    "text-left px-3 py-2 rounded-md border border-border",
                    "bg-surface text-[12.5px] text-ink hover:bg-surface-2",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => <Bubble key={i} m={m} />)
        )}

        {thinking ? <ThinkingDots /> : null}

        {error ? (
          <div className="text-[11.5px] text-bad font-mono">{error}</div>
        ) : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="p-3 border-t border-border flex items-end gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder="Ask the copilot…"
          disabled={thinking}
          rows={2}
          className={cn(
            "flex-1 resize-none bg-surface-2 border border-border rounded-md",
            "px-3 py-2 text-[13px] focus:outline-none focus:border-accent",
            "disabled:opacity-60",
          )}
          suppressHydrationWarning
        />
        <button
          type="submit"
          disabled={thinking || !input.trim()}
          className={cn(
            "h-[34px] px-3 rounded-md text-[12.5px] font-semibold text-white",
            "bg-ai-grad hover:brightness-110",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          Send
        </button>
      </form>
    </div>
  );
}

function Bubble({ m }: { m: Msg }) {
  const isUser = m.role === "user";
  return (
    <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[88%] px-3 py-2 rounded-lg text-[13px] leading-[1.45] whitespace-pre-wrap",
          isUser
            ? "bg-ink text-white"
            : "bg-surface border border-border text-ink",
        )}
      >
        {m.content}
      </div>
      {!isUser && m.actions && m.actions.length > 0 ? (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {m.actions.map((a, i) => (
            <span
              key={i}
              className={cn(
                "inline-flex items-center gap-1 text-[10.5px] font-mono px-2 py-[2px] rounded-sm border",
                a.ok
                  ? "bg-good-pale text-good border-good/20"
                  : "bg-bad-pale text-bad border-bad/20",
              )}
              title={a.summary}
            >
              <Icon
                name={a.ok ? "ai-sparkle" : "alert"}
                size={9}
                className="opacity-70"
              />
              {a.tool}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 text-ink-3">
      <span className="text-[11.5px] font-mono">thinking</span>
      <span className="inline-flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-ink-3 animate-pulse" />
        <span
          className="w-1 h-1 rounded-full bg-ink-3 animate-pulse"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="w-1 h-1 rounded-full bg-ink-3 animate-pulse"
          style={{ animationDelay: "300ms" }}
        />
      </span>
    </div>
  );
}
