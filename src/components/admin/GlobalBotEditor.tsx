// GlobalBotEditor — tabbed client UI for /admin/global-bot.
//
// Header + 3-card KPI strip + 4-tab nav (Persona & tone / Guardrails /
// Knowledge base / Live chat). The Persona and Guardrails tabs preserve
// the original textarea editors with the live system-prompt preview rail.
//
// KB tab is read-only (a real CRUD lives at /admin/trainings/[id]/edit).
// Live chat tab is a documented placeholder — we don't persist Coach
// conversations yet.

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { saveGlobalBot } from "@/app/admin/global-bot/actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { AIBadge } from "@/components/ui/AIBadge";
import { cn } from "@/lib/cn";

type Initial = {
  companyName: string;
  botPersona: string | null;
  botGuardrails: string | null;
  botTagline: string | null;
};

type Stats = {
  kbCount: number;
  glossaryCount: number;
  overrideCount: number;
  conversations7d: number;
  helpfulPct: number | null; // null when no rated conversations yet
  flaggedOpen: number;
};

type KbSourceRow = {
  id: string;
  name: string;
  kind: "pdf" | "doc" | "url" | "text";
  status: "uploading" | "indexing" | "ready" | "failed";
  size: number | null;
  createdAt: Date;
  training: { id: string; title: string } | null;
};

type Tab = "persona" | "guardrails" | "kb" | "live";

const TABS: Array<{
  key: Tab;
  label: string;
  icon: IconName;
}> = [
  { key: "persona", label: "Persona & tone", icon: "message" },
  { key: "guardrails", label: "Guardrails", icon: "shield" },
  { key: "kb", label: "Knowledge base", icon: "book" },
  { key: "live", label: "Live chat", icon: "activity" },
];

const PLATFORM_DEFAULTS = {
  tagline: "Personalized to your sessions. Always learning.",
  persona:
    "Warm, direct, and grounded in the learner's actual practice. Speaks like a senior peer, not a manager.",
  guardrails:
    "Don't praise weak performance. Default to 2-3 sentence replies. Stay on training-related topics.",
};

