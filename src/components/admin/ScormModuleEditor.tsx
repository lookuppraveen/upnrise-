// Scorm per-module editor — matches the design's name+description+zip
// upload layout.
//
// Rendered from ModuleEditPage when the module is a document with
// `body.kind === "scorm"`. The SCORM package is a single .zip
// uploaded into body.scorm; 1024 MB max in the UI, but the API
// rejects anything over 32 MB until a permanent object-storage
// bucket is wired (data URLs balloon in Postgres past that).

"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteModule,
  saveScormModule,
} from "@/app/admin/trainings/actions";
import { uploadAttachment } from "@/app/admin/trainings/upload-actions";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import {
  deepEqualJson,
  useUnsavedChangesGuard,
} from "@/hooks/useUnsavedChangesGuard";
import { cn } from "@/lib/cn";

type ScormPackage = { name: string; url: string; size: number };

type ScormBody = {
  description?: string;
  scorm?: ScormPackage | null;
};

// Files now land in Supabase Storage instead of the Postgres row, so
// the cap matches the design's "1024 MB Max" label. The cap is
// re-enforced server-side in uploadAttachment.
const MAX_ZIP_BYTES = 1024 * 1024 * 1024;

export function ScormModuleEditor({
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
    const b = (body ?? {}) as ScormBody;
    return {
      description: b.description ?? "",
      scorm: b.scorm ?? null,
    };
  }, [body]);

  const [name, setName] = useState(initialName);
  const [published, setPublished] = useState(initialPublished);
  const [description, setDescription] = useState(initial.description);
  const [scorm, setScorm] = useState<ScormPackage | null>(initial.scorm);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const dirty = !deepEqualJson(
    { name, published, description, scorm },
    {
      name: initialName,
      published: initialPublished,
      description: initial.description,
      scorm: initial.scorm,
    },
  );
  useUnsavedChangesGuard(dirty);

  async function pickZip(file: File) {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("SCORM package must be a .zip file.");
      return;
    }
    if (file.size > MAX_ZIP_BYTES) {
      setError(
        `Package is over ${Math.round(MAX_ZIP_BYTES / 1024 / 1024)} MB.`,
      );
      return;
    }
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "scorm");
      fd.append("trainingId", trainingId);
      fd.append("moduleId", moduleId);
      const { url } = await uploadAttachment(fd);
      setScorm({ name: file.name, url, size: file.size });
      toast.success("SCORM package uploaded");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setError(msg);
      toast.error("Upload failed", msg);
    } finally {
      setUploading(false);
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

  function save(thenBack: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await saveScormModule(trainingId, moduleId, {
          name,
          published,
          description,
          scormPackage: scorm,
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
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink"
        >
          <Icon name="chevron-right" size={12} className="rotate-180" />
          Back to Modules
        </Link>
      </div>

      {/* Card wrapper */}
      <div className="bg-surface border border-border rounded-[12px] p-5 md:p-6 space-y-5">
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
            minHeight={120}
          />
        </div>

        {/* SCORM dropzone */}
        <ScormDropzone
          scorm={scorm}
          onPick={pickZip}
          onClear={() => setScorm(null)}
        />
      </div>

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

// ─────────────── SCORM dropzone ───────────────

function ScormDropzone({
  scorm,
  onPick,
  onClear,
}: {
  scorm: ScormPackage | null;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  if (scorm) {
    return (
      <div className="border-2 border-dashed border-border rounded-[10px] p-5 bg-surface">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center justify-center w-10 h-10 rounded-md bg-accent-pale text-accent text-[11px] font-bold uppercase"
            aria-hidden
          >
            ZIP
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-ink truncate">
              {scorm.name}
            </div>
            <div className="text-[11px] text-ink-3">
              {formatBytes(scorm.size)} · SCORM package
            </div>
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-[11.5px] font-semibold text-accent hover:text-accent-strong"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={onClear}
            aria-label="Remove SCORM package"
            className="text-ink-3 hover:text-bad text-[14px]"
          >
            ×
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  return (
    <>
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
          const f = e.dataTransfer.files?.[0];
          if (f) onPick(f);
        }}
        className={cn(
          "w-full border-2 border-dashed rounded-[10px] py-10 px-4 text-center transition-colors",
          over
            ? "border-accent bg-accent-pale/30"
            : "border-border bg-surface hover:border-accent-pale",
        )}
      >
        <UploadCloudIcon />
        <div className="mt-2 text-[13px] text-ink-2">
          Click here to Upload
        </div>
        <div className="text-[13px] font-semibold text-accent mt-1">
          SCORM (.zip)
        </div>
        <div className="text-[11.5px] text-ink-3 mt-1">1024 MB Max.</div>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </>
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

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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

// ─────────────── Fake rich editor (same shape as Roleplay/Video/Doc) ───────────────

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
