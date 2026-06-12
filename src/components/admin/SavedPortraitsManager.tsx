// Tenant-scoped library of saved D-ID portraits. Each row stores a
// friendly label + s3:// URL + optional default Microsoft voice. The
// D-ID provider's Avatar ID input opens a picker that reads from this
// list, so admins don't have to keep raw s3:// URLs in a notepad.

"use client";

import { useRef, useState, useTransition } from "react";
import {
  createDidPortrait,
  deleteDidPortrait,
  updateDidPortrait,
  uploadDidPortraitFromFile,
} from "@/app/admin/video-providers/actions";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { DidVoicePicker } from "@/components/admin/DidVoicePicker";

export type PortraitRow = {
  id: string;
  label: string;
  sourceUrl: string;
  displayUrl: string | null;
  voiceId: string | null;
  voiceName: string | null;
  createdAt: string;
};

export function SavedPortraitsManager({
  portraits,
}: {
  portraits: PortraitRow[];
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
          Saved D-ID portraits ({portraits.length})
        </div>
        <p className="text-[11.5px] text-ink-3">
          Library of portraits you&apos;ve uploaded to D-ID. Pick one from the
          provider&apos;s Avatar ID input instead of pasting the long URL each
          time.
        </p>
      </div>

      {portraits.length === 0 ? (
        <div className="bg-surface border border-border rounded-[12px] p-6 text-center">
          <div className="w-10 h-10 rounded-[10px] bg-surface-2 text-ink-3 grid place-items-center mx-auto">
            <Icon name="image" size={18} />
          </div>
          <h3 className="font-display text-[16px] mt-3 text-ink">
            No saved portraits yet
          </h3>
          <p className="text-[12px] text-ink-2 mt-1 max-w-[420px] mx-auto leading-[1.55]">
            Upload one via{" "}
            <span className="font-mono text-[11.5px]">
              POST https://api.d-id.com/images
            </span>
            , then paste the returned URL and a friendly label below.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {portraits.map((p) => (
            <PortraitCard key={p.id} portrait={p} />
          ))}
        </ul>
      )}

      <AddPortraitCard />
    </section>
  );
}