export function GlobalBotEditor({
  initial,
  stats,
  kbSources,
}: {
  initial: Initial;
  stats: Stats;
  kbSources: KbSourceRow[];
}) {
  const [tab, setTab] = useState<Tab>("persona");
  const [persona, setPersona] = useState(initial.botPersona ?? "");
  const [guardrails, setGuardrails] = useState(initial.botGuardrails ?? "");
  const [tagline, setTagline] = useState(initial.botTagline ?? "");
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function save() {
    startTransition(async () => {
      await saveGlobalBot({
        botPersona: persona.trim() || null,
        botGuardrails: guardrails.trim() || null,
        botTagline: tagline.trim() || null,
      });
      setSavedAt(Date.now());
    });
  }

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
          Global Bot
        </h1>
        <p className="text-ink-2 text-[13.5px] max-w-[700px] leading-[1.5]">
          Org-wide AI assistant — persona, guardrails, knowledge base, and
          how it talks to {initial.companyName} trainees. Tenant overrides
          layer on top of the platform defaults.
        </p>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-[14px]">
        <KpiTile
          label="Conversations · 7d"
          value={String(stats.conversations7d)}
          sub={
            stats.conversations7d === 0
              ? "no chats this week"
              : stats.conversations7d === 1
                ? "one learner chat"
                : "rolling weekly volume"
          }
          icon="message"
          tone="accent"
        />
        <KpiTile
          label="Helpful rating"
          value={
            stats.helpfulPct == null ? "—" : `${stats.helpfulPct}%`
          }
          sub={
            stats.helpfulPct == null
              ? "no ratings yet"
              : stats.helpfulPct >= 80
                ? "healthy band"
                : "room to improve"
          }
          icon="trophy"
          tone={
            stats.helpfulPct == null || stats.helpfulPct >= 80
              ? "good"
              : "warn"
          }
        />
        <KpiTile
          label="KB documents"
          value={String(stats.kbCount)}
          sub={
            stats.kbCount > 0 ? "across your trainings" : "none yet"
          }
          icon="book"
          tone="violet"
        />
        <KpiTile
          label="Glossary terms"
          value={String(stats.glossaryCount)}
          sub={
            stats.glossaryCount > 0
              ? "used to ground answers"
              : "none yet"
          }
          icon="layers"
          tone="good"
        />
        <KpiTile
          label="Flagged open"
          value={String(stats.flaggedOpen)}
          sub={
            stats.flaggedOpen === 0
              ? "queue is clean"
              : stats.flaggedOpen === 1
                ? "one needs review"
                : "needs review"
          }
          icon="alert"
          tone={stats.flaggedOpen > 0 ? "warn" : "good"}
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-[10px] text-[13px] -mb-px border-b-2 whitespace-nowrap transition-colors",
                active
                  ? "border-accent text-ink font-semibold"
                  : "border-transparent text-ink-2 hover:text-ink",
              )}
            >
              <Icon name={t.icon} size={12} />
              {t.label}
              {t.key === "kb" && stats.kbCount > 0 ? (
                <span className="text-[11px] font-mono text-ink-3">
                  {stats.kbCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === "persona" ? (
        <PersonaTab
          tagline={tagline}
          setTagline={setTagline}
          persona={persona}
          setPersona={setPersona}
          companyName={initial.companyName}
          pending={pending}
          savedAt={savedAt}
          onSave={save}
        />
      ) : null}

      {tab === "guardrails" ? (
        <GuardrailsTab
          guardrails={guardrails}
          setGuardrails={setGuardrails}
          companyName={initial.companyName}
          pending={pending}
          savedAt={savedAt}
          onSave={save}
        />
      ) : null}

      {tab === "kb" ? <KnowledgeBaseTab sources={kbSources} /> : null}

      {tab === "live" ? <LiveChatTab /> : null}
    </div>
  );
}

// ─────────────── Persona & tone tab ───────────────

