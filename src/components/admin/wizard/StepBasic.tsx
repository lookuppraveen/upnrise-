// Step 1 — Basic Details.
//
// Layout matches the mockup: AI hero banner at top → name/description/
// categories card → thumbnail card → KB card. The KB sources panel
// (moved up from Step 2) lets the admin attach files/URLs/text before
// they continue, so the AI generator has context for Step 2.

"use client";

import { useRef, useState, useTransition } from "react";
import {
  clearTrainingThumbnail,
  generateTrainingThumbnail,
  saveBasicDetails,
  saveDraftAndExit,
  setTrainingThumbnail,
} from "@/app/admin/trainings/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import {
  WizardKbSources,
  type AttachedKbSource,
  type LibraryKbSource,
} from "./WizardKbSources";
import { cn } from "@/lib/cn";

type Initial = {
  id: string;
  title: string;
  description: string | null;
  categories: string[];
  thumbnailUrl: string | null;
};

// Quick-add suggestion pills shown on the right of the categories row.
// Click adds the tag (if not already present); clicking again is a no-op.
const SUGGESTED_CATEGORIES = ["Voice & Video", "Roleplay"];

export function StepBasic({
  training,
  attachedKbSources,
  libraryKbSources,
}: {
  training: Initial;
  attachedKbSources: AttachedKbSource[];
  libraryKbSources: LibraryKbSource[];
}) {
  const isPlaceholder = training.title === "Untitled training";
  const [title, setTitle] = useState(isPlaceholder ? "" : training.title);
  const [description, setDescription] = useState(training.description ?? "");
  const [categories, setCategories] = useState<string[]>(training.categories);
  const [pending, startTransition] = useTransition();

  function save(next: boolean) {
    startTransition(() => {
      void saveBasicDetails(
        training.id,
        {
          title: title.trim() || "Untitled training",
          description: description.trim() || null,
          categories,
        },
        next,
      );
    });
  }

  return (
    <div className="space-y-6">
      <AiGenerateHero
        title={title}
        onApply={({ t, d, c }) => {
          setTitle(t);
          setDescription(d);
          setCategories((prev) => {
            const merged = [...prev];
            for (const cat of c) if (!merged.includes(cat)) merged.push(cat);
            return merged.slice(0, 10);
          });
        }}
      />

      <Card pad="lg" className="space-y-5">
        <Field label="Training Name">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Consultative Sales Conversation"
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[14px] focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </Field>

        <DescriptionField
          title={title}
          value={description}
          onChange={setDescription}
        />

        <CategoriesField value={categories} onChange={setCategories} />
      </Card>

      <ThumbnailCard
        trainingId={training.id}
        initial={training.thumbnailUrl}
        title={title}
        description={description}
        categories={categories}
      />

      <WizardKbSources
        trainingId={training.id}
        attached={attachedKbSources}
        library={libraryKbSources}
      />

      <WizardFooter
        onBack={null}
        onSaveDraft={() =>
          startTransition(() => void saveDraftAndExit(training.id))
        }
        onSaveNext={() => save(true)}
        pending={pending}
      />
    </div>
  );
}

// ─────────────── AI generate hero ───────────────

