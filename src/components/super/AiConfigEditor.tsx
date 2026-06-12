// AI Configuration editor — client form for /super/ai-config.

"use client";

import { useState, useTransition } from "react";
import { savePlatformSettings } from "@/app/super/ai-config/actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AIBadge } from "@/components/ui/AIBadge";
import { cn } from "@/lib/cn";

const MODEL_OPTIONS = [
  { id: "claude-opus-4-7", label: "Opus 4.7 — premium reasoning" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 — balanced" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 — fast & cheap" },
];

export function AiConfigEditor({
  initial,
}: {
  initial: {
    defaultModel: string;
    fastModel: string;
    defaultCoachPersona: string | null;
    defaultCoachGuardrails: string | null;
    maxTokensPerTurn: number;
    monthlySpendCapCents: number;
    notes: string | null;
    updatedAt: Date | null;
  };
}) {
  const [defaultModel, setDefaultModel] = useState(initial.defaultModel);
  const [fastModel, setFastModel] = useState(initial.fastModel);
  const [defaultPersona, setDefaultPersona] = useState(
    initial.defaultCoachPersona ?? "",
  );
  const [defaultGuardrails, setDefaultGuardrails] = useState(
    initial.defaultCoachGuardrails ?? "",
  );
  const [maxTokens, setMaxTokens] = useState(initial.maxTokensPerTurn);
  const [spendCap, setSpendCap] = useState(
    initial.monthlySpendCapCents / 100,
  );
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function save() {
    startTransition(async () => {
      await savePlatformSettings({
        defaultModel,
        fastModel,
        defaultCoachPersona: defaultPersona.trim() || null,
        defaultCoachGuardrails: defaultGuardrails.trim() || null,
        maxTokensPerTurn: maxTokens,
        monthlySpendCapCents: Math.round(spendCap * 100),
        notes: notes.trim() || null,
      });
      setSavedAt(Date.now());
    });
  }

  return (
    <Card pad="lg" className="space-y-5">
      {/* Models */}
      <section className="space-y-3">
        <SectionLabel>Models</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field
            label="Default model (Copilot, Coach, Roleplay)"
            hint="Used for chat, persona, and the Admin / Platform Copilot. Higher quality."
          >
            <select
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              className={inputCls}
              suppressHydrationWarning
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Fast model (Scoring, Generate)"
            hint="Used for rubric scoring + structured generation. Cheap and deterministic."
          >
            <select
              value={fastModel}
              onChange={(e) => setFastModel(e.target.value)}
              className={inputCls}
              suppressHydrationWarning
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="text-[11px] text-ink-3 font-mono bg-surface-2 border border-border rounded-md p-2.5">
          Resolution order:{" "}
          <span className="text-ink">ANTHROPIC_MODEL</span> /{" "}
          <span className="text-ink">ANTHROPIC_MODEL_FAST</span> env vars (if
          set) → these DB defaults → hard-coded fallback. Save flows to all AI
          call sites on the next request.
        </div>
      </section>

      {/* Coach defaults */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <SectionLabel>Coach defaults</SectionLabel>
          <AIBadge>Tenant override</AIBadge>
        </div>
        <p className="text-[11.5px] text-ink-3 -mt-1">
          Platform-wide voice + guardrails. Tenants override via{" "}
          <span className="font-mono">/admin/global-bot</span>; both layers
          combine in the Coach prompt.
        </p>
        <Field label="Default persona">
          <textarea
            value={defaultPersona}
            onChange={(e) => setDefaultPersona(e.target.value)}
            placeholder="Warm, direct, evidence-based. Default UPnRise coach voice."
            rows={4}
            maxLength={2000}
            className={cn(inputCls, "resize-none")}
            suppressHydrationWarning
          />
        </Field>
        <Field label="Default guardrails">
          <textarea
            value={defaultGuardrails}
            onChange={(e) => setDefaultGuardrails(e.target.value)}
            placeholder="Never praise weak performance. Stay on training topics. Don't expose internal IDs."
            rows={4}
            maxLength={2000}
            className={cn(inputCls, "resize-none")}
            suppressHydrationWarning
          />
        </Field>
      </section>

      {/* Spend / token caps */}
      <section className="space-y-3">
        <SectionLabel>Limits</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field
            label="Max tokens per turn"
            hint="Hard cap for any single Claude call. 700 is a good chat default."
          >
            <input
              type="number"
              min={100}
              max={8000}
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className={cn(inputCls, "font-mono")}
              suppressHydrationWarning
            />
          </Field>
          <Field
            label="Monthly spend cap per tenant ($)"
            hint="Soft cap. Tenants over this surface in the Credits & Billing alert row."
          >
            <input
              type="number"
              min={0}
              value={spendCap}
              onChange={(e) => setSpendCap(Number(e.target.value))}
              className={cn(inputCls, "font-mono")}
              suppressHydrationWarning
            />
          </Field>
        </div>
      </section>

      {/* Notes */}
      <Field
        label="Operator notes"
        hint="Internal — visible to other super admins."
      >
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          className={cn(inputCls, "resize-none")}
          suppressHydrationWarning
        />
      </Field>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
        {savedAt ? (
          <span className="text-[11.5px] text-good font-mono">
            Saved · changes propagate on next AI request
          </span>
        ) : initial.updatedAt ? (
          <span className="text-[11.5px] text-ink-3 font-mono">
            Last updated {new Date(initial.updatedAt).toLocaleString()}
          </span>
        ) : null}
        <Button variant="accent" size="md" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </Card>
  );
}

const inputCls =
  "w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        {label}
      </span>
      {hint ? (
        <span className="block text-[11.5px] text-ink-3 font-normal -mt-0.5">
          {hint}
        </span>
      ) : null}
      {children}
    </label>
  );
}
