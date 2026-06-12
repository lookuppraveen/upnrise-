// Knowledge sources card for the wizard.
//
// New layout (matches Step 1 mockup): a single tab row at the top —
// Upload files / Add URL / Paste text — switches the body. Below the
// body we render an "indexed N" pill and the list of attached sources
// (each with a kind glyph, name, status, and a remove button). A
// secondary "Attach from library" affordance lets the admin pull in
// company-wide sources that aren't tied to this training yet.
//
// All ingest flows write KbSource rows with trainingId pre-set so the
// row lands on the current training. PDF/DOCX share the parsers used
// by /admin/knowledge.

"use client";

import { useRef, useState, useTransition } from "react";
import {
  createFileKbSource,
  createTextKbSource,
  createUrlKbSource,
} from "@/app/admin/knowledge/actions";
import {
  attachKbSourceToTraining,
  detachKbSourceFromTraining,
} from "@/app/admin/trainings/actions";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type KbKind = "pdf" | "doc" | "url" | "text";

export type AttachedKbSource = {
  id: string;
  kind: KbKind;
  name: string;
  size: number | null;
  sourceUrl: string | null;
  createdAt: string;
};

export type LibraryKbSource = {
  id: string;
  kind: KbKind;
  name: string;
  size: number | null;
  sourceUrl: string | null;
};

const KIND_ICON: Record<KbKind, IconName> = {
  text: "clipboard",
  url: "globe",
  doc: "book",
  pdf: "book",
};

const KIND_LABEL: Record<KbKind, string> = {
  text: "TEXT",
  url: "URL",
  doc: "DOC",
  pdf: "PDF",
};

// Per-kind tag colors for the small left-side glyph chip.
const KIND_BG: Record<KbKind, string> = {
  pdf: "#e34c4c",
  doc: "#2563eb",
  url: "#7c5cd6",
  text: "#6b7280",
};

type Tab = "file" | "url" | "text";

