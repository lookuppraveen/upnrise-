// Document per-module editor — matches the design's two-section layout.
//
// Rendered from ModuleEditPage when `m.type === "document"` (including
// the Coach modules stored as document with body.kind=coach — they
// fall through here until their dedicated editor lands).
//
//   Header  — Edit Training title, Back to Modules
//   Module Name + Module Status (Unpublish/Publish)
//   Module Description (rich text editor — toolbar is visual-only)
//   "Generate using PPT" button (black, sparkle)
//   Documents card — dashed dropzone for .docx/.pdf/.pptx
//
// Header + body persist together through saveDocumentModule. Documents
// are stored as inline data URLs in body.documents until permanent
// object storage lands.

"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteModule,
  saveDocumentModule,
} from "@/app/admin/trainings/actions";
import { uploadAttachment } from "@/app/admin/trainings/upload-actions";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import {
  deepEqualJson,
  useUnsavedChangesGuard,
} from "@/hooks/useUnsavedChangesGuard";
import { cn } from "@/lib/cn";

type DocKind = "docx" | "pdf" | "pptx" | "other";
type DocEntry = { name: string; kind: DocKind; url: string };

type DocumentBody = {
  description?: string;
  documents?: DocEntry[];
};

const MAX_DOC_BYTES = 25 * 1024 * 1024;

