// Client UI for tenant-scoped chat-LLM provider configs. Mirrors
// VideoProvidersManager but leaner — no avatar/portrait pickers, just
// key + model overrides.

"use client";

import { useState, useTransition } from "react";
import {
  createLlmProvider,
  deleteLlmProvider,
  setDefaultLlmProvider,
  testLlmProvider,
  updateLlmProvider,
} from "@/app/admin/llm-providers/actions";
import type { LlmProviderKind } from "@prisma/client";
import {
  LLM_DEFAULT_BASE_URL,
  LLM_DEFAULT_FAST_MODEL,
  LLM_DEFAULT_MODEL,
  LLM_PROVIDER_DESCRIPTION,
  LLM_PROVIDER_KINDS,
  LLM_PROVIDER_LABEL,
} from "@/lib/ai/llm-constants";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type ProviderRow = {
  id: string;
  kind: LlmProviderKind;
  label: string | null;
  apiKeyPreview: string;
  baseUrl: string | null;
  defaultModel: string | null;
  fastModel: string | null;
  isDefault: boolean;
  createdAt: string;
};

export function LlmProvidersManager({
  providers,
  envFallbackKinds = [],
}: {
  providers: ProviderRow[];
  envFallbackKinds?: LlmProviderKind[];
}) {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
          Configured ({providers.length})
        </div>
        {providers.length === 0 ? (
          <div className="bg-surface border border-border rounded-[12px] p-8 text-center">
            <div className="w-12 h-12 rounded-[10px] bg-surface-2 text-ink-3 grid place-items-center mx-auto">
              <Icon name="ai-sparkle" size={18} />
            </div>
            <h3 className="font-display text-[18px] mt-3 text-ink">
              No providers configured yet
            </h3>
            <p className="text-[13px] text-ink-2 mt-1 max-w-[420px] mx-auto leading-[1.55]">
              Add your first LLM provider below. Anthropic (Claude) is the
              recommended default; Sarvam is available for Indic-language
              text generation.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {providers.map((p) => (
              <ProviderCard key={p.id} provider={p} />
            ))}
          </ul>
        )}
      </section>

      <AddProviderCard envFallbackKinds={envFallbackKinds} />
    </div>
  );
}

