// Video per-module editor — matches the design's three-card layout.
//
// Rendered from ModuleEditPage when `m.type === "video"`. Replaces the
// legacy URL/duration/script inputs with the new structure:
//
//   Header  — Edit Training title, Back to Modules
//   Module Name + Module Status (Unpublish/Publish)
//   Module Description (rich text editor — toolbar is visual-only)
//   Language picker (multi-select tag input)
//   ENGLISH tab strip (one tab per selected language)
//   Three method cards:
//     · Upload Video File           (functional — file picker / URL paste)
//     · Step 1: Generate AI Presentation  (stub — coming soon)
//     · Generate Roleplay Video     (stub — coming soon)
//
// Header + body persist together through saveVideoModule.

"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteModule,
  saveVideoModule,
} from "@/app/admin/trainings/actions";
import {
  refreshRenderStatus,
  renderAvatarVideo,
} from "@/app/admin/trainings/render-actions";
import { uploadAttachment } from "@/app/admin/trainings/upload-actions";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import {
  deepEqualJson,
  useUnsavedChangesGuard,
} from "@/hooks/useUnsavedChangesGuard";
import { cn } from "@/lib/cn";

type VideoSource = "upload" | "ai_presentation" | "roleplay_video";

type RenderJob = {
  provider: string;
  providerId?: string;
  jobId: string;
  status: "queued" | "rendering" | "ready" | "failed";
  startedAt?: string;
  error?: string;
};

type Slide = { title: string; body: string; narration: string };

type VideoBody = {
  description?: string;
  languages?: string[];
  source?: VideoSource | null;
  videoUrl?: string | null;
  duration_min?: number | null;
  videoScript?: string | null;
  renderJob?: RenderJob | null;
  slides?: Slide[] | null;
};

const LANGUAGES = [
  "English",
  "Hindi",
  "Tamil",
  "Telugu",
  "Kannada",
  "Malayalam",
  "Bengali",
  "Marathi",
  "Gujarati",
  "Punjabi",
  "Urdu",
];