function PersonaTab({
  tagline,
  setTagline,
  persona,
  setPersona,
  companyName,
  pending,
  savedAt,
  onSave,
}: {
  tagline: string;
  setTagline: (v: string) => void;
  persona: string;
  setPersona: (v: string) => void;
  companyName: string;
  pending: boolean;
  savedAt: number | null;
  onSave: () => void;
}) {
  const previewTagline = tagline.trim() || PLATFORM_DEFAULTS.tagline;
  const previewPersona = persona.trim() || PLATFORM_DEFAULTS.persona;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-4">
        <Card pad="lg" className="space-y-4 rounded-[12px]">
          <Field
            label="Tagline"
            hint="One line shown under the AI Coach name in the drawer header."
          >
            <input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder={PLATFORM_DEFAULTS.tagline}
              maxLength={200}
              className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[13.5px] focus:outline-none focus:border-accent"
              suppressHydrationWarning
            />
          </Field>
          <Field
            label="Persona"
            hint="Voice and tone the coach uses. Becomes part of the system prompt for every trainee chat."
          >
            <textarea
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder={PLATFORM_DEFAULTS.persona}
              rows={6}
              maxLength={1500}
              className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent resize-none"
              suppressHydrationWarning
            />
            <CharCount value={persona} max={1500} />
          </Field>

          <SaveRow pending={pending} savedAt={savedAt} onSave={onSave} />
        </Card>
      </div>

      <div className="space-y-4">
        <Card pad="md" className="space-y-3 rounded-[12px]">
          <SectionLabel>Trainee preview</SectionLabel>
          <div className="rounded-md border border-border bg-surface-2 p-3">
            <div className="flex items-center gap-2">
              <Icon name="ai-sparkle" size={14} className="text-accent" />
              <div className="flex flex-col leading-tight">
                <span className="text-[13.5px] font-semibold">AI Coach</span>
                <span className="text-[11.5px] text-ink-3">
                  {previewTagline}
                </span>
              </div>
            </div>
          </div>
          <p className="text-[11.5px] text-ink-3 leading-snug">
            This appears in every trainee's drawer header at{" "}
            <code className="font-mono">/learn/*</code>.
          </p>
        </Card>

        <Card pad="md" className="space-y-3 rounded-[12px]">
          <div className="flex items-center gap-2">
            <SectionLabel>System prompt fragment</SectionLabel>
            <AIBadge>Live</AIBadge>
          </div>
          <pre className="text-[11px] font-mono text-ink-2 bg-surface-2 border border-border rounded-md p-3 whitespace-pre-wrap leading-snug">
            {`## Voice\n${previewPersona}`}
          </pre>
          <p className="text-[11.5px] text-ink-3 leading-snug">
            Woven into the coach prompt for every {companyName} trainee.
            Updates apply on the next message — no restart needed.
          </p>
        </Card>
      </div>
    </div>
  );
}

// ─────────────── Guardrails tab ───────────────

function GuardrailsTab({
  guardrails,
  setGuardrails,
  companyName,
  pending,
  savedAt,
  onSave,
}: {
  guardrails: string;
  setGuardrails: (v: string) => void;
  companyName: string;
  pending: boolean;
  savedAt: number | null;
  onSave: () => void;
}) {
  const preview = guardrails.trim() || PLATFORM_DEFAULTS.guardrails;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2">
        <Card pad="lg" className="space-y-4 rounded-[12px]">
          <Field
            label="Guardrails"
            hint="Topics to avoid, response constraints, and house-style rules. Layered above the platform safety defaults."
          >
            <textarea
              value={guardrails}
              onChange={(e) => setGuardrails(e.target.value)}
              placeholder={PLATFORM_DEFAULTS.guardrails}
              rows={10}
              maxLength={1500}
              className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent resize-none"
              suppressHydrationWarning
            />
            <CharCount value={guardrails} max={1500} />
          </Field>

          <SaveRow pending={pending} savedAt={savedAt} onSave={onSave} />
        </Card>
      </div>

      <div className="space-y-4">
        <Card pad="md" className="space-y-3 rounded-[12px]">
          <div className="flex items-center gap-2">
            <SectionLabel>System prompt fragment</SectionLabel>
            <AIBadge>Live</AIBadge>
          </div>
          <pre className="text-[11px] font-mono text-ink-2 bg-surface-2 border border-border rounded-md p-3 whitespace-pre-wrap leading-snug">
            {`## Guardrails\n${preview}`}
          </pre>
          <p className="text-[11.5px] text-ink-3 leading-snug">
            Applied for every {companyName} trainee chat. Platform safety
            guardrails always apply on top.
          </p>
        </Card>
      </div>
    </div>
  );
}

// ─────────────── Knowledge base tab ───────────────

function KnowledgeBaseTab({ sources }: { sources: KbSourceRow[] }) {
  return (
    <Card pad="md" className="space-y-3 rounded-[12px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionLabel>Knowledge sources</SectionLabel>
          <p className="text-[12px] text-ink-3 mt-0.5 max-w-[560px]">
            Documents indexed for the Coach to ground answers in. Managed
            per-training at{" "}
            <Link
              href="/admin/trainings"
              className="text-accent underline"
            >
              Trainings
            </Link>
            .
          </p>
        </div>
      </div>

      {sources.length === 0 ? (
        <div className="bg-surface-2 border border-border rounded-md p-5 text-[13px] text-ink-2">
          No knowledge sources yet. The Coach will fall back to general
          training context. Upload docs in a training's edit page to seed
          the KB.
        </div>
      ) : (
        <table className="w-full text-[13px]">
          <thead className="bg-surface-2 border-b border-border">
            <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
              <th className="px-3 py-[10px]">Document</th>
              <th className="px-3 py-[10px]">Kind</th>
              <th className="px-3 py-[10px]">Status</th>
              <th className="px-3 py-[10px]">Training</th>
              <th className="px-3 py-[10px] text-right">Added</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr
                key={s.id}
                className="border-b border-border last:border-b-0 hover:bg-surface-2"
              >
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <KindIcon kind={s.kind} />
                    <span className="font-semibold text-ink truncate">
                      {s.name}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                    {s.kind}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <KbStatusPill status={s.status} />
                </td>
                <td className="px-3 py-3">
                  {s.training ? (
                    <Link
                      href={`/admin/trainings/${s.training.id}/edit`}
                      className="text-[12.5px] text-ink-2 hover:text-ink hover:underline truncate"
                    >
                      {s.training.title}
                    </Link>
                  ) : (
                    <span className="text-[12.5px] text-ink-3 italic">
                      Library
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-right font-mono text-[11.5px] text-ink-3 whitespace-nowrap">
                  {s.createdAt.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function KindIcon({ kind }: { kind: "pdf" | "doc" | "url" | "text" }) {
  const cls =
    kind === "pdf"
      ? "bg-bad text-white"
      : kind === "doc"
        ? "bg-[#2563eb] text-white"
        : kind === "text"
          ? "bg-ink-3 text-white"
          : "bg-[#7c5cd6] text-white";
  return (
    <span
      className={cn(
        "w-6 h-6 grid place-items-center rounded-[5px] text-[8.5px] font-bold uppercase tracking-[0.04em] shrink-0",
        cls,
      )}
    >
      {kind}
    </span>
  );
}

function KbStatusPill({
  status,
}: {
  status: "uploading" | "indexing" | "ready" | "failed";
}) {
  const map = {
    uploading: { label: "Uploading", cls: "bg-surface-2 text-ink-2 border-border" },
    indexing: { label: "Indexing", cls: "bg-warn-pale text-warn border-warn/20" },
    ready: { label: "Ready", cls: "bg-good-pale text-good border-good/20" },
    failed: { label: "Failed", cls: "bg-bad-pale text-bad border-bad/20" },
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

// ─────────────── Live chat tab ───────────────

function LiveChatTab() {
  return (
    <Card pad="lg" className="rounded-[12px] flex items-start gap-3">
      <div
        className="w-9 h-9 rounded-md grid place-items-center text-white shrink-0"
        style={{ background: "var(--ai-grad)" }}
        aria-hidden
      >
        <Icon name="ai-sparkle" size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-[14px] text-ink">
          Live conversations stream isn&apos;t wired yet
        </h3>
        <p className="text-[12.5px] text-ink-2 mt-1.5 leading-[1.55] max-w-[680px]">
          Per-trainee Coach sessions aren&apos;t persisted as a
          Conversation model yet — the Coach drawer is stateful per
          browser. When we land conversation storage, this tab will show
          live transcripts (with privacy controls), helpful-rating
          rollups, and the per-zone breakdown the prototype shows.
        </p>
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

function SaveRow({
  pending,
  savedAt,
  onSave,
}: {
  pending: boolean;
  savedAt: number | null;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-3 pt-1">
      {savedAt ? (
        <span className="text-[11.5px] text-good font-mono">
          Saved · trainees see the change on their next message
        </span>
      ) : null}
      <Button variant="accent" size="md" onClick={onSave} disabled={pending}>
        {pending ? "Saving…" : "Save config"}
      </Button>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        {label}
      </span>
      <span className="block text-[11.5px] text-ink-3 font-normal -mt-0.5">
        {hint}
      </span>
      {children}
    </label>
  );
}

function CharCount({ value, max }: { value: string; max: number }) {
  return (
    <div className="text-[10.5px] font-mono text-ink-3 text-right">
      {value.length} / {max}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
      {children}
    </div>
  );
}