function ProviderCard({ provider }: { provider: ProviderRow }) {
  const [label, setLabel] = useState(provider.label ?? "");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? "");
  const [defaultModel, setDefaultModel] = useState(provider.defaultModel ?? "");
  const [fastModel, setFastModel] = useState(provider.fastModel ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [testState, setTestState] = useState<
    { kind: "idle" } | { kind: "ok" } | { kind: "fail"; message: string }
  >({ kind: "idle" });
  const [testing, startTestTransition] = useTransition();

  function runTest() {
    setTestState({ kind: "idle" });
    startTestTransition(async () => {
      try {
        const result = await testLlmProvider(provider.id);
        if (result.ok) setTestState({ kind: "ok" });
        else setTestState({ kind: "fail", message: result.message });
      } catch (e) {
        setTestState({
          kind: "fail",
          message: e instanceof Error ? e.message : "Test failed",
        });
      }
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await updateLlmProvider({
          id: provider.id,
          label: label.trim() || null,
          apiKey: apiKey.trim() ? apiKey.trim() : undefined,
          baseUrl: baseUrl.trim() || null,
          defaultModel: defaultModel.trim() || null,
          fastModel: fastModel.trim() || null,
        });
        setApiKey("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function makeDefault() {
    startTransition(() => void setDefaultLlmProvider(provider.id));
  }

  function remove() {
    if (
      !window.confirm(
        `Remove ${LLM_PROVIDER_LABEL[provider.kind]}${provider.label ? ` (${provider.label})` : ""}?`,
      )
    )
      return;
    startTransition(() => void deleteLlmProvider(provider.id));
  }

  const showBaseUrl = provider.kind === "sarvam";

  return (
    <li
      className={cn(
        "bg-surface border rounded-[12px] p-5 space-y-3",
        provider.isDefault ? "border-accent/40" : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 grid place-items-center rounded-md bg-surface-2 text-ink-2 shrink-0">
          <Icon name="ai-sparkle" size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[14px] text-ink">
              {LLM_PROVIDER_LABEL[provider.kind]}
            </span>
            {provider.label ? (
              <span className="text-[12px] text-ink-2">
                · {provider.label}
              </span>
            ) : null}
            {provider.isDefault ? (
              <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] bg-accent text-white px-2 py-[2px] rounded-[5px]">
                Default
              </span>
            ) : null}
          </div>
          <div className="text-[11.5px] font-mono text-ink-3 mt-0.5">
            key {provider.apiKeyPreview} · added{" "}
            {new Date(provider.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!provider.isDefault ? (
            <button
              type="button"
              onClick={makeDefault}
              disabled={pending}
              suppressHydrationWarning
              className="text-[12px] font-semibold text-accent hover:text-accent-strong px-2 py-1"
            >
              Make default
            </button>
          ) : null}
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            suppressHydrationWarning
            className="text-[12px] text-ink-3 hover:text-bad px-2 py-1 rounded-md hover:bg-bad-pale"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Label (optional)">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Production"
            className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </Field>
        <Field label="API key (leave blank to keep)">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste a new key to rotate"
            className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] font-mono focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </Field>
        <Field label={`Default model (blank → ${LLM_DEFAULT_MODEL[provider.kind]})`}>
          <input
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            placeholder={LLM_DEFAULT_MODEL[provider.kind]}
            className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] font-mono focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </Field>
        <Field label={`Fast model (blank → ${LLM_DEFAULT_FAST_MODEL[provider.kind]})`}>
          <input
            value={fastModel}
            onChange={(e) => setFastModel(e.target.value)}
            placeholder={LLM_DEFAULT_FAST_MODEL[provider.kind]}
            className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] font-mono focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </Field>
        {showBaseUrl ? (
          <Field label={`Base URL (blank → ${LLM_DEFAULT_BASE_URL[provider.kind]})`}>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={LLM_DEFAULT_BASE_URL[provider.kind] ?? ""}
              className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] font-mono focus:outline-none focus:border-accent"
              suppressHydrationWarning
            />
          </Field>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-3 flex-wrap">
        {error ? (
          <span className="text-[12px] text-bad font-mono">{error}</span>
        ) : null}
        {testState.kind === "ok" ? (
          <span className="text-[12px] text-good font-mono">✓ Key works</span>
        ) : testState.kind === "fail" ? (
          <span
            className="text-[12px] text-bad font-mono break-words max-w-[480px]"
            title={testState.message}
          >
            ✗ {testState.message}
          </span>
        ) : null}
        <button
          type="button"
          onClick={runTest}
          disabled={testing || pending}
          suppressHydrationWarning
          className="text-[12px] font-semibold px-3 py-1.5 rounded-md border border-border bg-surface text-ink-2 hover:text-ink hover:bg-surface-2 disabled:opacity-60"
        >
          {testing ? "Testing…" : "Test connection"}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          suppressHydrationWarning
          className="text-[12px] font-semibold px-3 py-1.5 rounded-md bg-ink text-white hover:bg-[#2a2a2a] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </li>
  );
}

function AddProviderCard({
  envFallbackKinds,
}: {
  envFallbackKinds: LlmProviderKind[];
}) {
  const [kind, setKind] = useState<LlmProviderKind>("anthropic");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [fastModel, setFastModel] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasEnvFallback = envFallbackKinds.includes(kind);
  const showBaseUrl = kind === "sarvam";

  function submit() {
    setError(null);
    const trimmed = apiKey.trim();
    if (!trimmed && !hasEnvFallback) {
      setError("API key is required");
      return;
    }
    if (trimmed && trimmed.length < 8) {
      setError("API key looks too short");
      return;
    }
    startTransition(async () => {
      try {
        await createLlmProvider({
          kind,
          label: label.trim() || null,
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim() || null,
          defaultModel: defaultModel.trim() || null,
          fastModel: fastModel.trim() || null,
          isDefault,
        });
        setLabel("");
        setApiKey("");
        setBaseUrl("");
        setDefaultModel("");
        setFastModel("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <section className="bg-surface border border-border rounded-[12px] p-5 space-y-4">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
          Add provider
        </div>
        <p className="text-[12.5px] text-ink-2 mt-1">
          {LLM_PROVIDER_DESCRIPTION[kind]}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {LLM_PROVIDER_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            suppressHydrationWarning
            className={cn(
              "px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors",
              kind === k
                ? "bg-ink text-white"
                : "bg-surface-2 text-ink-2 border border-border hover:text-ink",
            )}
          >
            {LLM_PROVIDER_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Label (optional)">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Production"
            className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </Field>
        <Field label={hasEnvFallback ? "API key (optional)" : "API key"}>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              hasEnvFallback ? "leave blank to use server env" : "paste secret"
            }
            className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] font-mono focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
          {hasEnvFallback ? (
            <span className="block text-[11px] text-ink-3 mt-1">
              Server env var is set — leave blank to use it, or paste to
              override for this tenant.
            </span>
          ) : null}
        </Field>
        <Field label={`Default model (blank → ${LLM_DEFAULT_MODEL[kind]})`}>
          <input
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            placeholder={LLM_DEFAULT_MODEL[kind]}
            className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] font-mono focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </Field>
        <Field label={`Fast model (blank → ${LLM_DEFAULT_FAST_MODEL[kind]})`}>
          <input
            value={fastModel}
            onChange={(e) => setFastModel(e.target.value)}
            placeholder={LLM_DEFAULT_FAST_MODEL[kind]}
            className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] font-mono focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </Field>
        {showBaseUrl ? (
          <Field label={`Base URL (blank → ${LLM_DEFAULT_BASE_URL[kind]})`}>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={LLM_DEFAULT_BASE_URL[kind] ?? ""}
              className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] font-mono focus:outline-none focus:border-accent"
              suppressHydrationWarning
            />
          </Field>
        ) : null}
      </div>

      <label className="inline-flex items-center gap-2 text-[12.5px] text-ink-2">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          suppressHydrationWarning
          className="accent-accent"
        />
        Set as default provider
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={
            pending ||
            (apiKey.trim().length < 8 &&
              !(hasEnvFallback && apiKey.trim().length === 0))
          }
          suppressHydrationWarning
          className={cn(
            "inline-flex items-center gap-1.5 px-4 py-2 rounded-md",
            "bg-accent text-white text-[13px] font-semibold",
            "hover:bg-accent-strong disabled:opacity-60",
          )}
        >
          <Icon name="ai-sparkle" size={12} />
          {pending ? "Adding…" : "Add provider"}
        </button>
        {error ? (
          <span className="text-[12px] text-bad font-mono">{error}</span>
        ) : null}
      </div>
    </section>
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