export function VideoModuleEditor({
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
    const b = (body ?? {}) as VideoBody;
    return {
      description: b.description ?? "",
      languages: b.languages && b.languages.length > 0 ? b.languages : ["English"],
      source: b.source ?? null,
      videoUrl: b.videoUrl ?? "",
      duration: b.duration_min != null ? String(b.duration_min) : "",
      videoScript: b.videoScript ?? "",
      renderJob: b.renderJob ?? null,
      slides: b.slides ?? null,
    };
  }, [body]);

  const [name, setName] = useState(initialName);
  const [published, setPublished] = useState(initialPublished);
  const [description, setDescription] = useState(initial.description);
  const [languages, setLanguages] = useState<string[]>(initial.languages);
  const [activeLang, setActiveLang] = useState<string>(initial.languages[0]);
  const [source, setSource] = useState<VideoSource | null>(initial.source);
  const [videoUrl, setVideoUrl] = useState(initial.videoUrl);
  const [duration, setDuration] = useState(initial.duration);
  const [videoScript, setVideoScript] = useState(initial.videoScript);
  const [slides, setSlides] = useState<Slide[] | null>(initial.slides);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const dirty = !deepEqualJson(
    { name, published, description, languages, source, videoUrl, duration, videoScript, slides },
    {
      name: initialName,
      published: initialPublished,
      description: initial.description,
      languages: initial.languages,
      source: initial.source,
      videoUrl: initial.videoUrl,
      duration: initial.duration,
      videoScript: initial.videoScript,
      slides: initial.slides,
    },
  );
  useUnsavedChangesGuard(dirty);

  function save(thenBack: boolean) {
    setError(null);
    const trimmedUrl = videoUrl.trim();
    if (trimmedUrl.length > 0) {
      try {
        new URL(trimmedUrl);
      } catch {
        setError("Video URL must be a full URL (e.g. https://…).");
        return;
      }
    }
    const dur = duration.trim() === "" ? null : Number(duration);
    startTransition(async () => {
      try {
        await saveVideoModule(trainingId, moduleId, {
          name,
          published,
          description,
          languages,
          source,
          videoUrl: trimmedUrl || null,
          duration_min: dur != null && Number.isFinite(dur) ? Math.round(dur) : null,
          videoScript: videoScript.trim() || null,
          slides,
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

  function toggleLanguage(lang: string) {
    if (languages.includes(lang)) {
      if (languages.length === 1) return;
      const next = languages.filter((l) => l !== lang);
      setLanguages(next);
      if (activeLang === lang) setActiveLang(next[0]);
    } else {
      setLanguages([...languages, lang]);
    }
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
        <div className="text-[12.5px] font-semibold text-ink">
          Module Description
        </div>
        <FakeRichEditor
          value={description}
          onChange={setDescription}
          minHeight={140}
        />
      </div>

      {/* Language picker */}
      <div className="bg-surface border border-border rounded-[10px] p-4 space-y-2">
        <div className="text-[12.5px] font-semibold text-ink">Language</div>
        <LanguagePicker
          selected={languages}
          onToggle={toggleLanguage}
        />
      </div>

      {/* Language tabs */}
      <div className="border-b border-border">
        <div className="flex items-center gap-1">
          {languages.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setActiveLang(lang)}
              className={cn(
                "px-3 py-2 text-[12px] font-bold uppercase tracking-[0.08em] transition-colors",
                activeLang === lang
                  ? "text-accent border-b-2 border-accent -mb-px"
                  : "text-ink-3 hover:text-ink",
              )}
            >
              {lang}
            </button>
          ))}
        </div>
      </div>

      {/* Three method cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <MethodCard
          tone="upload"
          active={source === "upload"}
          onClick={() => setSource("upload")}
          icon={<UploadCloudIcon />}
          title="Upload Video File"
          body={
            <>
              Manually upload an MP4 or MOV file from your computer.
              <br />
              <span className="text-ink-3">1024 MB Max</span>
            </>
          }
        />
        <MethodCard
          tone="ai"
          active={source === "ai_presentation"}
          onClick={() => setSource("ai_presentation")}
          icon={<Icon name="ai-sparkle" size={18} />}
          title="Step 1: Generate AI Presentation"
          body={
            <>Convert text prompts or documents into narrated slides automatically.</>
          }
        />
        <MethodCard
          tone="ai"
          active={source === "roleplay_video"}
          onClick={() => setSource("roleplay_video")}
          icon={<Icon name="ai-sparkle" size={18} />}
          title="Generate Roleplay Video"
          body={
            <>Simulate conversations between two avatars for soft-skills training.</>
          }
        />
      </div>

      {/* Per-method panel */}
      {source === "upload" ? (
        <UploadPanel
          trainingId={trainingId}
          moduleId={moduleId}
          url={videoUrl}
          setUrl={setVideoUrl}
          duration={duration}
          setDuration={setDuration}
          script={videoScript}
          setScript={setVideoScript}
        />
      ) : source === "ai_presentation" ? (
        <AIPresentationPanel
          trainingId={trainingId}
          moduleId={moduleId}
          slides={slides}
          setSlides={setSlides}
          setVideoScript={setVideoScript}
          setName={setName}
        />
      ) : source === "roleplay_video" ? (
        <RoleplayVideoPanel
          moduleId={moduleId}
          script={videoScript}
          setScript={setVideoScript}
          initialRenderJob={initial.renderJob}
          renderedVideoUrl={videoUrl}
        />
      ) : null}

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

// ─────────────── Method card ───────────────

function MethodCard({
  tone,
  active,
  onClick,
  icon,
  title,
  body,
}: {
  tone: "upload" | "ai";
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
}) {
  const palette = tone === "upload"
    ? {
        bg: "#fdf3e3",
        border: "#f3d6a3",
        glyph: "#b87d2a",
      }
    : {
        bg: "#f1e8ff",
        border: "#c9b8f0",
        glyph: "#6d4ad9",
      };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[12px] p-5 text-center transition-all border-2",
        active ? "shadow-md scale-[1.01]" : "hover:scale-[1.01]",
      )}
      style={{
        background: palette.bg,
        borderColor: active ? palette.glyph : palette.border,
      }}
    >
      <div
        className="grid place-items-center mb-2"
        style={{ color: palette.glyph }}
        aria-hidden
      >
        {icon}
      </div>
      <div
        className="text-[14px] font-semibold leading-tight mb-1.5"
        style={{ color: palette.glyph }}
      >
        {title}
      </div>
      <div className="text-[11.5px] text-ink-2 leading-[1.5]">{body}</div>
    </button>
  );
}

function UploadCloudIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 17a4 4 0 0 1 1.5-7.8A6 6 0 0 1 17 9a4 4 0 0 1 2 7.7" />
      <path d="M12 11v8M8 15l4-4 4 4" />
    </svg>
  );
}

