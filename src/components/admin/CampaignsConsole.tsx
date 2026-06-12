// Admin Campaigns console — header + KPI strip + tab filter + create
// form + list. Card rebuild adds a time-progress bar for active campaigns
// (computed from startsAt/endsAt) and surfaces the linked training as a
// chip.

"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  createCampaign,
  deleteCampaign,
  updateCampaignStatus,
} from "@/app/admin/campaigns/actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type CampaignStatus = "draft" | "active" | "completed" | "archived";

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  audience: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  training: { id: string; title: string } | null;
};

type TrainingOption = { id: string; title: string };

type Tab = "all" | "active" | "draft" | "completed" | "archived";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "draft", label: "Drafts" },
  { key: "completed", label: "Completed" },
  { key: "archived", label: "Archived" },
];

export function CampaignsConsole({
  campaigns,
  trainings,
}: {
  campaigns: Campaign[];
  trainings: TrainingOption[];
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [adding, setAdding] = useState(false);

  const counts = useMemo(
    () => ({
      all: campaigns.length,
      active: campaigns.filter((c) => c.status === "active").length,
      draft: campaigns.filter((c) => c.status === "draft").length,
      completed: campaigns.filter((c) => c.status === "completed").length,
      archived: campaigns.filter((c) => c.status === "archived").length,
    }),
    [campaigns],
  );

  const endingSoon = useMemo(() => {
    return campaigns.filter((c) => {
      if (c.status !== "active" || !c.endsAt) return false;
      const days = daysFromNow(c.endsAt);
      return days >= 0 && days <= 7;
    }).length;
  }, [campaigns]);

  const filtered = useMemo(
    () =>
      tab === "all"
        ? campaigns
        : campaigns.filter((c) => c.status === tab),
    [campaigns, tab],
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
          Campaigns
        </h1>
        <p className="text-ink-2 text-[13.5px] max-w-[640px] leading-[1.5]">
          Time-boxed pushes — onboarding waves, certification windows,
          product launches. Each campaign carries an audience, a date
          range, and an optional linked training.
        </p>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[14px]">
        <KpiTile
          label="Active now"
          value={String(counts.active)}
          sub={
            counts.active === 0
              ? "no campaigns running"
              : counts.active === 1
                ? "1 campaign running"
                : `${counts.active} campaigns running`
          }
          icon="rocket"
          tone="good"
        />
        <KpiTile
          label="In planning"
          value={String(counts.draft)}
          sub={
            counts.draft === 0
              ? "no drafts"
              : counts.draft === 1
                ? "1 draft to publish"
                : `${counts.draft} drafts to publish`
          }
          icon="clipboard"
          tone="accent"
        />
        <KpiTile
          label="Ending in 7 days"
          value={String(endingSoon)}
          sub={
            endingSoon === 0
              ? "nothing winding down"
              : endingSoon === 1
                ? "1 needs a follow-up"
                : `${endingSoon} need a follow-up`
          }
          icon="alert"
          tone={endingSoon > 0 ? "warn" : "violet"}
        />
      </div>

      {/* Tab + action row */}
      <div className="flex items-center gap-3 flex-wrap border-b border-border">
        <div className="flex items-center gap-1 -mb-px">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-2 text-[13px] border-b-2 whitespace-nowrap transition-colors",
                  active
                    ? "border-ink text-ink font-semibold"
                    : "border-transparent text-ink-2 hover:text-ink",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "text-[11px] font-bold tracking-[0.02em] px-[7px] py-[1px] rounded-full",
                    active
                      ? "bg-ink text-white"
                      : "bg-surface-2 text-ink-3",
                  )}
                >
                  {counts[t.key]}
                </span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto pb-2">
          <Button
            variant="default"
            size="md"
            onClick={() => setAdding((v) => !v)}
          >
            {adding ? "Cancel" : "+ New campaign"}
          </Button>
        </div>
      </div>

      {adding ? (
        <CreateForm
          trainings={trainings}
          onDone={() => setAdding(false)}
        />
      ) : null}

      {filtered.length === 0 ? (
        <Card pad="lg" className="rounded-[12px]">
          <h2 className="font-display text-[20px]">
            {campaigns.length === 0
              ? "No campaigns yet"
              : `No ${tab} campaigns`}
          </h2>
          <p className="text-ink-2 text-[13px] mt-2">
            {campaigns.length === 0
              ? "Create one to plan a time-boxed push — onboarding, certification, product launch."
              : "Try a different tab."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Row key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────── Create form ───────────────

function CreateForm({
  trainings,
  onDone,
}: {
  trainings: TrainingOption[];
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [trainingId, setTrainingId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!name.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await createCampaign({
          name,
          description: description || null,
          audience: audience || null,
          startsAt: startsAt || null,
          endsAt: endsAt || null,
          trainingId: trainingId || null,
        });
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <Card pad="lg" className="space-y-3 rounded-[12px] border-accent/30">
      <Field label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Q3 Pricing Refresher"
          className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[14px] font-semibold focus:outline-none focus:border-accent"
          suppressHydrationWarning
        />
      </Field>
      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does success look like? (optional)"
          rows={2}
          className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent resize-none"
          suppressHydrationWarning
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Audience">
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="All EMEA SDRs"
            className="w-full bg-surface border border-border-strong rounded-md px-2 py-[7px] text-[12.5px] focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </Field>
        <Field label="Starts">
          <input
            type="date"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="w-full bg-surface border border-border-strong rounded-md px-2 py-[7px] text-[12.5px] font-mono focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </Field>
        <Field label="Ends">
          <input
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="w-full bg-surface border border-border-strong rounded-md px-2 py-[7px] text-[12.5px] font-mono focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </Field>
      </div>
      <Field label="Training (optional)">
        <select
          value={trainingId}
          onChange={(e) => setTrainingId(e.target.value)}
          className="w-full bg-surface border border-border-strong rounded-md px-2 py-[7px] text-[12.5px] focus:outline-none focus:border-accent"
          suppressHydrationWarning
        >
          <option value="">— none —</option>
          {trainings.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex items-center justify-end gap-2 pt-1">
        {error ? (
          <span className="text-[11.5px] text-bad font-mono">{error}</span>
        ) : null}
        <Button
          variant="ghost"
          size="md"
          onClick={onDone}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          variant="accent"
          size="md"
          onClick={submit}
          disabled={pending || !name.trim()}
        >
          {pending ? "Saving…" : "Create draft"}
        </Button>
      </div>
    </Card>
  );
}

// ─────────────── Row ───────────────

function Row({ c }: { c: Campaign }) {
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function nextStatus(): CampaignStatus | null {
    if (c.status === "draft") return "active";
    if (c.status === "active") return "completed";
    if (c.status === "completed") return "archived";
    return null;
  }
  const next = nextStatus();
  const isActive = c.status === "active";
  const progress = computeTimeProgress(c.startsAt, c.endsAt);

  return (
    <Card
      pad="md"
      className="group rounded-[12px] hover:border-border-strong transition-colors"
    >
      <div className="flex items-start gap-3">
        {/* Status accent rail */}
        <span
          aria-hidden
          className={cn(
            "w-[5px] self-stretch rounded-full shrink-0",
            c.status === "active"
              ? "bg-good"
              : c.status === "draft"
                ? "bg-warn"
                : "bg-border",
          )}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-[14px] truncate text-ink">
              {c.name}
            </h3>
            <StatusPill status={c.status} />
          </div>

          {c.description ? (
            <p className="text-[12.5px] text-ink-2 mt-1 leading-[1.55]">
              {c.description}
            </p>
          ) : null}

          {/* Meta chips */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11.5px] text-ink-3 font-mono">
            {c.audience ? (
              <span className="inline-flex items-center gap-1">
                <Icon name="users" size={11} />
                {c.audience}
              </span>
            ) : null}
            {c.startsAt || c.endsAt ? (
              <span className="inline-flex items-center gap-1">
                <Icon name="calendar" size={11} />
                {formatDateRange(c.startsAt, c.endsAt)}
              </span>
            ) : null}
            {c.training ? (
              <Link
                href={`/admin/trainings/${c.training.id}/edit`}
                className="inline-flex items-center gap-1 text-accent-strong hover:underline"
              >
                <Icon name="training" size={11} />
                {c.training.title}
              </Link>
            ) : null}
          </div>

          {/* Time progress bar (active campaigns with both dates) */}
          {isActive && progress != null ? (
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-[10.5px] font-mono text-ink-3">
                <span>{progress}% elapsed</span>
                <span>
                  {c.endsAt && daysFromNow(c.endsAt) >= 0
                    ? `${daysFromNow(c.endsAt)}d left`
                    : "ended"}
                </span>
              </div>
              <div className="h-[5px] rounded-[3px] bg-surface-2 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-[3px]",
                    progress >= 90 ? "bg-warn" : "bg-good",
                  )}
                  style={{
                    width: `${Math.max(2, Math.min(100, progress))}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {next ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(() => void updateCampaignStatus(c.id, next))
              }
              className="text-[11.5px] text-ink-2 hover:text-ink px-2 py-1 rounded-md hover:bg-surface-2"
            >
              {pending ? "…" : `→ ${next}`}
            </button>
          ) : null}
          {confirmDelete ? (
            <button
              type="button"
              onClick={() =>
                startTransition(() => void deleteCampaign(c.id))
              }
              disabled={pending}
              className="text-[11.5px] font-semibold text-white px-2 py-1 rounded-md bg-bad hover:bg-bad/90"
            >
              {pending ? "…" : "Confirm"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-[11.5px] text-ink-3 hover:text-bad px-2 py-1 rounded-md hover:bg-bad-pale"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─────────────── Atoms ───────────────

function KpiTile({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: IconName;
  tone: "accent" | "good" | "warn" | "violet";
}) {
  const corner =
    tone === "accent"
      ? "bg-accent-pale text-accent-strong"
      : tone === "good"
        ? "bg-good-pale text-good"
        : tone === "warn"
          ? "bg-warn-pale text-warn"
          : "bg-[#ede9fe] text-[#6d4ad9]";
  return (
    <div className="relative bg-surface border border-border rounded-[12px] px-[18px] py-4 flex flex-col gap-1">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {label}
      </div>
      <div className="font-display text-[32px] leading-[1.05] -tracking-[0.01em] mt-1">
        {value}
      </div>
      <div className="text-[11.5px] text-ink-3 mt-[3px]">{sub}</div>
      <div
        className={cn(
          "absolute top-[14px] right-[14px] w-[28px] h-[28px] rounded-[7px] grid place-items-center",
          corner,
        )}
      >
        <Icon name={icon} size={13} />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: CampaignStatus }) {
  const map = {
    draft: { label: "Draft", cls: "bg-warn-pale text-warn border-warn/20" },
    active: { label: "Active", cls: "bg-good-pale text-good border-good/20" },
    completed: {
      label: "Completed",
      cls: "bg-surface-2 text-ink-2 border-border",
    },
    archived: {
      label: "Archived",
      cls: "bg-surface-2 text-ink-3 border-border",
    },
  } as const;
  const m = map[status];
  return (
    <span
      className={cn(
        "text-[10px] font-semibold uppercase tracking-[0.08em] px-[6px] py-[1px] rounded-sm border whitespace-nowrap",
        m.cls,
      )}
    >
      {m.label}
    </span>
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

// ─────────────── helpers ───────────────

function daysFromNow(d: Date): number {
  return Math.round(
    (new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
}

function computeTimeProgress(
  starts: Date | null,
  ends: Date | null,
): number | null {
  if (!starts || !ends) return null;
  const a = new Date(starts).getTime();
  const b = new Date(ends).getTime();
  if (b <= a) return null;
  const now = Date.now();
  if (now <= a) return 0;
  if (now >= b) return 100;
  return Math.round(((now - a) / (b - a)) * 100);
}

function formatDateRange(s: Date | null, e: Date | null): string {
  if (!s && !e) return "";
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (s && e) return `${fmt(s)} → ${fmt(e)}`;
  if (s) return `from ${fmt(s)}`;
  return `until ${fmt(e!)}`;
}
