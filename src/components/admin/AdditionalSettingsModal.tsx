// Additional Settings modal — opens from the Roleplay module editor's
// "Additional Settings" button.
//
// Captures the runtime knobs the AI roleplay needs at session start:
// modes, recording, attempt cap, duration window, hints, who starts/
// ends, plus the intro GIF and report tip GIF.
//
// Like PersonaModal, state stays local until Save — then we hand the
// final shape back to the parent via onSave(settings). The parent
// folds it into module.body.additionalSettings via saveRoleplayModule.

"use client";

import { useEffect, useRef, useState } from "react";
import { uploadAttachment } from "@/app/admin/trainings/upload-actions";
import { generateScenarioIntroImage } from "@/app/admin/trainings/actions";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

export type AdditionalSettings = {
  modes: {
    video: boolean;
    onlyAiVideo: boolean;
    onlyUserVideo: boolean;
    audio: boolean;
    userChoice: boolean;
  };
  recordAv: "yes" | "no";
  attempts: { kind: "unlimited" | "limited"; limit: number };
  followIdealConversation: boolean;
  minDurationMin: number;
  maxDurationMin: number;
  failBelowMinDuration: boolean;
  showExplanation: boolean;
  autoDisconnectOnLimit: boolean;
  disconnectOnInactivity: boolean;
  hints: { kind: "yes" | "no" | "limited"; limit: number };
  hintType: "complete" | "bullet";
  startRoleplayBy: "ai" | "user" | "either";
  endRoleplayBy: "ai" | "user" | "either";
  scenarioIntroGif: { name: string; dataUrl: string } | null;
  tipsOnReportGif: { name: string; dataUrl: string } | null;
};

export const DEFAULT_ADDITIONAL_SETTINGS: AdditionalSettings = {
  // Audio + static portrait is the default mode: rock-solid, instant
  // first-frame, no WebRTC failure modes. Admins who want lip-synced
  // live avatar can flip `video` / `onlyAiVideo` on per-module via
  // Additional Settings.
  modes: {
    video: false,
    onlyAiVideo: false,
    onlyUserVideo: false,
    audio: true,
    userChoice: false,
  },
  recordAv: "yes",
  attempts: { kind: "unlimited", limit: 1 },
  followIdealConversation: false,
  minDurationMin: 1,
  maxDurationMin: 10,
  failBelowMinDuration: false,
  showExplanation: false,
  autoDisconnectOnLimit: false,
  disconnectOnInactivity: false,
  hints: { kind: "yes", limit: 1 },
  hintType: "complete",
  startRoleplayBy: "ai",
  endRoleplayBy: "ai",
  scenarioIntroGif: null,
  tipsOnReportGif: null,
};

const MAX_GIF_BYTES = 20 * 1024 * 1024;

