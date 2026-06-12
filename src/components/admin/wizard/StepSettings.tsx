// Step 4 — Settings + Publish.
//
// Four cards bound to the new Training.* settings fields plus an
// AI-defaults banner. Save persists everything, then either exits as
// draft or flips status to published (gated by the same blockers as
// before: title, at least one published module).

"use client";

import { useMemo, useState, useTransition } from "react";
import {
  goToStep,
  publishTraining,
  saveDraftAndExit,
  saveTrainingSettings,
} from "@/app/admin/trainings/actions";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { WizardFooter } from "./StepBasic";
import { cn } from "@/lib/cn";

type Visibility = "private" | "org_wide" | "public";
type Repeat = "never" | "weekly" | "monthly" | "quarterly";
type Tone = "soft" | "balanced" | "direct";

export type StepSettingsValues = {
  visibility: Visibility;
  prerequisiteIds: string[];
  selfEnrollment: boolean;
  startAt: string | null; // YYYY-MM-DD
  dueAt: string | null;
  repeat: Repeat;
  issueCertificate: boolean;
  passingScore: number;
  rewardPoints: number;
  adaptiveDifficulty: boolean;
  liveCoachTips: boolean;
  followUpNudges: boolean;
  feedbackTone: Tone;
};

type Candidate = { id: string; title: string };

type Summary = {
  title: string;
  moduleCount: number;
  publishedModuleCount: number;
  assignmentCount: number;
  status: "draft" | "published" | "archived";
};

const VISIBILITY_OPTIONS: Array<{ value: Visibility; label: string }> = [
  { value: "private", label: "Private" },
  { value: "org_wide", label: "Org-wide" },
  { value: "public", label: "Public" },
];