function AiGenerateHero({
  title,
  onApply,
}: {
  title: string;
  onApply: (out: { t: string; d: string; c: string[] }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    const briefText = brief.trim() || title.trim();
    if (briefText.length < 10) {
      setError("Add a sentence describing what you want to teach.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/training-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: briefText }),
      });
      if (!res.ok) throw new Error(`generate failed: ${res.status}`);
      const data: { title: string; description: string; categories: string[] } =
        await res.json();
      onApply({ t: data.title, d: data.description, c: data.categories });
      setOpen(false);
      setBrief("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="border rounded-[12px] p-4"
      style={{
        background:
          "linear-gradient(120deg, rgba(124,92,214,0.10) 0%, rgba(255,124,82,0.10) 100%)",
        borderColor: "rgba(124,92,214,0.30)",
      }}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <div
          className="w-9 h-9 grid place-items-center rounded-md text-white shrink-0"
          style={{ background: "var(--ai-grad, #7c5cd6)" }}
          aria-hidden
        >
          <Icon name="ai-sparkle" size={14} />
        </div>
        <div className="flex-1 min-w-[260px]">
          <div className="font-semibold text-[14.5px] text-ink">
            Generate the whole training with AI
          </div>
          <p className="text-[12.5px] text-ink-2 leading-[1.4]">
            Describe what you want to teach, and AI will draft the name,
            description, categories, and 4 starter modules — including voice
            &amp; video roleplays.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          suppressHydrationWarning
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-strong"
        >
          <Icon name="ai-sparkle" size={11} />
          {open ? "Cancel" : "Generate using AI"}
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
            placeholder='e.g. "First-call discovery for an outbound rep selling fleet logistics software to mid-market ops VPs"'
            className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={generate}
              disabled={pending}
              suppressHydrationWarning
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-ink text-white text-[12.5px] font-semibold hover:bg-[#2a2a2a] disabled:opacity-60"
            >
              <Icon name="ai-sparkle" size={11} />
              {pending ? "Generating…" : "Generate"}
            </button>
            {error ? (
              <span className="text-[11.5px] text-bad font-mono">{error}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────── Description with fake toolbar + Improve with AI ───────────────

function DescriptionField({
  title,
  value,
  onChange,
}: {
  title: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function improve() {
    if (value.trim().length < 10) {
      setError("Write a few sentences first, then improve.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/training-draft/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: value }),
      });
      if (!res.ok) throw new Error(`improve failed: ${res.status}`);
      const data: { description: string } = await res.json();
      onChange(data.description);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <label className="block space-y-1.5">
      <span className="text-[12.5px] font-semibold text-ink">Description</span>
      <p className="text-[11.5px] text-ink-3 -mt-0.5">
        Describe what learners will gain from this training.
      </p>
      <div className="border border-border-strong rounded-md overflow-hidden bg-surface">
        <div className="flex items-center gap-1 px-2 py-1.5 bg-surface-2 border-b border-border text-[11.5px] text-ink-2">
          <FakeSelect label="Paragraph" />
          <FakeSelect label="System Font" />
          <FakeSelect label="12pt" />
          <ToolbarBtn>B</ToolbarBtn>
          <ToolbarBtn italic>I</ToolbarBtn>
          <ToolbarBtn underline>U</ToolbarBtn>
          <button
            type="button"
            onClick={improve}
            disabled={pending}
            suppressHydrationWarning
            className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#6d4ad9] hover:text-[#5535b0] disabled:opacity-50"
          >
            <Icon name="ai-sparkle" size={10} />
            {pending ? "Improving…" : "Improve with AI"}
          </button>
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          placeholder="End-to-end discovery → close playbook with AI roleplay practice and scoring."
          className="w-full bg-surface px-3 py-2 text-[13px] leading-[1.55] focus:outline-none resize-y"
          suppressHydrationWarning
        />
      </div>
      {error ? (
        <span className="text-[11.5px] text-bad font-mono">{error}</span>
      ) : null}
    </label>
  );
}

function ToolbarBtn({
  children,
  italic,
  underline,
}: {
  children: React.ReactNode;
  italic?: boolean;
  underline?: boolean;
}) {
  // Visual-only — real rich-text isn't needed for a description field.
  // Buttons render disabled-looking so they signal "formatting" without
  // implying a working WYSIWYG state we'd have to support.
  return (
    <span
      className={cn(
        "w-6 h-6 grid place-items-center rounded text-[12px] font-bold text-ink-2 select-none",
        italic && "italic",
        underline && "underline",
      )}
      aria-hidden
    >
      {children}
    </span>
  );
}

function FakeSelect({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-ink-2 border border-border rounded bg-surface select-none">
      {label}
      <Icon name="chevron-down" size={9} />
    </span>
  );
}

// ─────────────── Categories with suggestion pills ───────────────

function CategoriesField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [input, setInput] = useState("");

  function add(tag: string) {
    const v = tag.trim();
    if (!v || value.includes(v) || value.length >= 10) return;
    onChange([...value, v]);
  }

  function commit() {
    add(input);
    setInput("");
  }

  return (
    <label className="block space-y-1.5">
      <span className="text-[12.5px] font-semibold text-ink">
        Choose Categories
      </span>
      <p className="text-[11.5px] text-ink-3 -mt-0.5">
        Tag your training with one or more categories (e.g., Leadership,
        Compliance, Communication).
      </p>
      <div className="flex items-stretch gap-2 flex-wrap">
        <div className="flex-1 min-w-[280px] border border-border-strong rounded-md bg-surface px-2 py-1.5 flex items-center gap-1.5 flex-wrap">
          {value.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 text-[12px] font-semibold bg-accent-pale text-accent rounded px-2 py-0.5"
            >
              {c}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== c))}
                className="text-accent/70 hover:text-accent"
                aria-label={`Remove ${c}`}
                suppressHydrationWarning
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                commit();
              }
            }}
            onBlur={() => {
              if (input.trim()) commit();
            }}
            placeholder={value.length === 0 ? "Add a category…" : "Add another…"}
            className="flex-1 min-w-[140px] bg-transparent text-[13px] focus:outline-none"
            suppressHydrationWarning
          />
        </div>
        <div className="flex items-center gap-1.5">
          {SUGGESTED_CATEGORIES.map((s) => {
            const already = value.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                disabled={already}
                suppressHydrationWarning
                className={cn(
                  "inline-flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1.5 rounded-md border",
                  already
                    ? "border-border bg-surface-2 text-ink-3 cursor-not-allowed"
                    : "border-[#c9b8f0] bg-[#f3eafa] text-[#6d4ad9] hover:bg-[#ead9f8]",
                )}
              >
                + {s}
              </button>
            );
          })}
        </div>
      </div>
    </label>
  );
}

// ─────────────── Thumbnail card ───────────────

function ThumbnailCard({
  trainingId,
  initial,
  title,
  description,
  categories,
}: {
  trainingId: string;
  initial: string | null;
  title: string;
  description: string;
  categories: string[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");

  function seedPrompt() {
    // Seed once when the user opens the panel — don't clobber edits if
    // they re-open after typing.
    if (aiPrompt.trim().length > 0) return;
    const parts: string[] = [];
    if (title.trim()) parts.push(title.trim());
    if (description.trim())
      parts.push(description.trim().split(/\n+/).slice(0, 2).join(" "));
    if (categories.length > 0) parts.push(`Categories: ${categories.join(", ")}`);
    setAiPrompt(parts.join(" — "));
  }

  function handleFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.size > 4_000_000) {
      setError("Max 4 MB.");
      return;
    }
    const fd = new FormData();
    fd.set("trainingId", trainingId);
    fd.set("file", file);
    startTransition(async () => {
      try {
        await setTrainingThumbnail(fd);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

  function remove() {
    startTransition(() => void clearTrainingThumbnail(trainingId));
  }

  function generate() {
    setError(null);
    const p = aiPrompt.trim();
    if (p.length < 5) {
      setError("Describe the thumbnail in a sentence first.");
      return;
    }
    startTransition(async () => {
      try {
        await generateTrainingThumbnail(trainingId, p);
        setAiOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <Card pad="lg" className="space-y-3">
      <div>
        <div className="text-[12.5px] font-semibold text-ink">
          Training Thumbnail
        </div>
        <p className="text-[11.5px] text-ink-3">
          Add a thumbnail to make your training more recognizable and
          engaging. Recommended size: 800×450 px.
        </p>
      </div>

      {initial ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={initial}
            alt=""
            className="w-[160px] h-[90px] object-cover rounded-md border border-border"
          />
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={pending}
              suppressHydrationWarning
              className="text-[12px] font-semibold text-accent hover:text-accent-strong disabled:opacity-50 text-left"
            >
              Replace…
            </button>
            <button
              type="button"
              onClick={() => {
                seedPrompt();
                setAiOpen(true);
              }}
              disabled={pending}
              suppressHydrationWarning
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#6d4ad9] hover:text-[#5535b0] disabled:opacity-50 text-left"
            >
              <Icon name="ai-sparkle" size={10} />
              Regenerate with AI…
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              suppressHydrationWarning
              className="text-[12px] text-ink-3 hover:text-bad disabled:opacity-50 text-left"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            suppressHydrationWarning
            className={cn(
              "block w-full border-2 border-dashed rounded-[10px] p-6 text-center cursor-pointer transition-colors disabled:opacity-60",
              "border-border hover:border-accent-pale bg-surface-2",
            )}
          >
            <div
              className="w-10 h-10 mx-auto grid place-items-center rounded-md text-accent bg-accent-pale mb-2"
              aria-hidden
            >
              <Icon name="image" size={16} />
            </div>
            <div className="text-[13.5px] font-semibold text-ink">
              Upload an image
            </div>
            <div className="text-[11.5px] text-ink-3 mt-1">
              PNG, JPG, WEBP up to 4 MB
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              seedPrompt();
              setAiOpen(true);
            }}
            disabled={pending}
            suppressHydrationWarning
            className={cn(
              "block w-full rounded-[10px] p-6 text-center cursor-pointer transition-colors border-2 border-dashed disabled:opacity-60",
              "border-[#c9b8f0] hover:border-[#6d4ad9]",
            )}
            style={{
              background:
                "linear-gradient(120deg, rgba(124,92,214,0.10) 0%, rgba(255,124,82,0.10) 100%)",
            }}
          >
            <div
              className="w-10 h-10 mx-auto grid place-items-center rounded-md text-white mb-2"
              style={{ background: "var(--ai-grad, #7c5cd6)" }}
              aria-hidden
            >
              <Icon name="ai-sparkle" size={14} />
            </div>
            <div className="text-[13.5px] font-semibold text-ink">
              Generate with AI
            </div>
            <div className="text-[11.5px] text-ink-3 mt-1">
              Describe the thumbnail in a sentence
            </div>
          </button>
        </div>
      )}

      {aiOpen ? (
        <div
          className="border rounded-[10px] p-3 space-y-2"
          style={{
            background:
              "linear-gradient(120deg, rgba(124,92,214,0.08) 0%, rgba(255,124,82,0.08) 100%)",
            borderColor: "rgba(124,92,214,0.30)",
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 grid place-items-center rounded-md text-white shrink-0"
              style={{ background: "var(--ai-grad, #7c5cd6)" }}
              aria-hidden
            >
              <Icon name="ai-sparkle" size={12} />
            </div>
            <div className="text-[12.5px] font-semibold text-ink">
              Generate thumbnail with AI
            </div>
            <button
              type="button"
              onClick={() => setAiOpen(false)}
              disabled={pending}
              suppressHydrationWarning
              className="ml-auto text-[12px] text-ink-3 hover:text-ink disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            rows={3}
            placeholder='e.g. "Two sales reps roleplaying a discovery call across a desk, warm lighting, modern office"'
            className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={generate}
              disabled={pending}
              suppressHydrationWarning
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-ink text-white text-[12.5px] font-semibold hover:bg-[#2a2a2a] disabled:opacity-60"
            >
              <Icon name="ai-sparkle" size={11} />
              {pending ? "Generating…" : "Generate"}
            </button>
            <span className="text-[11px] text-ink-3">
              Takes ~10–20 seconds.
            </span>
          </div>
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => handleFile(e.target.files?.[0])}
        className="hidden"
      />
      {error ? (
        <p className="text-[11.5px] text-bad font-mono">{error}</p>
      ) : null}
    </Card>
  );
}

// ─────────────── Atoms ───────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[12.5px] font-semibold text-ink">{label}</span>
      {children}
    </label>
  );
}

// Shared footer for the wizard (used by other Step components too).
export function WizardFooter({
  onBack,
  onSaveDraft,
  onSaveNext,
  saveNextLabel = "Save & Next",
  pending,
}: {
  onBack: (() => void) | null;
  onSaveDraft: () => void;
  onSaveNext: () => void;
  saveNextLabel?: string;
  pending: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 sticky bottom-0 bg-bg/95 backdrop-blur py-3 -mx-1 px-1 border-t border-border">
      {onBack ? (
        <Button variant="ghost" size="md" onClick={onBack} disabled={pending}>
          Back
        </Button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="md"
          onClick={onSaveDraft}
          disabled={pending}
        >
          Save as draft
        </Button>
        <Button
          variant="accent"
          size="md"
          onClick={onSaveNext}
          disabled={pending}
        >
          {pending ? "Saving…" : saveNextLabel}
        </Button>
      </div>
    </div>
  );
}