export function AdditionalSettingsModal({
  trainingId,
  moduleId,
  initial,
  seedPrompt,
  onClose,
  onSave,
}: {
  trainingId: string;
  moduleId: string;
  initial: AdditionalSettings;
  // Optional. Pre-fills the "Generate with AI" prompt for the Scenario
  // Intro tile. Parent typically passes the roleplay's scenario text so
  // the admin can hit Generate without retyping context.
  seedPrompt?: string;
  onClose: () => void;
  onSave: (s: AdditionalSettings) => void;
}) {
  const [s, setS] = useState<AdditionalSettings>(initial);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<
    "scenarioIntroGif" | "tipsOnReportGif" | null
  >(null);
  const [introMode, setIntroMode] = useState<"upload" | "ai">("upload");
  const [introPrompt, setIntroPrompt] = useState(seedPrompt?.trim() ?? "");
  const [introGenerating, setIntroGenerating] = useState(false);
  const [introError, setIntroError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggleMode(key: keyof AdditionalSettings["modes"]) {
    const next = { ...s.modes, [key]: !s.modes[key] };
    // Only AI Video and Only User Video are mutually exclusive — picking
    // one turns the other off so the saved shape can't be contradictory.
    if (key === "onlyAiVideo" && next.onlyAiVideo) next.onlyUserVideo = false;
    if (key === "onlyUserVideo" && next.onlyUserVideo) next.onlyAiVideo = false;
    setS({ ...s, modes: next });
    setError(null);
  }

  function resetDefaults() {
    setS(DEFAULT_ADDITIONAL_SETTINGS);
    setError(null);
  }

  const noModeSelected =
    !s.modes.video &&
    !s.modes.onlyAiVideo &&
    !s.modes.onlyUserVideo &&
    !s.modes.audio &&
    !s.modes.userChoice;

  async function generateIntroWithAi() {
    const trimmed = introPrompt.trim();
    if (trimmed.length < 5) {
      setIntroError("Describe the scene in at least a few words.");
      return;
    }
    setIntroError(null);
    setIntroGenerating(true);
    try {
      const { url, name } = await generateScenarioIntroImage(
        trainingId,
        trimmed,
      );
      setS((prev) => ({ ...prev, scenarioIntroGif: { name, dataUrl: url } }));
      toast.success("Scenario intro generated");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generate failed";
      setIntroError(msg);
      toast.error("Generate failed", msg);
    } finally {
      setIntroGenerating(false);
    }
  }

  async function uploadGif(
    file: File,
    field: "scenarioIntroGif" | "tipsOnReportGif",
  ) {
    if (file.type !== "image/gif") {
      setError("Only GIF files are allowed.");
      return;
    }
    if (file.size > MAX_GIF_BYTES) {
      setError("GIF must be under 20 MB.");
      return;
    }
    setError(null);
    try {
      setUploading(field);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "gifs");
      fd.append("trainingId", trainingId);
      fd.append("moduleId", moduleId);
      const { url } = await uploadAttachment(fd);
      setS({ ...s, [field]: { name: file.name, dataUrl: url } });
      toast.success("GIF uploaded");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setError(msg);
      toast.error("Upload failed", msg);
    } finally {
      setUploading(null);
    }
  }

  function save() {
    if (noModeSelected) {
      setError("Select at least one mode.");
      return;
    }
    if (s.minDurationMin > s.maxDurationMin) {
      setError("Minimum duration cannot exceed maximum.");
      return;
    }
    if (s.modes.onlyAiVideo && s.modes.onlyUserVideo) {
      setError("Pick either Only AI Video or Only User Video, not both.");
      return;
    }
    onSave(s);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Additional settings"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-bg border border-border rounded-[12px] w-full max-w-[980px] my-4 shadow-xl flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-[18px] font-semibold text-ink">
            Additional Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-3 hover:text-ink text-[20px] leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Select Mode */}
          <section className="space-y-2">
            <Heading>Select Mode</Heading>
            <div className="flex items-center gap-5 flex-wrap">
              <Check
                checked={s.modes.video}
                onChange={() => toggleMode("video")}
                label="Video"
              />
              <Check
                checked={s.modes.onlyAiVideo}
                onChange={() => toggleMode("onlyAiVideo")}
                label="Only AI Video"
                info="Mutually exclusive with Only User Video."
              />
              <Check
                checked={s.modes.onlyUserVideo}
                onChange={() => toggleMode("onlyUserVideo")}
                label="Only User Video"
                info="Mutually exclusive with Only AI Video."
              />
              <Check
                checked={s.modes.audio}
                onChange={() => toggleMode("audio")}
                label="Audio"
              />
              <Check
                checked={s.modes.userChoice}
                onChange={() => toggleMode("userChoice")}
                label="User's Choice"
                info="Trainee picks the available modes at session start."
              />
            </div>
            {noModeSelected ? (
              <p className="text-[11.5px] text-bad font-mono">
                Select at least one mode — the roleplay can&apos;t run without one.
              </p>
            ) : null}
          </section>

          {/* Record audio/video */}
          <section className="space-y-2">
            <Heading>Record audio/video?</Heading>
            <div className="flex items-center gap-5">
              <Radio
                checked={s.recordAv === "yes"}
                onChange={() => setS({ ...s, recordAv: "yes" })}
                label="Yes"
              />
              <Radio
                checked={s.recordAv === "no"}
                onChange={() => setS({ ...s, recordAv: "no" })}
                label="No"
              />
            </div>
          </section>

          {/* Number of Roleplay Attempts */}
          <section className="space-y-2">
            <Heading>Number of Roleplay Attempts</Heading>
            <div className="flex items-center gap-5 flex-wrap">
              <Radio
                checked={s.attempts.kind === "unlimited"}
                onChange={() =>
                  setS({ ...s, attempts: { ...s.attempts, kind: "unlimited" } })
                }
                label="Unlimited"
              />
              <div className="flex items-center gap-2">
                <Radio
                  checked={s.attempts.kind === "limited"}
                  onChange={() =>
                    setS({ ...s, attempts: { ...s.attempts, kind: "limited" } })
                  }
                  label="Limited - Show up to"
                />
                <NumberStep
                  value={s.attempts.limit}
                  min={1}
                  max={50}
                  disabled={s.attempts.kind !== "limited"}
                  onChange={(n) =>
                    setS({ ...s, attempts: { ...s.attempts, limit: n } })
                  }
                />
                <span className="text-[12.5px] text-ink-2">attempts</span>
              </div>
            </div>
            <div className="pt-1">
              <Check
                checked={s.followIdealConversation}
                onChange={() =>
                  setS({
                    ...s,
                    followIdealConversation: !s.followIdealConversation,
                  })
                }
                label="Follow Ideal conversation"
                info="AI will follow your Ideal Conversation script."
              />
            </div>
          </section>

          {/* Duration sliders */}
          <section className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Heading>
                Minimum Duration ( {s.minDurationMin} minutes)
              </Heading>
              <RangeSlider
                value={s.minDurationMin}
                min={1}
                max={s.maxDurationMin}
                onChange={(n) => setS({ ...s, minDurationMin: n })}
              />
            </div>
            <div className="space-y-2">
              <Heading>
                Maximum Duration ( {s.maxDurationMin} minutes)
              </Heading>
              <RangeSlider
                value={s.maxDurationMin}
                min={s.minDurationMin}
                max={60}
                onChange={(n) => setS({ ...s, maxDurationMin: n })}
              />
            </div>
          </section>

          {/* Toggles */}
          <section className="space-y-2.5">
            <Check
              checked={s.failBelowMinDuration}
              onChange={() =>
                setS({ ...s, failBelowMinDuration: !s.failBelowMinDuration })
              }
              label="Fail attempt if less than minimum duration"
            />
            <Check
              checked={s.showExplanation}
              onChange={() => setS({ ...s, showExplanation: !s.showExplanation })}
              label="Show explanation"
            />
            <Check
              checked={s.autoDisconnectOnLimit}
              onChange={() =>
                setS({ ...s, autoDisconnectOnLimit: !s.autoDisconnectOnLimit })
              }
              label="Disconnect automatically when the time limit is exceeded."
            />
            <Check
              checked={s.disconnectOnInactivity}
              onChange={() =>
                setS({
                  ...s,
                  disconnectOnInactivity: !s.disconnectOnInactivity,
                })
              }
              label="Disconnect on User's Inactivity"
              info="Auto-end if the learner is idle past 30s."
            />
          </section>

          {/* Hints */}
          <section className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Heading>Allow Hints in Roleplay</Heading>
              <div className="flex items-center gap-4 flex-wrap">
                <Radio
                  checked={s.hints.kind === "yes"}
                  onChange={() =>
                    setS({ ...s, hints: { ...s.hints, kind: "yes" } })
                  }
                  label="Yes"
                />
                <Radio
                  checked={s.hints.kind === "no"}
                  onChange={() =>
                    setS({ ...s, hints: { ...s.hints, kind: "no" } })
                  }
                  label="No"
                />
                <div className="flex items-center gap-2">
                  <Radio
                    checked={s.hints.kind === "limited"}
                    onChange={() =>
                      setS({ ...s, hints: { ...s.hints, kind: "limited" } })
                    }
                    label="Show up to"
                  />
                  <NumberStep
                    value={s.hints.limit}
                    min={1}
                    max={20}
                    disabled={s.hints.kind !== "limited"}
                    onChange={(n) =>
                      setS({ ...s, hints: { ...s.hints, limit: n } })
                    }
                  />
                  <span className="text-[12.5px] text-ink-2">attempts</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Heading>Select Your Hint Type</Heading>
              <div className="flex items-center gap-5">
                <Radio
                  checked={s.hintType === "complete"}
                  onChange={() => setS({ ...s, hintType: "complete" })}
                  label="Complete"
                />
                <Radio
                  checked={s.hintType === "bullet"}
                  onChange={() => setS({ ...s, hintType: "bullet" })}
                  label="Bullet Points"
                />
              </div>
            </div>
          </section>

          {/* Start / End */}
          <section className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Heading>Start Roleplay By</Heading>
              <Select
                value={s.startRoleplayBy}
                onChange={(v) =>
                  setS({
                    ...s,
                    startRoleplayBy: v as AdditionalSettings["startRoleplayBy"],
                  })
                }
                options={[
                  { value: "ai", label: "AI" },
                  { value: "user", label: "User" },
                  { value: "either", label: "Either" },
                ]}
              />
            </div>
            <div className="space-y-2">
              <Heading>End Roleplay By</Heading>
              <Select
                value={s.endRoleplayBy}
                onChange={(v) =>
                  setS({
                    ...s,
                    endRoleplayBy: v as AdditionalSettings["endRoleplayBy"],
                  })
                }
                options={[
                  { value: "ai", label: "AI" },
                  { value: "user", label: "User" },
                  { value: "either", label: "Either" },
                ]}
              />
            </div>
          </section>

          {/* GIF uploads */}
          <section className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Heading>
                Scenario Intro{" "}
                <InfoDot title="Shown to the learner before the session starts. Upload a GIF or generate an illustration with AI." />
              </Heading>
              {/* Tabs: Upload vs Generate with AI. Both write to the
                  same scenarioIntroGif field — the player renders it
                  via <img> so static PNG and animated GIF both work. */}
              <div className="inline-flex items-center bg-surface-2 border border-border rounded-md p-0.5">
                <button
                  type="button"
                  onClick={() => setIntroMode("upload")}
                  suppressHydrationWarning
                  className={cn(
                    "px-3 py-1 rounded text-[11.5px] font-semibold transition-colors",
                    introMode === "upload"
                      ? "bg-accent text-white"
                      : "text-ink-2 hover:text-ink",
                  )}
                >
                  Upload
                </button>
                <button
                  type="button"
                  onClick={() => setIntroMode("ai")}
                  suppressHydrationWarning
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1 rounded text-[11.5px] font-semibold transition-colors",
                    introMode === "ai"
                      ? "text-white"
                      : "text-ink-2 hover:text-ink",
                  )}
                  style={
                    introMode === "ai"
                      ? { background: "var(--ai-grad, #7c5cd6)" }
                      : undefined
                  }
                >
                  <Icon name="ai-sparkle" size={10} />
                  Generate with AI
                </button>
              </div>

              {introMode === "upload" ? (
                <GifDropzone
                  value={s.scenarioIntroGif}
                  onPick={(file) => uploadGif(file, "scenarioIntroGif")}
                  onClear={() => setS({ ...s, scenarioIntroGif: null })}
                />
              ) : (
                <div className="border-2 border-dashed border-border rounded-[10px] p-3 bg-surface space-y-2">
                  {s.scenarioIntroGif ? (
                    <div className="flex items-center gap-3 pb-2 border-b border-border">
                      <img
                        src={s.scenarioIntroGif.dataUrl}
                        alt={s.scenarioIntroGif.name}
                        className="w-16 h-16 object-cover rounded border border-border"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-semibold text-ink truncate">
                          {s.scenarioIntroGif.name}
                        </div>
                        <div className="text-[10.5px] text-ink-3">
                          Current intro
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setS({ ...s, scenarioIntroGif: null })
                        }
                        aria-label="Remove intro image"
                        className="text-ink-3 hover:text-bad"
                      >
                        ×
                      </button>
                    </div>
                  ) : null}
                  <textarea
                    value={introPrompt}
                    onChange={(e) => setIntroPrompt(e.target.value)}
                    rows={3}
                    placeholder="Describe the scene — Ex: pharmacy storefront, friendly buyer reviewing a stocking decision"
                    className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[12px] focus:outline-none focus:border-accent resize-y"
                    suppressHydrationWarning
                  />
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-[10.5px] text-ink-3">
                      AI-generated PNG (1536×1024). 16:9 illustration —
                      ~5-15s.
                    </div>
                    <button
                      type="button"
                      onClick={generateIntroWithAi}
                      disabled={introGenerating || introPrompt.trim().length < 5}
                      suppressHydrationWarning
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11.5px] font-semibold text-white disabled:opacity-60 hover:opacity-90"
                      style={{ background: "var(--ai-grad, #7c5cd6)" }}
                    >
                      <Icon name="ai-sparkle" size={10} />
                      {introGenerating
                        ? "Generating…"
                        : s.scenarioIntroGif
                          ? "Regenerate"
                          : "Generate"}
                    </button>
                  </div>
                  {introError ? (
                    <p className="text-[11px] text-bad font-mono break-words">
                      {introError}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Heading>
                Tips on Report{" "}
                <InfoDot title="Shown next to the learner's report after the run." />
              </Heading>
              <GifDropzone
                value={s.tipsOnReportGif}
                onPick={(file) => uploadGif(file, "tipsOnReportGif")}
                onClear={() => setS({ ...s, tipsOnReportGif: null })}
              />
            </div>
          </section>

          {error ? (
            <p className="text-[11.5px] text-bad font-mono">{error}</p>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-border flex-wrap">
          <button
            type="button"
            onClick={resetDefaults}
            suppressHydrationWarning
            className="text-[12px] font-semibold text-ink-3 hover:text-ink underline-offset-2 hover:underline"
            title="Restore every option to its default value"
          >
            Reset to defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              suppressHydrationWarning
              className="px-5 py-2 rounded-md border border-border bg-surface text-[13px] font-semibold text-ink-2 hover:text-ink hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={uploading !== null}
              suppressHydrationWarning
              className="px-5 py-2 rounded-md bg-accent text-white text-[13px] font-semibold hover:bg-accent-strong disabled:opacity-60"
            >
              {uploading ? "Uploading…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────── Primitives ───────────────

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
      {children}
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
  info,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  info?: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button"
        onClick={onChange}
        role="checkbox"
        aria-checked={checked}
        suppressHydrationWarning
        className={cn(
          "w-4 h-4 grid place-items-center rounded border transition-colors",
          checked
            ? "bg-accent border-accent text-white"
            : "bg-surface border-border-strong text-transparent",
        )}
      >
        <span className="text-[10px] leading-none">✓</span>
      </button>
      <span className="text-[12.5px] text-ink">{label}</span>
      {info ? <InfoDot title={info} /> : null}
    </label>
  );
}

function Radio({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button"
        onClick={onChange}
        role="radio"
        aria-checked={checked}
        suppressHydrationWarning
        className={cn(
          "w-4 h-4 rounded-full border-2 grid place-items-center transition-colors",
          checked ? "border-accent" : "border-border-strong",
        )}
      >
        {checked ? <span className="w-2 h-2 rounded-full bg-accent" /> : null}
      </button>
      <span className="text-[12.5px] text-ink">{label}</span>
    </label>
  );
}

function NumberStep({
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (!Number.isFinite(n)) return;
        onChange(Math.max(min, Math.min(max, Math.round(n))));
      }}
      className="w-14 bg-surface border border-border-strong rounded-md px-2 py-1 text-[12.5px] focus:outline-none focus:border-accent disabled:opacity-50"
      suppressHydrationWarning
    />
  );
}

function RangeSlider({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-accent"
      suppressHydrationWarning
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent pr-9"
        suppressHydrationWarning
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon
        name="chevron-down"
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3"
      />
    </div>
  );
}

function InfoDot({ title }: { title: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      className="inline-grid place-items-center w-4 h-4 rounded-full border border-border bg-surface-2 text-[10px] text-ink-3 cursor-help"
    >
      i
    </span>
  );
}

function GifDropzone({
  value,
  onPick,
  onClear,
}: {
  value: { name: string; dataUrl: string } | null;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="border-2 border-dashed border-border rounded-[10px] p-5 bg-surface relative">
      {value ? (
        <div className="flex items-center gap-3">
          <img
            src={value.dataUrl}
            alt={value.name}
            className="w-16 h-16 object-cover rounded border border-border"
          />
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-ink truncate">
              {value.name}
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-[11.5px] text-accent hover:text-accent-strong"
            >
              Replace
            </button>
          </div>
          <button
            type="button"
            onClick={onClear}
            aria-label="Remove GIF"
            className="text-ink-3 hover:text-bad"
          >
            ×
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center text-center text-ink-3 py-4 hover:text-ink"
        >
          <span className="text-[#6d4ad9] text-[24px] leading-none mb-1">
            ⬆
          </span>
          <div className="text-[13px] text-ink-2">
            <span className="text-accent font-semibold">Click Here</span> to
            Upload
          </div>
          <div className="text-[11px] text-ink-3 mt-0.5">Only GIF file</div>
          <div className="text-[10.5px] text-ink-3">Max file size: 20MB</div>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/gif"
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
