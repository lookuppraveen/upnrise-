// /admin/trainings/[id]/modules/new/roleplay
//
// "Create New Roleplay Module" intermediate screen. Sits between the
// "+ Add New Module → Roleplay" dropdown click and the per-module edit
// page so the admin can describe the scenario in plain English (Person
// 1, Person 2, Context & Situation) before the module is persisted.
//
//   - "Create Manually" → server action persists with literal inputs,
//     routes to the edit page.
//   - "Generate"        → POST /api/admin/create-roleplay/generate to
//     have AI enrich the persona + scenario from the brief, then route.
//   - "Use Template"    → opens a picker of starter scenarios that
//     populate Person 1, Person 2, and the brief.
//   - "+"               → clear the textarea.

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createRoleplayModule } from "@/app/admin/trainings/actions";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import {
  RoleplayTemplatePickerModal,
  type RoleplayTemplate,
} from "./RoleplayTemplatePickerModal";

type PersonPair = { person1: string; person2: string; reason: string };

const TEMPLATE = `Create a roleplay between {Person 1} (Human) & {Person 2} (AI) based on the following:

Industry / Domain:
{e.g. Pharmaceutical, B2B SaaS, Financial Services}`;

export function CreateRoleplayPage({
  trainingId,
  trainingTitle,
}: {
  trainingId: string;
  trainingTitle: string;
}) {
  const [person1, setPerson1] = useState("");
  const [person2, setPerson2] = useState("");
  const [context, setContext] = useState(TEMPLATE);
  const [pending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [pairs, setPairs] = useState<PersonPair[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const router = useRouter();

  const busy = pending || generating || enhancing || suggesting;

  function createManually() {
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await createRoleplayModule(trainingId, {
          person1,
          person2,
          context,
        });
        toast.success("Module created");
        router.push(`/admin/trainings/${trainingId}/modules/${id}/edit`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to create module";
        setError(msg);
        toast.error("Create failed", msg);
      }
    });
  }

  async function generate() {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/create-roleplay/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainingId, person1, person2, context }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          issues?: { fieldErrors?: Record<string, string[]> };
        };
        const fields = data.issues?.fieldErrors;
        const detail = fields
          ? Object.entries(fields)
              .flatMap(([k, vs]) => (vs ?? []).map((v) => `${k}: ${v}`))
              .join("; ")
          : "";
        throw new Error(
          [data.error, detail].filter(Boolean).join(" — ") ||
            `request failed: ${res.status}`,
        );
      }
      const { id } = (await res.json()) as { id: string };
      toast.success("AI draft created");
      router.push(`/admin/trainings/${trainingId}/modules/${id}/edit`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      setError(msg);
      toast.error("Generate failed", msg);
    } finally {
      setGenerating(false);
    }
  }

  async function suggestPersons() {
    setError(null);
    setSuggesting(true);
    try {
      const res = await fetch("/api/admin/create-roleplay/suggest-persons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainingId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `suggest failed: ${res.status}`);
      }
      const data = (await res.json()) as { pairs: PersonPair[] };
      setPairs(data.pairs);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      setError(msg);
      toast.error("Suggest failed", msg);
    } finally {
      setSuggesting(false);
    }
  }

  function applyPair(p: PersonPair) {
    setPerson1(p.person1);
    setPerson2(p.person2);
    setPairs(null);
  }

  function applyTemplate(t: RoleplayTemplate) {
    setPerson1(t.person1);
    setPerson2(t.person2);
    setContext(t.context);
    setTemplatePickerOpen(false);
    toast.success("Template applied", t.title);
  }

  async function enhanceBrief() {
    setError(null);
    setEnhancing(true);
    try {
      const res = await fetch("/api/admin/create-roleplay/enhance-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainingId, person1, person2, context }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `enhance failed: ${res.status}`);
      }
      const data = (await res.json()) as { context: string };
      setContext(data.context);
      toast.success("Brief enhanced");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      setError(msg);
      toast.error("Enhance failed", msg);
    } finally {
      setEnhancing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Edit Training header */}
      <h1 className="font-display text-[22px] text-accent">
        Edit Training -{" "}
        <span className="font-semibold">{trainingTitle}</span>
      </h1>

      {/* Back link + Create Manually */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/admin/trainings/${trainingId}/edit?step=2`}
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink"
        >
          <Icon name="chevron-right" size={12} className="rotate-180" />
          Back to Modules
        </Link>
        <button
          type="button"
          onClick={createManually}
          disabled={busy}
          suppressHydrationWarning
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-accent text-accent text-[12.5px] font-semibold hover:bg-accent-pale/30 disabled:opacity-60"
        >
          <Icon name="wand" size={11} />
          Create Manually
        </button>
      </div>

      {/* Title */}
      <div className="text-center">
        <h2 className="font-display text-[26px] leading-tight">
          Create New{" "}
          <span className="text-accent">Roleplay</span> Module
        </h2>
      </div>

      {/* Form card */}
      <div className="bg-surface border border-border rounded-[12px] p-5 md:p-6 space-y-5">
        {/* AI Suggest Persons row */}
        <div
          className="flex items-start gap-3 flex-wrap rounded-[10px] border px-3 py-2.5"
          style={{
            background:
              "linear-gradient(120deg, rgba(124,92,214,0.08) 0%, rgba(255,124,82,0.08) 100%)",
            borderColor: "rgba(124,92,214,0.30)",
          }}
        >
          <div className="flex items-center gap-2 shrink-0">
            <div
              className="w-7 h-7 grid place-items-center rounded-md text-white"
              style={{ background: "var(--ai-grad, #7c5cd6)" }}
              aria-hidden
            >
              <Icon name="ai-sparkle" size={12} />
            </div>
            <div className="text-[12.5px] font-semibold text-ink">
              Need ideas?
            </div>
          </div>
          <button
            type="button"
            onClick={suggestPersons}
            disabled={busy}
            suppressHydrationWarning
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-ink text-white text-[11.5px] font-semibold hover:bg-[#2a2a2a] disabled:opacity-60"
          >
            <Icon name="ai-sparkle" size={10} />
            {suggesting ? "Thinking…" : "AI Suggest Persons"}
          </button>
          {pairs && pairs.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap basis-full">
              {pairs.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => applyPair(p)}
                  disabled={busy}
                  suppressHydrationWarning
                  title={p.reason}
                  className={cn(
                    "inline-flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1.5 rounded-md border",
                    "border-[#c9b8f0] bg-[#f3eafa] text-[#6d4ad9] hover:bg-[#ead9f8] disabled:opacity-60",
                  )}
                >
                  {p.person1} × {p.person2}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Person 1 (Human)">
            <input
              type="text"
              value={person1}
              onChange={(e) => setPerson1(e.target.value)}
              placeholder="Ex: Sales Rep"
              className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent"
              suppressHydrationWarning
            />
          </Field>
          <Field label="Person 2 (AI)">
            <input
              type="text"
              value={person2}
              onChange={(e) => setPerson2(e.target.value)}
              placeholder="Ex: Doctor"
              className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent"
              suppressHydrationWarning
            />
          </Field>
        </div>

        <Field label="Context & Situation">
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={7}
            className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent resize-y font-mono leading-relaxed"
            suppressHydrationWarning
          />
        </Field>

        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setContext("")}
              aria-label="Clear context"
              suppressHydrationWarning
              className="w-9 h-9 grid place-items-center rounded-full border border-border bg-surface text-ink-3 hover:text-ink"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setTemplatePickerOpen(true)}
              disabled={busy}
              suppressHydrationWarning
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-strong disabled:opacity-60"
            >
              <Icon name="layers" size={11} />
              Use Template
            </button>
            <button
              type="button"
              onClick={enhanceBrief}
              disabled={busy}
              suppressHydrationWarning
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#c9b8f0] bg-[#f3eafa] text-[#6d4ad9] text-[12.5px] font-semibold hover:bg-[#ead9f8] disabled:opacity-60"
            >
              <Icon name="ai-sparkle" size={11} />
              {enhancing ? "Enhancing…" : "Enhance Brief"}
            </button>
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            suppressHydrationWarning
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-strong disabled:opacity-60"
          >
            <Icon name="ai-sparkle" size={11} />
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>

        {error ? (
          <p className="text-[11.5px] text-bad font-mono">{error}</p>
        ) : null}
      </div>

      {templatePickerOpen ? (
        <RoleplayTemplatePickerModal
          onSelect={applyTemplate}
          onClose={() => setTemplatePickerOpen(false)}
        />
      ) : null}
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
    <label className="block space-y-1.5">
      <span className="block text-[12.5px] font-semibold text-ink">{label}</span>
      {children}
    </label>
  );
}
