// Pronunciation editor — client component.
//
// Search + add (with optional AI generation) + inline edit/delete. AI hero
// is the gradient "Generate with AI" button on the Add panel — fills the
// phonetic + mnemonic + notes fields with Claude output that the admin can
// edit before saving.

"use client";

import { useState, useTransition } from "react";
import {
  createPronunciation,
  deletePronunciation,
  generatePronunciation,
  updatePronunciation,
} from "@/app/admin/pronunciations/actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { AIBadge } from "@/components/ui/AIBadge";
import { cn } from "@/lib/cn";

type Row = {
  id: string;
  word: string;
  phonetic: string;
  mnemonic: string | null;
  notes: string | null;
  generatedByAi: boolean;
  updatedAt: Date;
};

export function PronunciationEditor({ initial }: { initial: Row[] }) {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = initial.filter((r) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      r.word.toLowerCase().includes(q) ||
      r.phonetic.toLowerCase().includes(q) ||
      (r.mnemonic?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Icon
            name="search"
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search word, phonetic, or hint…"
            className="w-full bg-surface-2 border border-border rounded-md pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </div>
        <Button
          variant="accent"
          size="md"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "Cancel" : "Add pronunciation"}
        </Button>
      </div>

      {/* Add panel */}
      {adding ? (
        <AddPanel
          onDone={() => setAdding(false)}
          existing={initial.map((r) => r.word.toLowerCase())}
        />
      ) : null}

      {/* List */}
      {filtered.length === 0 ? (
        <Card pad="lg">
          <p className="text-[13px] text-ink-2">
            {initial.length === 0
              ? "No pronunciations yet. Add brand names, acronyms, or jargon so the voice Coach says them right."
              : "No entries match your search."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <RowItem
              key={r.id}
              row={r}
              editing={editingId === r.id}
              onStartEdit={() => setEditingId(r.id)}
              onCancel={() => setEditingId(null)}
              onSaved={() => setEditingId(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AddPanel({
  onDone,
  existing,
}: {
  onDone: () => void;
  existing: string[];
}) {
  const [word, setWord] = useState("");
  const [context, setContext] = useState("");
  const [phonetic, setPhonetic] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [notes, setNotes] = useState("");
  const [aiUsed, setAiUsed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function generate() {
    if (!word.trim()) {
      setError("Enter a word first.");
      return;
    }
    setError(null);
    setGenerating(true);
    (async () => {
      try {
        const out = await generatePronunciation({
          word,
          context: context.trim() || undefined,
        });
        setPhonetic(out.phonetic);
        setMnemonic(out.mnemonic);
        setNotes(out.notes);
        setAiUsed(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "AI generation failed");
      } finally {
        setGenerating(false);
      }
    })();
  }

  function save() {
    if (!word.trim() || !phonetic.trim()) {
      setError("Word and phonetic are required.");
      return;
    }
    if (existing.includes(word.trim().toLowerCase())) {
      setError("That word already has a pronunciation. Edit it instead.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await createPronunciation({
          word,
          phonetic,
          mnemonic: mnemonic || undefined,
          notes: notes || undefined,
          generatedByAi: aiUsed,
        });
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <Card pad="md" className="space-y-3 border-accent/30">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <FieldLabel>Word</FieldLabel>
          <input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="e.g. Cyberdyne, MEDDIC"
            maxLength={80}
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[14px] font-semibold focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </div>
        <div className="space-y-1">
          <FieldLabel>Context (optional)</FieldLabel>
          <input
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="e.g. Sales qualification framework"
            maxLength={400}
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[12.5px] focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </div>
      </div>

      {/* AI hero */}
      <button
        type="button"
        onClick={generate}
        disabled={generating || !word.trim()}
        className={cn(
          "w-full inline-flex items-center justify-center gap-2 rounded-md py-2.5",
          "bg-ai-grad text-white text-[13px] font-semibold tracking-[0.01em]",
          "hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <Icon name="ai-sparkle" size={13} />
        {generating ? "Generating…" : "Generate with AI"}
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <FieldLabel>Phonetic</FieldLabel>
            {aiUsed ? <AIBadge>AI</AIBadge> : null}
          </div>
          <input
            value={phonetic}
            onChange={(e) => setPhonetic(e.target.value)}
            placeholder="MED-ick"
            maxLength={200}
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[13px] font-mono focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </div>
        <div className="space-y-1">
          <FieldLabel>Mnemonic (optional)</FieldLabel>
          <input
            value={mnemonic}
            onChange={(e) => setMnemonic(e.target.value)}
            placeholder="Like 'medic' but with two D's."
            maxLength={400}
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </div>
      </div>

      <div className="space-y-1">
        <FieldLabel>Notes (optional)</FieldLabel>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Origin, stress nuance, common mispronunciation."
          rows={2}
          maxLength={600}
          className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[12.5px] resize-none focus:outline-none focus:border-accent"
          suppressHydrationWarning
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="accent"
          size="sm"
          onClick={save}
          disabled={pending || !word.trim() || !phonetic.trim()}
        >
          {pending ? "Saving…" : "Save pronunciation"}
        </Button>
        {error ? (
          <span className="text-[11.5px] text-bad font-mono">{error}</span>
        ) : null}
      </div>
    </Card>
  );
}

function RowItem({
  row,
  editing,
  onStartEdit,
  onCancel,
  onSaved,
}: {
  row: Row;
  editing: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [word, setWord] = useState(row.word);
  const [phonetic, setPhonetic] = useState(row.phonetic);
  const [mnemonic, setMnemonic] = useState(row.mnemonic ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function save() {
    startTransition(async () => {
      // Manual save unsets the AI badge unless nothing changed.
      const unchanged =
        word === row.word &&
        phonetic === row.phonetic &&
        (mnemonic || null) === row.mnemonic &&
        (notes || null) === row.notes;
      await updatePronunciation(row.id, {
        word,
        phonetic,
        mnemonic: mnemonic || undefined,
        notes: notes || undefined,
        generatedByAi: unchanged ? row.generatedByAi : false,
      });
      onSaved();
    });
  }

  function remove() {
    startTransition(async () => {
      await deletePronunciation(row.id);
    });
  }

  if (editing) {
    return (
      <Card pad="md" className="space-y-2 border-accent/30">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[14px] font-semibold focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
          <input
            value={phonetic}
            onChange={(e) => setPhonetic(e.target.value)}
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[13px] font-mono focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </div>
        <input
          value={mnemonic}
          onChange={(e) => setMnemonic(e.target.value)}
          placeholder="Mnemonic"
          className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
          suppressHydrationWarning
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes"
          rows={2}
          className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[12.5px] resize-none focus:outline-none focus:border-accent"
          suppressHydrationWarning
        />
        <div className="flex items-center gap-2">
          <Button
            variant="accent"
            size="sm"
            onClick={save}
            disabled={pending || !word.trim() || !phonetic.trim()}
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
    <Card pad="md" className="flex items-start gap-3 group">
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-[14px]">{row.word}</span>
          <span className="text-ink-3">·</span>
          <span className="font-mono text-[13px] text-accent-strong">
            {row.phonetic}
          </span>
          {row.generatedByAi ? <AIBadge>AI</AIBadge> : null}
        </div>
        {row.mnemonic ? (
          <div className="text-[12.5px] text-ink-2">{row.mnemonic}</div>
        ) : null}
        {row.notes ? (
          <div className="text-[11.5px] text-ink-3">{row.notes}</div>
        ) : null}
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
      {children}
    </div>
  );
}
