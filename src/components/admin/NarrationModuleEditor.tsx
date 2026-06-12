// Narration module editor.
//
// Persisted as ModuleType.document with body.kind="narration" (same
// convention as Coach/Scorm). The admin pastes a script + picks an
// ElevenLabs voice id, then hits "Generate audio" to call ElevenLabs
// TTS server-side. Output mp3 lands in Supabase and the URL is saved
// to body.audioUrl, which the learner audio player consumes.
//
// Voice id can be left blank — the server falls back to the voice id
// configured on the tenant's ElevenLabs VideoProvider row, and falls
// back further to the catalogue default if neither is set.

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  renderNarrationModule,
  saveNarrationModule,
} from "@/app/admin/trainings/narration-actions";
import {
  readNarrationBody,
  type NarrationBody,
} from "@/app/admin/trainings/narration-body";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

export function NarrationModuleEditor({
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
  const initial: NarrationBody = readNarrationBody(body);
  const [name, setName] = useState(initialName);
  const [published, setPublished] = useState(initialPublished);
  const [script, setScript] = useState(initial.script);
  const [voiceId, setVoiceId] = useState(initial.voiceId ?? "");
  const [audioUrl, setAudioUrl] = useState(initial.audioUrl);
  const [renderedAt, setRenderedAt] = useState<string | null>(initial.renderedAt);
  const [error, setError] = useState<string | null>(null);
  const [savePending, startSave] = useTransition();
  const [renderPending, startRender] = useTransition();

  // Dirty tracking — surface "Save changes" only when something differs
  // from the persisted state, so the admin isn't tempted to bump the
  // updatedAt timestamp on a no-op click.
  const [persisted, setPersisted] = useState({
    name: initialName,
    published: initialPublished,
    script: initial.script,
    voiceId: initial.voiceId ?? "",
  });
  const dirty =
    name !== persisted.name ||
    published !== persisted.published ||
    script !== persisted.script ||
    voiceId !== persisted.voiceId;

  function save() {
    setError(null);
    startSave(async () => {
      try {
        await saveNarrationModule({
          moduleId,
          name: name.trim() || "Narration",
          published,
          script,
          voiceId: voiceId.trim() || null,
        });
        setPersisted({
          name: name.trim() || "Narration",
          published,
          script,
          voiceId: voiceId.trim(),
        });
        toast.success("Saved");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Save failed";
        setError(msg);
        toast.error("Couldn't save", msg);
      }
    });
  }

  function render() {
    setError(null);
    const trimmed = script.trim();
    if (!trimmed) {
      setError("Add a script first.");
      return;
    }
    startRender(async () => {
      try {
        const { audioUrl: url } = await renderNarrationModule({
          moduleId,
          script: trimmed,
          voiceId: voiceId.trim() || null,
        });
        setAudioUrl(url);
        setRenderedAt(new Date().toISOString());
        setPersisted({
          name: name.trim() || "Narration",
          published,
          script,
          voiceId: voiceId.trim(),
        });
        toast.success("Audio ready");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Render failed";
        setError(msg);
        toast.error("Render failed", msg);
      }
    });
  }

  const busy = savePending || renderPending;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-[22px] text-accent">
        Edit Training -{" "}
        <span className="font-semibold">{trainingTitle}</span>
      </h1>

      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/admin/trainings/${trainingId}/edit?step=2`}
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink"
        >
          <Icon name="chevron-right" size={12} className="rotate-180" />
          Back to Modules
        </Link>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 text-[12.5px] text-ink-2 cursor-pointer">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="accent-accent"
            />
            Published
          </label>
          <button
            type="button"
            onClick={save}
            disabled={busy || !dirty}
            suppressHydrationWarning
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-accent text-accent text-[12.5px] font-semibold hover:bg-accent-pale/30 disabled:opacity-50"
          >
            {savePending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <div className="text-center">
        <h2 className="font-display text-[26px] leading-tight">
          <span className="text-accent">Narration</span> Module
        </h2>
        <p className="text-[12.5px] text-ink-3 mt-1">
          Paste a script. ElevenLabs renders an mp3 the learner plays back
          in their browser.
        </p>
      </div>

      <div className="bg-surface border border-border rounded-[12px] p-5 md:p-6 space-y-5">
        <Field label="Module name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </Field>

        <Field label="ElevenLabs voice ID (optional)">
          <input
            type="text"
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            placeholder="e.g. 21m00Tcm4TlvDq8ikWAM (Rachel)"
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] font-mono focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
          <p className="text-[11.5px] text-ink-3 mt-1">
            Blank falls back to the voice id on your ElevenLabs provider row,
            then the catalogue default.
          </p>
        </Field>

        <Field label="Script">
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={12}
            placeholder="Paste the narration the learner will hear. Punctuation matters — ElevenLabs uses it for pacing."
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent resize-y leading-relaxed"
            suppressHydrationWarning
          />
          <p className="text-[11.5px] text-ink-3 mt-1">
            {script.trim().length.toLocaleString()} characters · ~
            {estimateMinutes(script)} min audio
          </p>
        </Field>

        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <button
            type="button"
            onClick={render}
            disabled={busy || script.trim().length === 0}
            suppressHydrationWarning
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 rounded-md",
              "bg-accent text-white text-[12.5px] font-semibold",
              "hover:bg-accent-strong disabled:opacity-60",
            )}
          >
            <Icon name="ai-sparkle" size={11} />
            {renderPending ? "Rendering…" : audioUrl ? "Re-render audio" : "Generate audio"}
          </button>
          {audioUrl ? (
            <span className="text-[11.5px] text-good font-mono">
              ✓ Audio rendered{renderedAt ? ` ${formatStamp(renderedAt)}` : ""}
            </span>
          ) : (
            <span className="text-[11.5px] text-ink-3 font-mono">
              No audio rendered yet
            </span>
          )}
        </div>

        {audioUrl ? (
          <div className="border-t border-border pt-4">
            <div className="text-[12.5px] font-semibold text-ink mb-2">
              Preview
            </div>
            <audio
              controls
              src={audioUrl}
              className="w-full"
              preload="metadata"
            />
          </div>
        ) : null}

        {error ? (
          <p className="text-[11.5px] text-bad font-mono break-words">
            {error}
          </p>
        ) : null}
      </div>
    </div>
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
    <label className="block space-y-1.5">
      <span className="block text-[12.5px] font-semibold text-ink">{label}</span>
      {children}
    </label>
  );
}

function estimateMinutes(text: string): string {
  // ~150 wpm conversational pace. Round to nearest half-minute.
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return "0";
  const minutes = words / 150;
  return minutes < 0.5 ? "<0.5" : (Math.round(minutes * 2) / 2).toString();
}

function formatStamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
