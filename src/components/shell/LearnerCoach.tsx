// LearnerCoach — the AI Coach drawer body for /learn/*.
//
// Streaming chat with /api/coach/chat. The server rebuilds the system prompt
// from the learner's real history each turn — the client just sends the
// conversation so far.
//
// Prompt chips: shown only when the conversation is empty. Clicking a chip
// sends it immediately.

"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type Msg = { role: "user" | "assistant"; content: string };

const QUICK_PROMPTS = [
  "What should I practice next?",
  "Quiz me on my weakest skill",
  "Explain my last session",
  "Plan my week",
];

export function LearnerCoach() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    setInput("");
    setError(null);

    const next: Msg[] = [
      ...messages,
      { role: "user", content: trimmed },
      { role: "assistant", content: "" }, // placeholder we stream into
    ];
    setMessages(next);
    setStreaming(true);

    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Don't send the empty assistant placeholder.
          messages: next.slice(0, -1),
        }),
      });
      if (!res.ok || !res.body) throw new Error(`chat failed: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((cur) => {
          const out = [...cur];
          const last = out[out.length - 1];
          if (last && last.role === "assistant") {
            out[out.length - 1] = {
              role: "assistant",
              content: last.content + chunk,
            };
          }
          return out;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
      // If the assistant placeholder is still empty, drop it.
      setMessages((cur) =>
        cur[cur.length - 1]?.role === "assistant" &&
        cur[cur.length - 1]?.content === ""
          ? cur.slice(0, -1)
          : cur,
      );
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
      >
        {messages.length === 0 ? (
          <div className="space-y-3">
            <div className="bg-ai-grad-soft rounded-md p-3 text-[12.5px] text-ink">
              I read your sessions, scores, and assignments. Ask me anything —
              or pick a starter below.
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

        {streaming &&
        messages[messages.length - 1]?.role === "assistant" &&
        messages[messages.length - 1]?.content === "" ? (
          <div className="text-[11.5px] text-ink-3 font-mono">…thinking</div>
        ) : null}

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
          placeholder="Ask the coach…"
          disabled={streaming}
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
          disabled={streaming || !input.trim()}
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
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[88%] px-3 py-2 rounded-lg text-[13px] leading-[1.45] whitespace-pre-wrap",
          isUser
            ? "bg-ink text-white"
            : "bg-surface border border-border text-ink",
        )}
      >
        {m.content || (isUser ? "" : "…")}
      </div>
    </div>
  );
}
