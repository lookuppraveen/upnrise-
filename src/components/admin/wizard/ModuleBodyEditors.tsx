// Module body editors. Used inside the per-module Edit modal in Step 2.
//
// Each editor owns its own dirty/save state and persists via
// updateModuleBody. The avatar-render block lives inside VideoBodyEditor
// because the script + render trigger are tightly coupled to the video
// module body — moving them out would split state across siblings.

"use client";

import { useState, useTransition } from "react";
import { updateModuleBody } from "@/app/admin/trainings/actions";
import {
  refreshRenderStatus,
  renderAvatarVideo,
} from "@/app/admin/trainings/render-actions";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export type QuizQuestion = { q: string; options: string[]; answer: number };

// ─────────────── Video body ───────────────

export function VideoBodyEditor({
  trainingId,
  moduleId,
  body,
  hasDefaultVideoProvider,
}: {
  trainingId: string;
  moduleId: string;
  body: Record<string, unknown> | null;
  hasDefaultVideoProvider: boolean;
}) {
  const initialUrl = typeof body?.videoUrl === "string" ? body.videoUrl : "";
  const initialDuration =
    typeof body?.duration_min === "number" ? body.duration_min : null;
  const initialScript =
    typeof body?.videoScript === "string" ? body.videoScript : "";
  const renderJob =
    body?.renderJob && typeof body.renderJob === "object"
      ? (body.renderJob as {
          status?: string;
          jobId?: string;
          provider?: string;
          error?: string;
          startedAt?: string;
        })
      : null;
  const [videoUrl, setVideoUrl] = useState(initialUrl);
  const [durationStr, setDurationStr] = useState(
    initialDuration != null ? String(initialDuration) : "",
  );
  const [videoScript, setVideoScript] = useState(initialScript);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  const dirty =
    videoUrl.trim() !== initialUrl ||
    (durationStr.trim() === "" ? null : Number(durationStr)) !==
      initialDuration ||
    videoScript !== initialScript;

  function save() {
    const trimmed = videoUrl.trim();
    const dur = durationStr.trim() === "" ? null : Number(durationStr);
    if (trimmed.length > 0) {
      try {
        new URL(trimmed);
      } catch {
        window.alert("Video URL must be a full URL (e.g. https://…).");
        return;
      }
    }
    startTransition(async () => {
      await updateModuleBody(trainingId, moduleId, {
        type: "video",
        body: {
          videoUrl: trimmed.length > 0 ? trimmed : null,
          duration_min: dur != null && Number.isFinite(dur) ? dur : null,
          videoScript: videoScript.trim().length > 0 ? videoScript : null,
        },
      });
      setSavedAt(Date.now());
    });
  }

  function render() {
    setRenderError(null);
    if (
      dirty &&
      !window.confirm("You have unsaved edits — render with the saved version?")
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await renderAvatarVideo({ moduleId });
      } catch (e) {
        setRenderError(e instanceof Error ? e.message : "Render failed");
      }
    });
  }

  function refresh() {
    setRenderError(null);
    startTransition(async () => {
      try {
        await refreshRenderStatus(moduleId);
      } catch (e) {
        setRenderError(e instanceof Error ? e.message : "Refresh failed");
      }
    });
  }

  const canRender =
    hasDefaultVideoProvider &&
    initialScript.trim().length >= 20 &&
    !renderJob;

  return (
    <div className="space-y-3">
      <SmallField label="Video URL">
        <input
          type="url"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://example.com/video.mp4 or YouTube embed URL"
          className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[12.5px] focus:outline-none focus:border-accent"
          suppressHydrationWarning
        />
      </SmallField>
      <SmallField label="Duration (minutes)">
        <input
          type="number"
          min={0}
          max={600}
          value={durationStr}
          onChange={(e) => setDurationStr(e.target.value)}
          placeholder="e.g. 7"
          className="w-32 bg-surface border border-border rounded-md px-3 py-2 text-[12.5px] focus:outline-none focus:border-accent"
          suppressHydrationWarning
        />
      </SmallField>
      <SmallField label="Avatar narration script">
        <textarea
          value={videoScript}
          onChange={(e) => setVideoScript(e.target.value)}
          rows={6}
          placeholder="The narration the avatar will speak. Generate-with-AI populates this for you, or paste your own."
          className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[12.5px] leading-[1.5] focus:outline-none focus:border-accent"
          suppressHydrationWarning
        />
      </SmallField>
      <BodySaveRow dirty={dirty} pending={pending} savedAt={savedAt} onSave={save} />

      <div
        className="rounded-[10px] border p-3 space-y-2"
        style={{
          background: "linear-gradient(135deg, #f3eafa, #fce8f0)",
          borderColor: "#e6d2f1",
        }}
      >
        <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#6d4ad9]">
          <Icon name="ai-sparkle" size={11} />
          Avatar render
        </div>
        {!hasDefaultVideoProvider ? (
          <p className="text-[12px] text-ink-2 leading-[1.5]">
            No default video provider yet. Add one at{" "}
            <a href="/admin/video-providers" className="underline font-semibold">
              /admin/video-providers
            </a>{" "}
            to enable avatar rendering.
          </p>
        ) : renderJob ? (
          <RenderStatusBlock
            status={renderJob.status ?? "queued"}
            provider={renderJob.provider}
            startedAt={renderJob.startedAt}
            error={renderJob.error}
            onRefresh={refresh}
            pending={pending}
          />
        ) : initialScript.trim().length < 20 ? (
          <p className="text-[12px] text-ink-2 leading-[1.5]">
            Add a narration script (saved) and the &quot;Render avatar
            video&quot; button will light up. Tip: Generate-with-AI fills this in
            for you.
          </p>
        ) : (
          <p className="text-[12px] text-ink-2 leading-[1.5]">
            Render an avatar speaking the saved script. The resulting MP4 URL
            lands in the Video URL field above automatically when the provider
            finishes — usually 1–3 min.
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={render}
            disabled={!canRender || pending}
            className={cn(
              "inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md",
              canRender && !pending
                ? "bg-ink text-white hover:bg-[#2a2a2a]"
                : "bg-surface-2 text-ink-3",
              "disabled:opacity-60",
            )}
          >
            <Icon name="ai-sparkle" size={11} />
            {pending ? "Working…" : "Render avatar video"}
          </button>
          {renderError ? (
            <span className="text-[11.5px] text-bad font-mono">
              {renderError}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RenderStatusBlock({
  status,
  provider,
  startedAt,
  error,
  onRefresh,
  pending,
}: {
  status: string;
  provider?: string;
  startedAt?: string;
  error?: string;
  onRefresh: () => void;
  pending: boolean;
}) {
  const isFailed = status === "failed";
  const isReady = status === "ready";
  const toneCls = isFailed
    ? "text-bad"
    : isReady
      ? "text-good"
      : "text-[#6d4ad9]";
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-[12px]">
        <span className={cn("font-semibold", toneCls)}>
          {status === "queued"
            ? "Queued"
            : status === "rendering"
              ? "Rendering…"
              : status === "ready"
                ? "Ready"
                : "Failed"}
        </span>
        {provider ? (
          <span className="text-ink-3 font-mono text-[11px]">· {provider}</span>
        ) : null}
        {startedAt ? (
          <span className="text-ink-3 font-mono text-[11px]">
            · started {new Date(startedAt).toLocaleTimeString()}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onRefresh}
          disabled={pending}
          className="ml-auto text-[11.5px] font-semibold text-ink-2 hover:text-ink underline disabled:opacity-50"
        >
          Refresh status
        </button>
      </div>
      {error ? (
        <p className="text-[11.5px] text-bad font-mono">{error}</p>
      ) : null}
    </div>
  );
}

// ─────────────── Document body ───────────────

export function DocumentBodyEditor({
  trainingId,
  moduleId,
  body,
}: {
  trainingId: string;
  moduleId: string;
  body: Record<string, unknown> | null;
}) {
  const initial =
    typeof body?.markdown === "string"
      ? body.markdown
      : typeof body?.text === "string"
        ? (body.text as string)
        : "";
  const [markdown, setMarkdown] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const dirty = markdown !== initial;

  function save() {
    startTransition(async () => {
      await updateModuleBody(trainingId, moduleId, {
        type: "document",
        body: { markdown },
      });
      setSavedAt(Date.now());
    });
  }

  return (
    <div className="space-y-2">
      <SmallField label="Document body (plain text or markdown)">
        <textarea
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          rows={10}
          placeholder="Write the lesson content trainees should read…"
          className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[12.5px] leading-[1.5] focus:outline-none focus:border-accent font-mono"
          suppressHydrationWarning
        />
      </SmallField>
      <BodySaveRow dirty={dirty} pending={pending} savedAt={savedAt} onSave={save} />
    </div>
  );
}

// ─────────────── Quiz body ───────────────

export function QuizBodyEditor({
  trainingId,
  moduleId,
  body,
}: {
  trainingId: string;
  moduleId: string;
  body: Record<string, unknown> | null;
}) {
  const initial = parseQuestions(body);
  const [questions, setQuestions] = useState<QuizQuestion[]>(initial);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const dirty = JSON.stringify(questions) !== JSON.stringify(initial);

  function update(idx: number, patch: Partial<QuizQuestion>) {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  function addQuestion() {
    setQuestions((qs) => [...qs, { q: "", options: ["", ""], answer: 0 }]);
  }

  function removeQuestion(idx: number) {
    setQuestions((qs) => qs.filter((_, i) => i !== idx));
  }

  function addOption(idx: number) {
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === idx ? { ...q, options: [...q.options, ""] } : q,
      ),
    );
  }

  function removeOption(idx: number, optIdx: number) {
    setQuestions((qs) =>
      qs.map((q, i) => {
        if (i !== idx) return q;
        if (q.options.length <= 2) return q;
        const next = q.options.filter((_, j) => j !== optIdx);
        const answer =
          q.answer === optIdx
            ? 0
            : q.answer > optIdx
              ? q.answer - 1
              : q.answer;
        return { ...q, options: next, answer };
      }),
    );
  }

  function save() {
    for (const [i, q] of questions.entries()) {
      if (!q.q.trim()) {
        window.alert(`Question ${i + 1} is missing text.`);
        return;
      }
      if (q.options.some((o) => !o.trim())) {
        window.alert(`Question ${i + 1} has an empty option.`);
        return;
      }
      if (q.answer < 0 || q.answer >= q.options.length) {
        window.alert(`Question ${i + 1} needs a correct answer selected.`);
        return;
      }
    }
    startTransition(async () => {
      await updateModuleBody(trainingId, moduleId, {
        type: "quiz",
        body: { questions },
      });
      setSavedAt(Date.now());
    });
  }

  return (
    <div className="space-y-3">
      {questions.length === 0 ? (
        <p className="text-[12px] text-ink-3">
          No questions yet. Add one to get started.
        </p>
      ) : (
        <ol className="space-y-3">
          {questions.map((q, i) => (
            <li
              key={i}
              className="bg-surface-2 border border-border rounded-md p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                  Question {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeQuestion(i)}
                  className="text-[11.5px] text-ink-3 hover:text-bad"
                >
                  Remove
                </button>
              </div>
              <textarea
                value={q.q}
                onChange={(e) => update(i, { q: e.target.value })}
                rows={2}
                placeholder="Question text"
                className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[12.5px] focus:outline-none focus:border-accent"
                suppressHydrationWarning
              />
              <div className="space-y-1.5">
                {q.options.map((opt, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={q.answer === j}
                      onChange={() => update(i, { answer: j })}
                      className="accent-good shrink-0"
                      aria-label={`Mark option ${j + 1} as correct`}
                    />
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) =>
                        update(i, {
                          options: q.options.map((o, k) =>
                            k === j ? e.target.value : o,
                          ),
                        })
                      }
                      placeholder={`Option ${j + 1}`}
                      className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-[12.5px] focus:outline-none focus:border-accent"
                      suppressHydrationWarning
                    />
                    {q.options.length > 2 ? (
                      <button
                        type="button"
                        onClick={() => removeOption(i, j)}
                        className="text-[11px] text-ink-3 hover:text-bad shrink-0"
                        aria-label="Remove option"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                ))}
                {q.options.length < 8 ? (
                  <button
                    type="button"
                    onClick={() => addOption(i)}
                    className="text-[11.5px] font-semibold text-accent hover:text-accent-strong"
                  >
                    + Add option
                  </button>
                ) : null}
              </div>
              <div className="text-[11px] text-ink-3">
                Mark the correct option with the radio on the left.
              </div>
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        onClick={addQuestion}
        className="text-[12px] font-semibold text-accent hover:text-accent-strong"
      >
        + Add question
      </button>
      <BodySaveRow dirty={dirty} pending={pending} savedAt={savedAt} onSave={save} />
    </div>
  );
}

function parseQuestions(body: Record<string, unknown> | null): QuizQuestion[] {
  const raw = body?.questions;
  if (!Array.isArray(raw)) return [];
  const out: QuizQuestion[] = [];
  for (const r of raw) {
    if (r == null || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const text = typeof rec.q === "string" ? rec.q : null;
    const opts = Array.isArray(rec.options)
      ? rec.options.filter((o): o is string => typeof o === "string")
      : [];
    const answer = typeof rec.answer === "number" ? rec.answer : 0;
    if (!text || opts.length < 2) continue;
    out.push({
      q: text,
      options: opts,
      answer: answer >= 0 && answer < opts.length ? answer : 0,
    });
  }
  return out;
}

// ─────────────── Atoms ───────────────

function BodySaveRow({
  dirty,
  pending,
  savedAt,
  onSave,
}: {
  dirty: boolean;
  pending: boolean;
  savedAt: number | null;
  onSave: () => void;
}) {
  const fresh = savedAt != null && Date.now() - savedAt < 5000;
  return (
    <div className="flex items-center justify-end gap-3">
      {fresh && !dirty ? (
        <span className="text-[11.5px] text-good">Saved</span>
      ) : null}
      <button
        type="button"
        onClick={onSave}
        disabled={!dirty || pending}
        className={cn(
          "text-[12px] font-semibold px-3 py-1.5 rounded-md",
          dirty
            ? "bg-accent text-white hover:bg-accent-strong"
            : "bg-surface-2 text-ink-3",
          "disabled:opacity-60",
        )}
      >
        {pending ? "Saving…" : "Save content"}
      </button>
    </div>
  );
}

export function SmallField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-0.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        {label}
      </span>
      {children}
    </label>
  );
}