function PortraitCard({ portrait }: { portrait: PortraitRow }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(portrait.label);
  const [sourceUrl, setSourceUrl] = useState(portrait.sourceUrl);
  const [voiceId, setVoiceId] = useState(portrait.voiceId ?? "");
  const [voiceName, setVoiceName] = useState(portrait.voiceName ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await updateDidPortrait({
          id: portrait.id,
          label: label.trim(),
          sourceUrl: sourceUrl.trim(),
          voiceId: voiceId.trim() || null,
          voiceName: voiceName.trim() || null,
        });
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function remove() {
    if (!window.confirm(`Remove "${portrait.label}"?`)) return;
    startTransition(() => void deleteDidPortrait(portrait.id));
  }

  if (!editing) {
    return (
      <li className="bg-surface border border-border rounded-[10px] px-4 py-3 flex items-start gap-3">
        {portrait.displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={portrait.displayUrl}
            alt={portrait.label}
            loading="lazy"
            className="w-10 h-10 rounded-md object-cover bg-surface-2 shrink-0"
          />
        ) : (
          <div className="w-10 h-10 grid place-items-center rounded-md bg-surface-2 text-ink-2 shrink-0">
            <Icon name="image" size={14} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-ink truncate">
            {portrait.label}
          </div>
          <div className="text-[10.5px] text-ink-3 font-mono break-all mt-0.5">
            {portrait.sourceUrl}
          </div>
          {portrait.voiceName || portrait.voiceId ? (
            <div className="text-[11px] text-ink-2 mt-1">
              Voice: {portrait.voiceName ?? portrait.voiceId}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setEditing(true)}
            suppressHydrationWarning
            className="text-[11.5px] font-semibold text-accent hover:text-accent-strong px-2 py-1"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            suppressHydrationWarning
            className="text-[11.5px] text-ink-3 hover:text-bad px-2 py-1 rounded-md hover:bg-bad-pale"
          >
            Remove
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="bg-surface border border-accent/40 rounded-[10px] p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Label">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </Field>
        <Field label="Source URL (https:// or s3://d-id-images-prod/…)">
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] font-mono focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </Field>
        <Field label="Voice (optional)">
          <DidVoicePicker
            value={voiceId}
            onChange={(next) => {
              setVoiceId(next.id);
              setVoiceName(next.name);
            }}
          />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-3 flex-wrap">
        {error ? (
          <span className="text-[12px] text-bad font-mono break-words max-w-[480px]">
            {error}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
          suppressHydrationWarning
          className="text-[12px] font-semibold text-ink-2 hover:text-ink px-3 py-1.5"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending || !label.trim() || !sourceUrl.trim()}
          suppressHydrationWarning
          className="text-[12px] font-semibold px-3 py-1.5 rounded-md bg-ink text-white hover:bg-[#2a2a2a] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </li>
  );
}

function AddPortraitCard() {
  const [label, setLabel] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [voiceName, setVoiceName] = useState("");
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setLabel("");
    setVoiceId("");
    setVoiceName("");
    setFile(null);
    setSourceUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        if (mode === "upload") {
          if (!file) {
            setError("Pick an image file first.");
            return;
          }
          const fd = new FormData();
          fd.set("file", file);
          fd.set("label", label.trim());
          fd.set("voiceId", voiceId.trim());
          fd.set("voiceName", voiceName.trim());
          await uploadDidPortraitFromFile(fd);
        } else {
          await createDidPortrait({
            label: label.trim(),
            sourceUrl: sourceUrl.trim(),
            voiceId: voiceId.trim() || null,
            voiceName: voiceName.trim() || null,
          });
        }
        reset();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  const canSubmit =
    Boolean(label.trim()) &&
    (mode === "upload" ? Boolean(file) : Boolean(sourceUrl.trim()));

  return (
    <section className="bg-surface border border-border rounded-[12px] p-5 space-y-4">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
          Add portrait to library
        </div>
        <p className="text-[12px] text-ink-2 mt-1">
          Upload a portrait — we send it to D-ID&apos;s{" "}
          <span className="font-mono text-[11.5px]">/images</span> and save
          the returned URL with your friendly label. Pick a voice now so
          every roleplay using this portrait gets a sensible default.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode("upload")}
          suppressHydrationWarning
          className={cn(
            "px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors",
            mode === "upload"
              ? "bg-ink text-white"
              : "bg-surface-2 border border-border text-ink-2 hover:text-ink",
          )}
        >
          Upload image
        </button>
        <button
          type="button"
          onClick={() => setMode("paste")}
          suppressHydrationWarning
          className={cn(
            "px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors",
            mode === "paste"
              ? "bg-ink text-white"
              : "bg-surface-2 border border-border text-ink-2 hover:text-ink",
          )}
        >
          Paste existing URL
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Label">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Indian Female · Business"
            className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </Field>

        {mode === "upload" ? (
          <Field label="Portrait image (JPG/PNG, ≤10 MB)">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              suppressHydrationWarning
              className="block w-full text-[12px] text-ink-2 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-[12px] file:font-semibold file:bg-ink file:text-white hover:file:bg-[#2a2a2a]"
            />
            {file ? (
              <div className="text-[11px] text-ink-3 mt-1 truncate">
                {file.name} · {Math.round(file.size / 1024)} KB
              </div>
            ) : null}
          </Field>
        ) : (
          <Field label="Source URL">
            <input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="s3://d-id-images-prod/… or https://…"
              className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] font-mono focus:outline-none focus:border-accent"
              suppressHydrationWarning
            />
          </Field>
        )}

        <Field label="Voice (optional)">
          <DidVoicePicker
            value={voiceId}
            onChange={(next) => {
              setVoiceId(next.id);
              setVoiceName(next.name);
            }}
          />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !canSubmit}
          suppressHydrationWarning
          className={cn(
            "inline-flex items-center gap-1.5 px-4 py-2 rounded-md",
            "bg-accent text-white text-[13px] font-semibold",
            "hover:bg-accent-strong disabled:opacity-60",
          )}
        >
          <Icon name="ai-sparkle" size={12} />
          {pending
            ? mode === "upload"
              ? "Uploading…"
              : "Adding…"
            : mode === "upload"
              ? "Upload + add to library"
              : "Add to library"}
        </button>
        {error ? (
          <span className="text-[12px] text-bad font-mono break-words max-w-[520px]">
            {error}
          </span>
        ) : null}
      </div>
    </section>
  );
}

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
