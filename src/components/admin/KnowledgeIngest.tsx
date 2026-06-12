// Knowledge Base ingest panel. Three tabs:
//   - Paste text
//   - Fetch URL (server-side fetch + HTML strip)
//   - Upload .txt/.md (sent via FormData to a server action)
//
// All paths land in kb_sources with status=ready and the extracted
// text in `content`. PDF support is deferred.

"use client";

import { useRef, useState, useTransition } from "react";
import {
  createFileKbSource,
  createTextKbSource,
  createUrlKbSource,
} from "@/app/admin/knowledge/actions";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type Tab = "text" | "url" | "file";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "text", label: "Paste text" },
  { id: "url", label: "Fetch URL" },
  { id: "file", label: "Upload file" },
];

export function KnowledgeIngest() {
  const [tab, setTab] = useState<Tab>("text");

  return (
    <div className="bg-surface border border-border rounded-[12px] p-5 space-y-4">
      <div className="flex items-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors",
              tab === t.id
                ? "bg-ink text-white"
                : "bg-surface-2 text-ink-2 border border-border hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "text" ? <TextForm /> : tab === "url" ? <UrlForm /> : <FileForm />}
    </div>
  );
}

// ─────────────── Text ───────────────

function TextForm() {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await createTextKbSource({ name: name.trim(), content });
        setName("");
        setContent("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <div className="space-y-3">
      <Field label="Source title">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Q3 pricing playbook"
          className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
          suppressHydrationWarning
        />
      </Field>
      <Field label="Content">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          placeholder="Paste your reference material here…"
          className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] leading-[1.5] font-mono focus:outline-none focus:border-accent"
          suppressHydrationWarning
        />
      </Field>
      <SubmitBar
        ready={name.trim().length > 0 && content.trim().length >= 10}
        pending={pending}
        error={error}
        onSubmit={submit}
        label="Add text source"
      />
    </div>
  );
}

// ─────────────── URL ───────────────

function UrlForm() {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    try {
      new URL(url);
    } catch {
      setError("Enter a full URL (https://…)");
      return;
    }
    startTransition(async () => {
      try {
        await createUrlKbSource({ name: name.trim(), url: url.trim() });
        setName("");
        setUrl("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <div className="space-y-3">
      <Field label="Source title">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Competitor pricing page"
          className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
          suppressHydrationWarning
        />
      </Field>
      <Field label="URL">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/article"
          className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
          suppressHydrationWarning
        />
      </Field>
      <p className="text-[11.5px] text-ink-3">
        We&apos;ll fetch the page server-side and strip the HTML to plain
        text. JS-rendered pages may come back empty — paste the article
        text instead in that case.
      </p>
      <SubmitBar
        ready={name.trim().length > 0 && url.trim().length > 0}
        pending={pending}
        error={error}
        onSubmit={submit}
        label="Fetch & add URL"
      />
    </div>
  );
}

// ─────────────── File ───────────────

function FileForm() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Pick a file");
      return;
    }
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("file", file);
    startTransition(async () => {
      try {
        await createFileKbSource(fd);
        setName("");
        setFilename(null);
        if (fileRef.current) fileRef.current.value = "";
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <div className="space-y-3">
      <Field label="Source title">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Discovery playbook v2"
          className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
          suppressHydrationWarning
        />
      </Field>
      <Field label="File">
        <label className="flex items-center gap-3 bg-surface-2 border border-dashed border-border rounded-md px-3 py-3 cursor-pointer hover:border-accent">
          <Icon name="layers" size={14} className="text-ink-3" />
          <span className="text-[12.5px] text-ink-2 flex-1 truncate">
            {filename ?? "Pick a .pdf, .docx, .txt, or .md file (max 20 MB)"}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
            onChange={(e) =>
              setFilename(e.target.files?.[0]?.name ?? null)
            }
            className="hidden"
          />
        </label>
      </Field>
      <p className="text-[11.5px] text-ink-3 leading-[1.5]">
        Legacy <code className="font-mono">.doc</code> files aren&apos;t
        supported — save as <code className="font-mono">.docx</code> first.
        PDFs and Word docs are converted to plain text before grounding.
      </p>
      <SubmitBar
        ready={name.trim().length > 0 && filename != null}
        pending={pending}
        error={error}
        onSubmit={submit}
        label="Upload file"
      />
    </div>
  );
}

// ─────────────── Shared atoms ───────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {label}
      </span>
      {children}
    </label>
  );
}

function SubmitBar({
  ready,
  pending,
  error,
  onSubmit,
  label,
}: {
  ready: boolean;
  pending: boolean;
  error: string | null;
  onSubmit: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onSubmit}
        disabled={!ready || pending}
        className={cn(
          "inline-flex items-center gap-1.5 px-4 py-2 rounded-md",
          "bg-accent text-white text-[13px] font-semibold",
          "hover:bg-accent-strong disabled:opacity-60",
        )}
      >
        <Icon name="ai-sparkle" size={12} />
        {pending ? "Saving…" : label}
      </button>
      {error ? (
        <span className="text-[12px] text-bad font-mono">{error}</span>
      ) : null}
    </div>
  );
}
