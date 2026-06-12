// Dictionary editor — client component.
//
// Header + 3-card KPI strip + search/add/Generate row + alphabetical term
// list. Each term card shows: bigger display-font term, definition,
// updated-ago footer, and a "Has pronunciation" cross-link chip when the
// term matches a Pronunciation row.

"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  createTerm,
  deleteTerm,
  updateTerm,
} from "@/app/admin/dictionary/actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type Term = {
  id: string;
  term: string;
  definition: string;
  updatedAt: Date;
};

export function DictionaryEditor({
  initial,
  pronunciationSet,
}: {
  initial: Term[];
  pronunciationSet: string[];
}) {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newTerm, setNewTerm] = useState("");
  const [newDef, setNewDef] = useState("");
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pronSet = useMemo(
    () => new Set(pronunciationSet.map((p) => p.toLowerCase())),
    [pronunciationSet],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return initial;
    return initial.filter(
      (t) =>
        t.term.toLowerCase().includes(q) ||
        t.definition.toLowerCase().includes(q),
    );
  }, [initial, search]);

  const withPronunciation = useMemo(
    () => initial.filter((t) => pronSet.has(t.term.toLowerCase())).length,
    [initial, pronSet],
  );

  const updatedThisWeek = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return initial.filter((t) => +new Date(t.updatedAt) >= cutoff).length;
  }, [initial]);

  function add() {
    if (!newTerm.trim() || !newDef.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await createTerm({ term: newTerm, definition: newDef });
        setNewTerm("");
        setNewDef("");
        setAdding(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
          Dictionary
        </h1>
        <p className="text-ink-2 text-[13.5px] max-w-[680px] leading-[1.5]">
          Your team&apos;s vocabulary. Grounds the AI Coach in your house
          language and seeds the trainee glossary at{" "}
          <Link href="/learn/dictionary" className="text-accent underline">
            /learn/dictionary
          </Link>
          .
        </p>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[14px]">
        <KpiTile
          label="Total terms"
          value={String(initial.length)}
          sub={
            initial.length > 0
              ? "grounding every Coach reply"
              : "none yet"
          }
          icon="book"
          tone="accent"
        />
        <KpiTile
          label="With pronunciation"
          value={`${withPronunciation} / ${Math.max(initial.length, 1)}`}
          sub={
            initial.length > 0 && withPronunciation < initial.length ? (
              <Link
                href="/admin/pronunciations"
                className="text-accent-strong hover:underline"
              >
                {initial.length - withPronunciation} unmapped → fix
              </Link>
            ) : initial.length > 0 ? (
              "all mapped"
            ) : (
              "—"
            )
          }
          icon="mic"
          tone="violet"
        />
        <KpiTile
          label="Updated this week"
          value={String(updatedThisWeek)}
          sub={
            updatedThisWeek > 0
              ? "recent edits"
              : "no changes this week"
          }
          icon="activity"
          tone="good"
        />
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 relative min-w-[260px]">
          <Icon
            name="search"
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search terms or definitions"
            className="w-full bg-surface-2 border border-border rounded-[9px] pl-9 pr-3 py-[8px] text-[13px] focus:outline-none focus:border-border-strong placeholder:text-ink-3"
            suppressHydrationWarning
          />
        </div>
        <Link
          href="/admin/generate"
          className={cn(
            "inline-flex items-center gap-1.5 px-[14px] py-[8px] rounded-[8px]",
            "bg-surface border border-border-strong text-accent-strong text-[12.5px] font-semibold",
            "hover:bg-accent-pale",
          )}
        >
          <Icon name="ai-sparkle" size={12} />
          Generate with AI
        </Link>
        <Button
          variant="default"
          size="md"
          onClick={() => setAdding((v) => !v)}
          disabled={pending}
        >
          {adding ? "Cancel" : "+ Add term"}
        </Button>
      </div>

      {/* Add panel */}
      {adding ? (
        <Card pad="md" className="space-y-3 rounded-[12px] border-accent/30">
          <Field label="Term">
            <input
              value={newTerm}
              onChange={(e) => setNewTerm(e.target.value)}
              placeholder="e.g. BANT"
              maxLength={80}
              className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[14px] font-semibold focus:outline-none focus:border-accent"
              suppressHydrationWarning
            />
          </Field>
          <Field label="Definition">
            <textarea
              value={newDef}
              onChange={(e) => setNewDef(e.target.value)}
              placeholder="1-2 sentences. Concrete, no fluff."
              rows={3}
              maxLength={1000}
              className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent resize-none"
              suppressHydrationWarning
            />
          </Field>
          <div className="flex items-center gap-2">
            <Button
              variant="accent"
              size="sm"
              onClick={add}
              disabled={pending || !newTerm.trim() || !newDef.trim()}
            >
              {pending ? "Saving…" : "Save term"}
            </Button>
            {error ? (
              <span className="text-[11.5px] text-bad font-mono">{error}</span>
            ) : null}
          </div>
        </Card>
      ) : null}

      {/* Term list */}
      {filtered.length === 0 ? (
        <Card pad="lg" className="rounded-[12px]">
          <h2 className="font-display text-[20px]">
            {initial.length === 0
              ? "No terms yet"
              : `No matches for "${search}"`}
          </h2>
          <p className="text-ink-2 text-[13px] mt-2">
            {initial.length === 0
              ? "Add your team's vocabulary so trainees and the AI Coach use it consistently. Bulk-generate from a brief via Generate with AI."
              : "Try a different search or clear the filter."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <Row
              key={t.id}
              t={t}
              hasPronunciation={pronSet.has(t.term.toLowerCase())}
              editing={editingId === t.id}
              onStartEdit={() => setEditingId(t.id)}
              onCancel={() => setEditingId(null)}
              onSaved={() => setEditingId(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  t,
  hasPronunciation,
  editing,
  onStartEdit,
  onCancel,
  onSaved,
}: {
  t: Term;
  hasPronunciation: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [term, setTerm] = useState(t.term);
  const [def, setDef] = useState(t.definition);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function save() {
    startTransition(async () => {
      await updateTerm(t.id, { term, definition: def });
      onSaved();
    });
  }

  function remove() {
    startTransition(async () => {
      await deleteTerm(t.id);
    });
  }

  if (editing) {
    return (
      <Card pad="md" className="space-y-3 rounded-[12px] border-accent/30">
        <Field label="Term">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[14px] font-semibold focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </Field>
        <Field label="Definition">
          <textarea
            value={def}
            onChange={(e) => setDef(e.target.value)}
            rows={4}
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent resize-none"
            suppressHydrationWarning
          />
        </Field>
        <div className="flex items-center gap-2">
          <Button
            variant="accent"
            size="sm"
            onClick={save}
            disabled={pending || !term.trim() || !def.trim()}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      pad="md"
      className="group flex items-start gap-3 rounded-[12px] hover:border-border-strong transition-colors"
    >
      {/* Letter marker — small initial chip for visual rhythm */}
      <div
        className="w-9 h-9 rounded-[10px] grid place-items-center bg-surface-2 text-ink-2 shrink-0"
        aria-hidden
      >
        <span className="font-display text-[15px] leading-none">
          {t.term.charAt(0).toUpperCase()}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-display text-[18px] leading-tight -tracking-[0.005em] text-ink">
            {t.term}
          </h3>
          {hasPronunciation ? (
            <Link
              href="/admin/pronunciations"
              className={cn(
                "inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.08em]",
                "px-[7px] py-[2px] rounded-sm border",
                "bg-[#ede9fe] text-[#6d4ad9] border-[#d6c9f1]",
                "hover:underline",
              )}
              title="Click to manage pronunciation"
            >
              <Icon name="mic" size={10} />
              Pronunciation
            </Link>
          ) : null}
        </div>
        <p className="text-[13px] text-ink-2 mt-1 leading-[1.55]">
          {t.definition}
        </p>
        <div className="text-[10.5px] font-mono text-ink-3 mt-2">
          Updated {fmtAgo(new Date(t.updatedAt))}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onStartEdit}
          className="text-[12px] text-ink-2 hover:text-ink px-2 py-1 rounded-md hover:bg-surface-2"
        >
          Edit
        </button>
        {confirmDelete ? (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className={cn(
              "text-[12px] font-semibold text-white px-2 py-1 rounded-md bg-bad hover:bg-bad/90",
              "disabled:opacity-50",
            )}
          >
            {pending ? "…" : "Confirm"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="text-[12px] text-ink-3 hover:text-bad px-2 py-1 rounded-md hover:bg-bad-pale"
          >
            Delete
          </button>
        )}
      </div>
    </Card>
  );
}

// ─────────────── KPI tile ───────────────

function KpiTile({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub: React.ReactNode;
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

function fmtAgo(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