export function WizardKbSources({
  trainingId,
  attached,
  library,
}: {
  trainingId: string;
  attached: AttachedKbSource[];
  library: LibraryKbSource[];
}) {
  const [tab, setTab] = useState<Tab>("file");
  const [showLibrary, setShowLibrary] = useState(false);

  return (
    <div className="bg-surface border border-border rounded-[12px] p-5 space-y-4">
      {/* Header */}
      <div className="space-y-1">
        <h3 className="font-display text-[20px] leading-tight">
          Knowledge Base · train your AI
        </h3>
        <p className="text-[12.5px] text-ink-2 leading-[1.5] max-w-[640px]">
          Add files, URLs, or product docs. AI will index them and use them
          as context for personas, scenarios, and feedback. Sources stay
          private to this training.
        </p>
      </div>

      {/* Indexed pill */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-white"
          style={{ background: "var(--ai-grad, #7c5cd6)" }}
        >
          <Icon name="ai-sparkle" size={10} />
          {attached.length} indexed
        </span>
        {library.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowLibrary((v) => !v)}
            suppressHydrationWarning
            className="text-[11.5px] font-semibold text-ink-2 hover:text-ink underline underline-offset-2"
          >
            {showLibrary ? "Hide library" : `Attach from library (${library.length})`}
          </button>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <TabButton active={tab === "file"} onClick={() => setTab("file")}>
          <Icon name="layers" size={11} />
          Upload files
        </TabButton>
        <TabButton active={tab === "url"} onClick={() => setTab("url")}>
          <Icon name="globe" size={11} />
          Add URL
        </TabButton>
        <TabButton active={tab === "text"} onClick={() => setTab("text")}>
          <Icon name="clipboard" size={11} />
          Paste text
        </TabButton>
      </div>

      {/* Body */}
      {tab === "file" ? (
        <FileDropzone trainingId={trainingId} />
      ) : tab === "url" ? (
        <UrlForm trainingId={trainingId} />
      ) : (
        <TextForm trainingId={trainingId} />
      )}

      {/* Library picker (collapsible) */}
      {showLibrary ? (
        <LibraryPicker
          trainingId={trainingId}
          library={library}
          onDone={() => setShowLibrary(false)}
        />
      ) : null}

      {/* Attached sources list */}
      {attached.length === 0 ? null : (
        <ul className="space-y-2">
          {attached.map((s) => (
            <AttachedRow key={s.id} trainingId={trainingId} source={s} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      suppressHydrationWarning
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold border transition-colors",
        active
          ? "bg-surface text-ink border-border-strong shadow-sm"
          : "bg-surface-2 text-ink-2 border-border hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

// ─────────────── Attached row ───────────────

function AttachedRow({
  trainingId,
  source,
}: {
  trainingId: string;
  source: AttachedKbSource;
}) {
  const [pending, startTransition] = useTransition();
  function detach() {
    startTransition(
      () => void detachKbSourceFromTraining(trainingId, source.id),
    );
  }
  return (
    <li className="bg-surface border border-border rounded-md p-3 flex items-center gap-3">
      <span
        className="w-9 h-9 grid place-items-center rounded-md text-white text-[9px] font-bold tracking-[0.05em] shrink-0"
        style={{ background: KIND_BG[source.kind] }}
        aria-hidden
      >
        {KIND_LABEL[source.kind]}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[13px] text-ink truncate">
          {source.name}
        </div>
        <div className="text-[11px] font-mono text-ink-3 mt-0.5">
          {source.size != null ? `${formatChars(source.size)} chars` : "—"}
          {source.sourceUrl ? ` · ${source.sourceUrl}` : ""}
        </div>
      </div>
      <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-good bg-good-pale px-2 py-0.5 rounded-full">
        <Icon name="ai-sparkle" size={9} />
        Indexed
      </span>
      <button
        type="button"
        onClick={detach}
        disabled={pending}
        aria-label={`Detach ${source.name}`}
        className="w-7 h-7 grid place-items-center rounded-md border border-border bg-surface-2 text-ink-3 hover:text-bad hover:bg-bad-pale disabled:opacity-50 shrink-0"
      >
        ×
      </button>
    </li>
  );
}

// ─────────────── File dropzone ───────────────

function FileDropzone({ trainingId }: { trainingId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [filename, setFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    setFilename(file.name);
    const fd = new FormData();
    fd.set("name", file.name.replace(/\.[^.]+$/, ""));
    fd.set("file", file);
    fd.set("trainingId", trainingId);
    startTransition(async () => {
      try {
        await createFileKbSource(fd);
        setFilename(null);
        if (fileRef.current) fileRef.current.value = "";
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <div className="space-y-2">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "block border-2 border-dashed rounded-[10px] p-8 text-center cursor-pointer transition-colors",
          dragOver
            ? "border-accent bg-accent-pale/40"
            : "border-border hover:border-accent-pale bg-surface-2",
        )}
      >
        <div
          className="w-12 h-12 mx-auto grid place-items-center rounded-md text-white mb-2"
          style={{ background: "var(--ai-grad, #7c5cd6)" }}
          aria-hidden
        >
          <Icon name="layers" size={18} />
        </div>
        <div className="text-[14px] font-semibold text-ink">
          {pending
            ? `Indexing ${filename ?? "file"}…`
            : "Drop files here or click to browse"}
        </div>
        <div className="text-[11.5px] text-ink-3 mt-1">
          PDF · DOCX · TXT · MD · max 20 MB
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
          onChange={(e) => handleFile(e.target.files?.[0])}
          disabled={pending}
          className="hidden"
        />
      </label>
      {error ? (
        <p className="text-[11.5px] text-bad font-mono">{error}</p>
      ) : null}
    </div>
  );
}

// ─────────────── URL form ───────────────

function UrlForm({ trainingId }: { trainingId: string }) {
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
        const created = await createUrlKbSource({
          name: name.trim() || url,
          url: url.trim(),
        });
        await attachKbSourceToTraining(trainingId, created.id);
        setName("");
        setUrl("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <div className="space-y-2 bg-surface-2 border border-border rounded-[10px] p-4">
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://example.com/article"
        className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
        suppressHydrationWarning
      />
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Source title (optional)"
        className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[12.5px] focus:outline-none focus:border-accent"
        suppressHydrationWarning
      />
      <SubmitRow
        ready={url.trim().length > 0}
        pending={pending}
        error={error}
        onSubmit={submit}
        label="Fetch + index"
      />
    </div>
  );
}

// ─────────────── Text form ───────────────

function TextForm({ trainingId }: { trainingId: string }) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const created = await createTextKbSource({
          name: name.trim(),
          content,
        });
        await attachKbSourceToTraining(trainingId, created.id);
        setName("");
        setContent("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <div className="space-y-2 bg-surface-2 border border-border rounded-[10px] p-4">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Source title"
        className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[12.5px] focus:outline-none focus:border-accent"
        suppressHydrationWarning
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        placeholder="Paste reference material…"
        className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[12.5px] leading-[1.5] font-mono focus:outline-none focus:border-accent"
        suppressHydrationWarning
      />
      <SubmitRow
        ready={name.trim().length > 0 && content.trim().length >= 10}
        pending={pending}
        error={error}
        onSubmit={submit}
        label="Save + index"
      />
    </div>
  );
}

// ─────────────── Library picker ───────────────

function LibraryPicker({
  trainingId,
  library,
  onDone,
}: {
  trainingId: string;
  library: LibraryKbSource[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  function attach(id: string) {
    startTransition(() => {
      void attachKbSourceToTraining(trainingId, id);
    });
  }
  return (
    <div className="bg-surface-2 border border-border rounded-[10px] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3">
          From library ({library.length})
        </span>
        <button
          type="button"
          onClick={onDone}
          className="text-[12px] text-ink-3 hover:text-ink"
        >
          Done
        </button>
      </div>
      <ul className="space-y-1.5">
        {library.map((s) => (
          <li
            key={s.id}
            className="bg-surface border border-border rounded-md p-2.5 flex items-center gap-3"
          >
            <span
              className="w-7 h-7 grid place-items-center rounded-md text-white text-[8px] font-bold shrink-0"
              style={{ background: KIND_BG[s.kind] }}
            >
              {KIND_LABEL[s.kind]}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[12.5px] text-ink truncate">
                {s.name}
              </div>
              <div className="text-[10.5px] font-mono text-ink-3">
                {s.size != null ? `${formatChars(s.size)} chars` : "—"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => attach(s.id)}
              disabled={pending}
              className="text-[11.5px] font-semibold text-accent hover:text-accent-strong px-2 py-1 disabled:opacity-50"
            >
              Attach
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────── Atoms ───────────────

function SubmitRow({
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
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md",
          "bg-accent text-white text-[12.5px] font-semibold",
          "hover:bg-accent-strong disabled:opacity-60",
        )}
      >
        <Icon name="ai-sparkle" size={11} />
        {pending ? "Saving…" : label}
      </button>
      {error ? (
        <span className="text-[11.5px] text-bad font-mono">{error}</span>
      ) : null}
    </div>
  );
}

function formatChars(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}