const REPEAT_OPTIONS: Array<{ value: Repeat; label: string }> = [
  { value: "never", label: "Never" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
];

const TONE_OPTIONS: Array<{ value: Tone; label: string }> = [
  { value: "soft", label: "Soft" },
  { value: "balanced", label: "Balanced" },
  { value: "direct", label: "Direct" },
];

export function StepSettings({
  trainingId,
  initial,
  prerequisiteCandidates,
  summary,
}: {
  trainingId: string;
  initial: StepSettingsValues;
  prerequisiteCandidates: Candidate[];
  summary: Summary;
}) {
  const [v, setV] = useState<StepSettingsValues>(initial);
  const [pending, startTransition] = useTransition();

  const blockers = useMemo(() => {
    const out: string[] = [];
    if (!summary.title || summary.title === "Untitled training") {
      out.push("Set a real title in Step 1.");
    }
    if (summary.moduleCount === 0) {
      out.push("Add at least one module in Step 2.");
    }
    if (summary.publishedModuleCount === 0) {
      out.push("Mark at least one module as Published in Step 2.");
    }
    return out;
  }, [summary]);

  const candidateById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of prerequisiteCandidates) m.set(c.id, c.title);
    return m;
  }, [prerequisiteCandidates]);

  async function persist() {
    await saveTrainingSettings(trainingId, v);
  }

  function onSaveDraft() {
    startTransition(async () => {
      await persist();
      await saveDraftAndExit(trainingId);
    });
  }
  function onPublish() {
    startTransition(async () => {
      await persist();
      await publishTraining(trainingId);
    });
  }
  function onBack() {
    startTransition(async () => {
      await persist();
      await goToStep(trainingId, 3);
    });
  }

  const aiOnCount =
    Number(v.adaptiveDifficulty) +
    Number(v.liveCoachTips) +
    Number(v.followUpNudges);

  return (
    <div className="space-y-6">
      {/* AI defaults banner */}
      <AiDefaultsBanner aiOnCount={aiOnCount} />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Visibility & Access */}
        <Card pad="lg" className="space-y-4">
          <CardHeader
            title="Visibility & Access"
            subtitle="Who can see and start this training."
          />
          <Row label="Visibility" hint="Who can find this training">
            <Segmented<Visibility>
              value={v.visibility}
              options={VISIBILITY_OPTIONS}
              onChange={(value) => setV({ ...v, visibility: value })}
            />
          </Row>
          <Row
            label="Prerequisites"
            hint="Trainings that must be completed first"
          >
            <PrerequisitesPicker
              value={v.prerequisiteIds}
              candidates={prerequisiteCandidates}
              candidateById={candidateById}
              onChange={(ids) => setV({ ...v, prerequisiteIds: ids })}
            />
          </Row>
          <Row label="Self-enrollment" hint="Let employees join without invite">
            <Toggle
              checked={v.selfEnrollment}
              onChange={(b) => setV({ ...v, selfEnrollment: b })}
            />
          </Row>
        </Card>

        {/* Scheduling */}
        <Card pad="lg" className="space-y-4">
          <CardHeader
            title="Scheduling"
            subtitle="When this training can be taken."
          />
          <Row label="Start date" hint="When training opens">
            <input
              type="date"
              value={v.startAt ?? ""}
              onChange={(e) =>
                setV({ ...v, startAt: e.target.value || null })
              }
              className="bg-surface border border-border-strong rounded-md px-2 py-1.5 text-[13px] focus:outline-none focus:border-accent"
              suppressHydrationWarning
            />
          </Row>
          <Row label="Due date" hint="Deadline to complete">
            <input
              type="date"
              value={v.dueAt ?? ""}
              onChange={(e) => setV({ ...v, dueAt: e.target.value || null })}
              className="bg-surface border border-border-strong rounded-md px-2 py-1.5 text-[13px] focus:outline-none focus:border-accent"
              suppressHydrationWarning
            />
          </Row>
          <Row label="Repeat training" hint="Recurring reinforcement">
            <select
              value={v.repeat}
              onChange={(e) =>
                setV({ ...v, repeat: e.target.value as Repeat })
              }
              className="bg-surface border border-border-strong rounded-md px-2 py-1.5 text-[13px] focus:outline-none focus:border-accent"
              suppressHydrationWarning
            >
              {REPEAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Row>
        </Card>

        {/* Completion & Certificate */}
        <Card pad="lg" className="space-y-4">
          <CardHeader
            title="Completion & Certificate"
            subtitle="What learners get when they finish."
          />
          <Row
            label="Issue certificate"
            hint="Auto-generate on 100% completion"
          >
            <Toggle
              checked={v.issueCertificate}
              onChange={(b) => setV({ ...v, issueCertificate: b })}
            />
          </Row>
          <Row label="Passing score" hint="Across all modules">
            <NumberInput
              value={v.passingScore}
              min={0}
              max={100}
              onChange={(n) => setV({ ...v, passingScore: n })}
            />
          </Row>
          <Row label="Reward points" hint="On successful completion">
            <NumberInput
              value={v.rewardPoints}
              min={0}
              max={100_000}
              onChange={(n) => setV({ ...v, rewardPoints: n })}
            />
          </Row>
        </Card>

        {/* AI Behavior */}
        <Card
          pad="lg"
          className="space-y-4 border-[#c9b8f0]/60"
          style={{
            background:
              "linear-gradient(135deg, rgba(243,234,250,0.5), rgba(252,232,240,0.4))",
          }}
        >
          <CardHeader
            title="AI Behavior"
            subtitle="How AI adapts and coaches during this training."
            accent
          />
          <Row
            label="Adaptive difficulty"
            hint="AI adjusts persona toughness to learner's level"
          >
            <Toggle
              checked={v.adaptiveDifficulty}
              onChange={(b) => setV({ ...v, adaptiveDifficulty: b })}
            />
          </Row>
          <Row label="Live coach tips" hint="Real-time nudges during roleplay">
            <Toggle
              checked={v.liveCoachTips}
              onChange={(b) => setV({ ...v, liveCoachTips: b })}
            />
          </Row>
          <Row
            label="AI follow-up nudges"
            hint="Reminders + targeted micro-drills 24h after"
          >
            <Toggle
              checked={v.followUpNudges}
              onChange={(b) => setV({ ...v, followUpNudges: b })}
            />
          </Row>
          <Row label="AI feedback tone" hint="How direct AI coaching is">
            <select
              value={v.feedbackTone}
              onChange={(e) =>
                setV({ ...v, feedbackTone: e.target.value as Tone })
              }
              className="bg-surface border border-border-strong rounded-md px-2 py-1.5 text-[13px] focus:outline-none focus:border-accent"
              suppressHydrationWarning
            >
              {TONE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Row>
        </Card>
      </div>

      {/* Publish gate */}
      {blockers.length > 0 ? (
        <Card pad="md" className="border-warn/40 bg-warn-pale">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-warn mb-2">
            Before publishing
          </div>
          <ul className="space-y-1 text-[12.5px] text-warn">
            {blockers.map((b) => (
              <li key={b}>· {b}</li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card pad="md" className="border-good/40 bg-good-pale">
          <div className="text-[12.5px] text-good">
            All set. Publishing will make this training visible to assigned
            learners on their dashboard.
          </div>
        </Card>
      )}

      <WizardFooter
        onBack={onBack}
        onSaveDraft={onSaveDraft}
        onSaveNext={onPublish}
        saveNextLabel={
          summary.status === "published" ? "Re-publish" : "Publish Training"
        }
        pending={pending || blockers.length > 0}
      />
    </div>
  );
}

// ─────────────── AI defaults banner ───────────────

function AiDefaultsBanner({ aiOnCount }: { aiOnCount: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="border rounded-[12px] p-3"
      style={{
        background:
          "linear-gradient(120deg, rgba(124,92,214,0.10) 0%, rgba(255,124,82,0.08) 100%)",
        borderColor: "rgba(124,92,214,0.30)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 grid place-items-center rounded-md text-white shrink-0"
          style={{ background: "var(--ai-grad, #7c5cd6)" }}
          aria-hidden
        >
          <Icon name="ai-sparkle" size={13} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-ink leading-[1.45]">
            <strong className="font-semibold">
              {aiOnCount} AI-recommended default{aiOnCount === 1 ? "" : "s"}{" "}
              applied:
            </strong>{" "}
            Adaptive difficulty, live coach tips, and follow-up nudges are on
            by default — turn any off in the AI Behavior card.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          suppressHydrationWarning
          className="text-[11.5px] font-semibold text-[#6d4ad9] hover:underline shrink-0"
        >
          Why these?
        </button>
      </div>
      {open ? (
        <div className="mt-2 pl-11 text-[12px] text-ink-2 leading-[1.55]">
          Trainings with adaptive personas, mid-session nudges, and 24-hour
          reinforcement see ~30% better recall in our pilot tenants. Turn off
          for compliance-style content where the trainee needs to face the
          full unmodified case.
        </div>
      ) : null}
    </div>
  );
}

// ─────────────── Form atoms ───────────────

function CardHeader({
  title,
  subtitle,
  accent,
}: {
  title: string;
  subtitle: string;
  accent?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <h2
        className={cn(
          "font-display text-[18px] leading-tight flex items-center gap-1.5",
          accent && "text-[#6d4ad9]",
        )}
      >
        {accent ? <Icon name="ai-sparkle" size={13} /> : null}
        {title}
      </h2>
      <p className="text-[12px] text-ink-2">{subtitle}</p>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-dashed border-border pt-3 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-ink">{label}</div>
        {hint ? <div className="text-[11.5px] text-ink-3">{hint}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center bg-surface-2 border border-border rounded-md p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            suppressHydrationWarning
            className={cn(
              "px-3 py-1 rounded text-[12px] font-semibold transition-colors",
              active
                ? "bg-accent text-white"
                : "text-ink-2 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      suppressHydrationWarning
      className={cn(
        "relative w-10 h-5 rounded-full transition-colors",
        checked ? "bg-accent" : "bg-surface-2 border border-border",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
          checked ? "left-[22px]" : "left-0.5",
        )}
      />
    </button>
  );
}

function NumberInput({
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
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
      }}
      className="w-20 bg-surface border border-border-strong rounded-md px-2 py-1.5 text-[13px] text-right focus:outline-none focus:border-accent"
      suppressHydrationWarning
    />
  );
}

// ─────────────── Prerequisites picker ───────────────

function PrerequisitesPicker({
  value,
  candidates,
  candidateById,
  onChange,
}: {
  value: string[];
  candidates: Candidate[];
  candidateById: Map<string, string>;
  onChange: (ids: string[]) => void;
}) {
  const [pick, setPick] = useState("");
  const remaining = candidates.filter((c) => !value.includes(c.id));

  function add() {
    if (!pick) return;
    if (value.includes(pick)) return;
    onChange([...value, pick]);
    setPick("");
  }

  return (
    <div className="flex flex-col items-end gap-1.5 max-w-[280px]">
      <div className="flex flex-wrap gap-1 justify-end">
        {value.length === 0 ? (
          <span className="text-[11.5px] text-ink-3 italic">None</span>
        ) : (
          value.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 bg-accent-pale text-accent text-[11.5px] font-semibold rounded px-2 py-0.5"
            >
              {candidateById.get(id) ?? "Unknown training"}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== id))}
                suppressHydrationWarning
                className="text-accent/70 hover:text-accent"
                aria-label="Remove prerequisite"
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>
      {remaining.length > 0 ? (
        <div className="flex items-center gap-1.5">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="bg-surface border border-border-strong rounded-md px-2 py-1 text-[12px] max-w-[180px] focus:outline-none focus:border-accent"
            suppressHydrationWarning
          >
            <option value="">Pick a training…</option>
            {remaining.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={add}
            disabled={!pick}
            suppressHydrationWarning
            className="text-[12px] font-semibold text-accent hover:text-accent-strong disabled:opacity-40"
          >
            + Add
          </button>
        </div>
      ) : null}
    </div>
  );
}