export function DocumentModuleEditor({
  trainingId,
  trainingTitle,
  moduleId,
  initialName,
  initialPublished,
  body,
}: {
  trainingId: string;
  trainingTitle: string;
  moduleId: string;
  initialName: string;
  initialPublished: boolean;
  body: Record<string, unknown> | null;
}) {
  const initial = useMemo(() => {
    const b = (body ?? {}) as DocumentBody;
    return {
      description: b.description ?? "",
      documents: b.documents ?? [],
    };
  }, [body]);

  const [name, setName] = useState(initialName);
  const [published, setPublished] = useState(initialPublished);
  const [description, setDescription] = useState(initial.description);
  const [documents, setDocuments] = useState<DocEntry[]>(initial.documents);
  const [pending, startTransition] = useTransition();
  const [generatingPpt, setGeneratingPpt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const dirty = !deepEqualJson(
    { name, published, description, documents },
    {
      name: initialName,
      published: initialPublished,
      description: initial.description,
      documents: initial.documents,
    },
  );
  useUnsavedChangesGuard(dirty);

  function save(thenBack: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await saveDocumentModule(trainingId, moduleId, {
          name,
          published,
          description,
          documents,
        });
        toast.success("Module saved");
        if (thenBack) {
          router.push(`/admin/trainings/${trainingId}/edit?step=2`);
        } else {
          router.refresh();
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Save failed";
        setError(msg);
        toast.error("Save failed", msg);
      }
    });
  }

  async function addFiles(files: FileList) {
    setError(null);
    const next: DocEntry[] = [];
    for (const f of Array.from(files)) {
      const kind = kindFor(f.name);
      if (!kind) {
        setError(
          `${f.name} isn't a .docx, .pdf, or .pptx file. Skipped.`,
        );
        continue;
      }
      if (f.size > MAX_DOC_BYTES) {
        setError(`${f.name} is over 25 MB. Skipped.`);
        continue;
      }
      try {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("category", "documents");
        fd.append("trainingId", trainingId);
        fd.append("moduleId", moduleId);
        const { url } = await uploadAttachment(fd);
        next.push({ name: f.name, kind, url });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Upload failed";
        setError(`${f.name}: ${msg}`);
        toast.error("Upload failed", `${f.name}: ${msg}`);
      }
    }
    if (next.length > 0) {
      setDocuments([...documents, ...next]);
      toast.success(`${next.length} document${next.length === 1 ? "" : "s"} uploaded`);
    }
  }

  function removeDoc(i: number) {
    setDocuments(documents.filter((_, idx) => idx !== i));
  }

  function clearAll() {
    if (documents.length === 0) return;
    if (!window.confirm(`Remove all ${documents.length} document(s)?`)) return;
    setDocuments([]);
  }

  async function generateUsingPpt() {
    setError(null);
    if (description.trim().length < 20 && documents.length === 0) {
      const msg =
        "Add a description or upload documents before generating a PPT.";
      setError(msg);
      toast.error("Nothing to generate from", msg);
      return;
    }
    setGeneratingPpt(true);
    try {
      const res = await fetch("/api/admin/document-to-coach/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainingId, documentModuleId: moduleId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `generate failed: ${res.status}`);
      }
      const { id } = (await res.json()) as { id: string };
      toast.success(
        "Coach PPT module created",
        "Opening the new module so you can review it.",
      );
      router.push(`/admin/trainings/${trainingId}/modules/${id}/edit`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generate failed";
      setError(msg);
      toast.error("Generate failed", msg);
    } finally {
      setGeneratingPpt(false);
    }
  }

  function remove() {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      try {
        await deleteModule(trainingId, moduleId);
        toast.success("Module deleted");
        router.push(`/admin/trainings/${trainingId}/edit?step=2`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Delete failed";
        setError(msg);
        toast.error("Delete failed", msg);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Edit Training header */}
      <h1 className="font-display text-[22px] text-accent">
        Edit Training -{" "}
        <span className="font-semibold">{trainingTitle}</span>
      </h1>

      {/* Back link */}
      <div>
        <Link
          href={`/admin/trainings/${trainingId}/edit?step=2`}
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink"
        >
          <Icon name="chevron-right" size={12} className="rotate-180" />
          Back to Modules
        </Link>
      </div>

      {/* Name + Status */}
      <div className="grid gap-5 md:grid-cols-[1fr_auto]">
        <label className="block space-y-1.5">
          <span className="block text-[12.5px] font-semibold text-ink">
            Module Name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Module Name"
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[14px] focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </label>
        <label className="block space-y-1.5">
          <span className="block text-[12.5px] font-semibold text-ink">
            Module Status
          </span>
          <StatusToggle value={published} onChange={setPublished} />
        </label>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <div className="text-[11.5px] text-ink-2">Module Description</div>
        <FakeRichEditor
          value={description}
          onChange={setDescription}
          minHeight={140}
        />
      </div>

      {/* Generate using PPT */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={generateUsingPpt}
          disabled={pending || generatingPpt}
          suppressHydrationWarning
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-ink text-white text-[12.5px] font-semibold hover:bg-[#2a2a2a] disabled:opacity-60"
        >
          <Icon name="ai-sparkle" size={11} />
          {generatingPpt ? "Generating PPT…" : "Generate using PPT"}
        </button>
      </div>

      {/* Documents card */}
      <DocumentsDropzone
        documents={documents}
        onAdd={addFiles}
        onRemove={removeDoc}
        onClearAll={clearAll}
      />

      {error ? (
        <p className="text-[11.5px] text-bad font-mono">{error}</p>
      ) : null}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-4 border-t border-border">
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          suppressHydrationWarning
          className="text-[12.5px] text-ink-3 hover:text-bad px-2 py-1 rounded-md hover:bg-bad-pale disabled:opacity-50"
        >
          Delete module
        </button>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/trainings/${trainingId}/edit?step=2`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-surface text-[12.5px] font-semibold text-ink-2 hover:text-ink"
          >
            <Icon name="chevron-right" size={11} className="rotate-180" />
            Back
          </Link>
          <button
            type="button"
            onClick={() => save(false)}
            disabled={pending}
            suppressHydrationWarning
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-ink text-white text-[12.5px] font-semibold hover:bg-[#2a2a2a] disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => save(true)}
            disabled={pending}
            suppressHydrationWarning
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-strong disabled:opacity-60"
          >
            <Icon name="chevron-right" size={11} className="rotate-180" />
            Save &amp; Back to Modules
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────── Documents dropzone ───────────────

function DocumentsDropzone({
  documents,
  onAdd,
  onRemove,
  onClearAll,
}: {
  documents: DocEntry[];
  onAdd: (files: FileList) => void;
  onRemove: (i: number) => void;
  onClearAll: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div className="bg-surface border border-border rounded-[12px] p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[14.5px] font-semibold text-ink">Documents</div>
        <button
          type="button"
          onClick={onClearAll}
          disabled={documents.length === 0}
          className="text-[12px] font-semibold text-accent hover:text-accent-strong disabled:text-accent-pale disabled:cursor-not-allowed"
        >
          Clear All
        </button>
      </div>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files.length > 0) onAdd(e.dataTransfer.files);
        }}
        className={cn(
          "w-full border-2 border-dashed rounded-[10px] py-10 px-4 text-center transition-colors",
          over
            ? "border-accent bg-accent-pale/30"
            : "border-border bg-surface-2/30 hover:border-accent-pale",
        )}
      >
        <UploadCloudIcon />
        <div className="mt-2 text-[13px]">
          <span className="text-accent font-semibold">Click Here</span>{" "}
          <span className="text-accent">to Upload</span>
        </div>
        <div className="text-[11.5px] text-accent mt-0.5">
          upload .docx, .pdf, .pptx file
        </div>
      </button>

      <input
        ref={fileRef}
        type="file"
        accept=".docx,.pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onAdd(e.target.files);
          e.target.value = "";
        }}
      />

      {documents.length > 0 ? (
        <ul className="space-y-1.5">
          {documents.map((d, i) => (
            <li
              key={`${d.name}-${i}`}
              className="flex items-center gap-3 px-3 py-2 bg-surface-2 border border-border rounded-md"
            >
              <span
                className={cn(
                  "inline-flex items-center justify-center w-9 h-9 rounded-md text-[10.5px] font-bold uppercase",
                  d.kind === "pdf" && "bg-[#fde2e2] text-[#b42318]",
                  d.kind === "docx" && "bg-[#e0ecfc] text-[#1849a9]",
                  d.kind === "pptx" && "bg-[#feecdb] text-[#b54708]",
                  d.kind === "other" && "bg-surface text-ink-3",
                )}
                aria-hidden
              >
                {d.kind.toUpperCase()}
              </span>
              <a
                href={d.url}
                download={d.name}
                className="flex-1 text-[12.5px] text-ink truncate hover:text-accent"
                title={d.name}
              >
                {d.name}
              </a>
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`Remove ${d.name}`}
                className="text-ink-3 hover:text-bad text-[14px]"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function UploadCloudIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#6d4ad9"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="mx-auto"
    >
      <path d="M4 17a4 4 0 0 1 1.5-7.8A6 6 0 0 1 17 9a4 4 0 0 1 2 7.7" />
      <path d="M12 11v8M8 15l4-4 4 4" />
    </svg>
  );
}

function kindFor(filename: string): DocKind | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".pptx")) return "pptx";
  return null;
}

// ─────────────── Status toggle ───────────────

function StatusToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <div className="inline-flex items-center bg-surface-2 border border-border rounded-md p-0.5">
      <button
        type="button"
        onClick={() => onChange(false)}
        suppressHydrationWarning
        className={cn(
          "px-3 py-1 rounded text-[12px] font-semibold transition-colors",
          !value ? "bg-ink-2 text-white" : "text-ink-2 hover:text-ink",
        )}
      >
        Unpublish
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        suppressHydrationWarning
        className={cn(
          "px-3 py-1 rounded text-[12px] font-semibold transition-colors",
          value ? "bg-accent text-white" : "text-ink-2 hover:text-ink",
        )}
      >
        Publish
      </button>
    </div>
  );
}

// ─────────────── Fake rich editor (same shape as Roleplay/Video) ───────────────

function FakeRichEditor({
  value,
  onChange,
  minHeight = 100,
}: {
  value: string;
  onChange: (v: string) => void;
  minHeight?: number;
}) {
  return (
    <div className="rounded-md overflow-hidden bg-surface border border-border-strong">
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-border bg-surface-2 text-[11.5px] text-ink-2">
        <FakeBtn>Paragraph ▾</FakeBtn>
        <FakeBtn>System Font ▾</FakeBtn>
        <FakeBtn>12pt ▾</FakeBtn>
        <Sep />
        <FakeBtn ariaLabel="Bold"><b>B</b></FakeBtn>
        <FakeBtn ariaLabel="Italic"><i>I</i></FakeBtn>
        <FakeBtn ariaLabel="Underline"><u>U</u></FakeBtn>
        <Sep />
        <FakeBtn ariaLabel="Align">≡▾</FakeBtn>
        <FakeBtn ariaLabel="Ordered list">1.</FakeBtn>
        <FakeBtn ariaLabel="Bulleted list">•</FakeBtn>
        <Sep />
        <FakeBtn ariaLabel="Text color"><span style={{ color: "#ef4444" }}>A</span>▾</FakeBtn>
        <FakeBtn ariaLabel="Highlight"><span style={{ background: "#fde68a", padding: "0 2px" }}>A</span>▾</FakeBtn>
        <Sep />
        <FakeBtn ariaLabel="Link">🔗</FakeBtn>
        <FakeBtn ariaLabel="Table">⊞▾</FakeBtn>
        <FakeBtn ariaLabel="Variables">{"{ }"}</FakeBtn>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ minHeight }}
        className="w-full px-3 py-2.5 text-[13px] bg-transparent border-0 focus:outline-none resize-y leading-relaxed"
        suppressHydrationWarning
      />
      <div className="px-3 py-1 text-[10.5px] text-ink-3 font-mono border-t border-border bg-surface-2">
        p
      </div>
    </div>
  );
}

function FakeBtn({
  children,
  ariaLabel,
}: {
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={(e) => e.preventDefault()}
      className="px-1.5 py-0.5 rounded text-[11.5px] text-ink-2 hover:bg-surface"
      suppressHydrationWarning
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-1 h-4 w-px bg-border" aria-hidden />;
}