// ─────────────── Upload / paste panel ───────────────

function UploadPanel({
  trainingId,
  moduleId,
  url,
  setUrl,
  duration,
  setDuration,
  script,
  setScript,
}: {
  trainingId: string;
  moduleId: string;
  url: string;
  setUrl: (v: string) => void;
  duration: string;
  setDuration: (v: string) => void;
  script: string;
  setScript: (v: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  async function onFile(file: File) {
    if (file.size > 1024 * 1024 * 1024) {
      toast.error("File too large", "Max file size: 1024 MB.");
      return;
    }
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "videos");
      fd.append("trainingId", trainingId);
      fd.append("moduleId", moduleId);
      const { url: uploaded } = await uploadAttachment(fd);
      setUrl(uploaded);
      toast.success("Video uploaded");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      toast.error("Upload failed", msg);
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="bg-surface border border-border rounded-[12px] p-5 space-y-3">
      <div className="grid gap-2">
        <span className="text-[12.5px] font-semibold text-ink">
          Video file
        </span>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="border-2 border-dashed border-border rounded-md py-6 text-center text-ink-3 hover:text-ink hover:border-accent-pale disabled:opacity-60"
        >
          <div className="text-[13px] font-semibold text-accent">
            {uploading ? "Uploading…" : "Click to upload MP4 / MOV"}
          </div>
          <div className="text-[11px]">1024 MB Max</div>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/quicktime"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
        <label className="block space-y-1">
          <span className="text-[12.5px] font-semibold text-ink">
            …or paste a video URL
          </span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/video.mp4"
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[12.5px] font-mono focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[12.5px] font-semibold text-ink">
            Duration (min)
          </span>
          <input
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="3"
            inputMode="numeric"
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[12.5px] focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-[12.5px] font-semibold text-ink">
          Optional narration script
        </span>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={4}
          placeholder="Spoken narration the avatar render or voiceover will read."
          className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[12.5px] focus:outline-none focus:border-accent resize-y leading-relaxed"
          suppressHydrationWarning
        />
      </label>
    </div>
  );
}

// ─────────────── AI Presentation panel ───────────────
//
// Generates a slide deck from a brief and stores it on body.slides.
// The combined narration is also written into body.videoScript so
// the existing avatar render pipeline can speak the whole deck via
// the Roleplay Video card if the admin wants a single narrated video.

function AIPresentationPanel({
  trainingId,
  moduleId,
  slides,
  setSlides,
  setVideoScript,
  setName,
}: {
  trainingId: string;
  moduleId: string;
  slides: Slide[] | null;
  setSlides: (s: Slide[] | null) => void;
  setVideoScript: (v: string) => void;
  setName: (v: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    if (prompt.trim().length < 20) {
      setError("Add a brief with at least 20 characters before generating.");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/generate-ai-presentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainingId, moduleId, prompt }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `generate failed: ${res.status}`);
      }
      const draft = (await res.json()) as {
        name: string;
        slides: Slide[];
        combinedNarration: string;
      };
      setName(draft.name);
      setSlides(draft.slides);
      setVideoScript(draft.combinedNarration);
      toast.success(
        `Drafted ${draft.slides.length} slides`,
        "Review below, then click Save. The narration is wired into the avatar script.",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generate failed";
      setError(msg);
      toast.error("Generate failed", msg);
    } finally {
      setGenerating(false);
    }
  }

  function updateSlide(i: number, patch: Partial<Slide>) {
    if (!slides) return;
    setSlides(slides.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function removeSlide(i: number) {
    if (!slides) return;
    const next = slides.filter((_, idx) => idx !== i);
    setSlides(next.length > 0 ? next : null);
  }
  function moveSlide(i: number, delta: number) {
    if (!slides) return;
    const j = i + delta;
    if (j < 0 || j >= slides.length) return;
    const next = [...slides];
    [next[i], next[j]] = [next[j], next[i]];
    setSlides(next);
  }
  function clearAll() {
    if (!slides || slides.length === 0) return;
    if (!window.confirm("Clear the drafted deck?")) return;
    setSlides(null);
  }

  return (
    <div className="bg-surface border border-border rounded-[12px] p-5 space-y-4">
      <div>
        <div className="text-[14px] font-semibold text-ink">
          Generate AI Presentation
        </div>
        <p className="text-[12px] text-ink-3 leading-relaxed mt-1">
          Describe what you want the deck to cover — the AI will draft 4–8
          narrated slides. You can edit each slide below, then click Save.
          The combined narration is also wired into the avatar script for
          the Generate Roleplay Video card if you want a single rendered
          video.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-[12.5px] font-semibold text-ink">
          Presentation brief
        </span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="Ex: Walk the learner through the four-stage consultative-selling framework, with one slide per stage and a closing wrap-up."
          className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent resize-y leading-relaxed"
          suppressHydrationWarning
        />
      </label>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          suppressHydrationWarning
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-strong disabled:opacity-60"
        >
          <Icon name="ai-sparkle" size={11} />
          {generating
            ? "Generating…"
            : slides && slides.length > 0
              ? "Re-generate deck"
              : "Generate deck"}
        </button>
        {slides && slides.length > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className="text-[12px] font-semibold text-ink-3 hover:text-bad"
          >
            Clear deck
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="text-[11.5px] text-bad font-mono">{error}</p>
      ) : null}

      {slides && slides.length > 0 ? (
        <div className="space-y-3">
          <div className="text-[13px] font-semibold text-ink">
            Drafted slides ({slides.length})
          </div>
          <ol className="space-y-3">
            {slides.map((s, i) => (
              <li
                key={i}
                className="bg-surface-2/60 border border-border rounded-md p-3 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 inline-grid place-items-center w-6 h-6 rounded-full bg-accent text-white text-[11px] font-bold shrink-0">
                    {i + 1}
                  </span>
                  <input
                    value={s.title}
                    onChange={(e) => updateSlide(i, { title: e.target.value })}
                    placeholder="Slide title"
                    className="flex-1 bg-surface border border-border rounded-md px-2.5 py-1.5 text-[13px] font-semibold focus:outline-none focus:border-accent"
                    suppressHydrationWarning
                  />
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveSlide(i, -1)}
                      disabled={i === 0}
                      aria-label="Move up"
                      className="w-6 h-6 grid place-items-center text-ink-3 hover:text-ink disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSlide(i, 1)}
                      disabled={i === slides.length - 1}
                      aria-label="Move down"
                      className="w-6 h-6 grid place-items-center text-ink-3 hover:text-ink disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSlide(i)}
                    aria-label="Remove slide"
                    className="w-7 h-7 grid place-items-center text-ink-3 hover:text-bad shrink-0"
                  >
                    ×
                  </button>
                </div>
                <div className="grid gap-2 pl-8 md:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-ink-3">
                      Slide bullets
                    </span>
                    <textarea
                      value={s.body}
                      onChange={(e) => updateSlide(i, { body: e.target.value })}
                      rows={3}
                      placeholder="- Bullet 1&#10;- Bullet 2"
                      className="w-full bg-surface border border-border rounded-md px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-accent resize-y font-mono leading-relaxed"
                      suppressHydrationWarning
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-ink-3">
                      Narration (avatar speaks)
                    </span>
                    <textarea
                      value={s.narration}
                      onChange={(e) =>
                        updateSlide(i, { narration: e.target.value })
                      }
                      rows={3}
                      placeholder="What the avatar says while this slide is on screen."
                      className="w-full bg-surface border border-border rounded-md px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-accent resize-y leading-relaxed"
                      suppressHydrationWarning
                    />
                  </label>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-[11.5px] text-ink-3">
            Tip: Switch to the Generate Roleplay Video card after saving to
            render this deck as a narrated avatar video. The combined
            narration is already in the avatar script.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────── Generate Roleplay Video panel ───────────────
//
// Wraps the existing renderAvatarVideo + refreshRenderStatus pipeline
// (HeyGen / Synthesia / D-ID / ElevenLabs via /lib/video/providers).
// State machine driven by body.renderJob:
//   - no job   → "Start render" button
//   - queued   → polling, refresh status
//   - rendering→ same
//   - ready    → cleared by the action; videoUrl populated
//   - failed   → show error + Retry

function RoleplayVideoPanel({
  moduleId,
  script,
  setScript,
  initialRenderJob,
  renderedVideoUrl,
}: {
  moduleId: string;
  script: string;
  setScript: (v: string) => void;
  initialRenderJob: RenderJob | null;
  renderedVideoUrl: string;
}) {
  const [job, setJob] = useState<RenderJob | null>(initialRenderJob);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function startRender() {
    setError(null);
    if (script.trim().length < 20) {
      setError(
        "Add a script with at least 20 characters before starting the render.",
      );
      return;
    }
    setPending(true);
    try {
      const { jobId, provider } = await renderAvatarVideo({ moduleId });
      setJob({
        provider,
        jobId,
        status: "queued",
        startedAt: new Date().toISOString(),
      });
      toast.success("Render started", `${provider} job ${jobId.slice(0, 8)}…`);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Render failed to start";
      setError(msg);
      toast.error("Render failed to start", msg);
    } finally {
      setPending(false);
    }
  }

  async function refresh() {
    setError(null);
    setPending(true);
    try {
      const res = await refreshRenderStatus(moduleId);
      if (res.status === "ready" && res.videoUrl) {
        setJob(null);
        toast.success("Render complete");
        router.refresh();
      } else {
        setJob((j) =>
          j ? { ...j, status: res.status as RenderJob["status"] } : j,
        );
        toast.info("Status refreshed", `Current status: ${res.status}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Status refresh failed";
      setError(msg);
      toast.error("Refresh failed", msg);
    } finally {
      setPending(false);
    }
  }

  const elapsed = job?.startedAt
    ? formatElapsed(new Date(job.startedAt))
    : null;

  return (
    <div className="bg-surface border border-border rounded-[12px] p-5 space-y-4">
      <div>
        <div className="text-[14px] font-semibold text-ink">
          Generate Roleplay Video
        </div>
        <p className="text-[12px] text-ink-3 leading-relaxed mt-1">
          The avatar will speak the script using your tenant&apos;s default
          video provider (HeyGen / Synthesia / D-ID / ElevenLabs). Set the
          default at{" "}
          <a
            href="/admin/video-providers"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:text-accent-strong underline"
          >
            /admin/video-providers
          </a>{" "}
          if you haven&apos;t already.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-[12.5px] font-semibold text-ink">
          Avatar script
        </span>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={6}
          placeholder="Hi, I'm your sales coach. Today we'll walk through three discovery questions you should always ask…"
          className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent resize-y leading-relaxed"
          suppressHydrationWarning
        />
        <span className="text-[11px] text-ink-3">
          {script.length} characters
          {script.length < 20 ? " — need at least 20" : ""}
        </span>
      </label>

      {job ? (
        <div className="bg-surface-2/60 border border-border rounded-md p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-grid place-items-center w-5 h-5 rounded-full text-[10px] font-bold",
                  job.status === "ready" && "bg-good-pale text-good",
                  job.status === "failed" && "bg-bad-pale text-bad",
                  (job.status === "queued" || job.status === "rendering") &&
                    "bg-accent-pale text-accent",
                )}
                aria-hidden
              >
                {job.status === "ready"
                  ? "✓"
                  : job.status === "failed"
                    ? "!"
                    : "…"}
              </span>
              <span className="text-[12.5px] font-semibold text-ink">
                {jobStatusLabel(job.status)}
              </span>
              <span className="text-[11px] text-ink-3 font-mono">
                {job.provider} · job {job.jobId.slice(0, 10)}…
              </span>
            </div>
            <div className="flex items-center gap-2">
              {elapsed ? (
                <span className="text-[11px] text-ink-3 font-mono">
                  {elapsed} elapsed
                </span>
              ) : null}
              <button
                type="button"
                onClick={refresh}
                disabled={pending}
                suppressHydrationWarning
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border bg-surface text-[11.5px] font-semibold text-ink-2 hover:text-ink disabled:opacity-50"
              >
                <Icon name="history" size={11} />
                Refresh status
              </button>
            </div>
          </div>
          {job.status === "failed" && job.error ? (
            <p className="text-[11.5px] text-bad font-mono leading-relaxed">
              {job.error}
            </p>
          ) : null}
        </div>
      ) : renderedVideoUrl ? (
        <div className="bg-good-pale/40 border border-[#c8e8d6] rounded-md p-3 flex items-center gap-2">
          <span className="inline-grid place-items-center w-5 h-5 rounded-full bg-good text-white text-[10px] font-bold">
            ✓
          </span>
          <span className="text-[12.5px] text-ink">
            Render is complete — preview at the top of the page.
          </span>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={startRender}
          disabled={pending || (job?.status === "queued" || job?.status === "rendering")}
          suppressHydrationWarning
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-strong disabled:opacity-60"
        >
          <Icon name="ai-sparkle" size={11} />
          {pending
            ? "Working…"
            : job?.status === "queued" || job?.status === "rendering"
              ? "Render in progress"
              : job?.status === "failed"
                ? "Retry render"
                : renderedVideoUrl
                  ? "Re-render"
                  : "Start render"}
        </button>
      </div>

      {error ? (
        <p className="text-[11.5px] text-bad font-mono">{error}</p>
      ) : null}
    </div>
  );
}

function jobStatusLabel(s: RenderJob["status"]): string {
  switch (s) {
    case "queued":
      return "Queued";
    case "rendering":
      return "Rendering";
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
  }
}

function formatElapsed(startedAt: Date): string {
  const sec = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
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

// ─────────────── Fake rich editor (same shape as Roleplay) ───────────────

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

// ─────────────── Language picker (same shape as PersonaModal) ───────────────

function LanguagePicker({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (lang: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <div
        className="min-h-[40px] bg-surface border border-border-strong rounded-md px-2 py-1.5 flex items-center gap-1.5 flex-wrap cursor-text"
        onClick={() => setOpen(true)}
      >
        {selected.length === 0 ? (
          <span className="text-[12.5px] text-ink-3 px-1">
            Select languages…
          </span>
        ) : null}
        {selected.map((l) => (
          <span
            key={l}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-2 border border-border text-[11.5px] text-ink"
          >
            {l}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(l);
              }}
              aria-label={`Remove ${l}`}
              className="text-ink-3 hover:text-bad"
            >
              ×
            </button>
          </span>
        ))}
        <div className="ml-auto flex items-center gap-1 text-ink-3">
          <span className="text-[14px] leading-none">×</span>
          <span className="h-4 w-px bg-border" />
          <Icon name="chevron-down" size={12} />
        </div>
      </div>
      {open ? (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute z-20 left-0 right-0 mt-1 max-h-[220px] overflow-y-auto bg-surface border border-border rounded-md shadow-lg py-1">
            {LANGUAGES.map((lang) => {
              const checked = selected.includes(lang);
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => onToggle(lang)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-surface-2",
                    checked ? "text-accent font-semibold" : "text-ink",
                  )}
                >
                  <span
                    className={cn(
                      "w-3.5 h-3.5 rounded border grid place-items-center text-[9px] text-white",
                      checked
                        ? "bg-accent border-accent"
                        : "border-border bg-surface",
                    )}
                  >
                    {checked ? "✓" : ""}
                  </span>
                  {lang}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
