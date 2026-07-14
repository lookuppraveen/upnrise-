// Client UI for tenant-scoped video provider configs.
//
// Layout: a "Library" list at top, an "Add provider" form below. Each
// library row shows provider, label, masked key, default toggle, and
// per-row inline-editable fields. Providers whose drivers aren't
// implemented yet are tagged with a "scaffolded" pill so admins know
// the row will accept a key but won't render until the driver lands.

"use client";

import { useState, useTransition } from "react";
import {
  createVideoProvider,
  deleteVideoProvider,
  setDefaultVideoProvider,
  testStreamingProvider,
  updateVideoProvider,
} from "@/app/admin/video-providers/actions";
import type { VideoProviderKind } from "@prisma/client";
import {
  PROVIDER_AVATAR_HINT,
  PROVIDER_DESCRIPTION,
  PROVIDER_IMPLEMENTED,
  PROVIDER_KINDS,
  PROVIDER_LABEL,
  PROVIDER_SUPPORTS_STREAMING,
  PROVIDER_VOICE_HINT,
} from "@/lib/video";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  AvatarPickerModal,
  type PickerAvatar,
} from "@/components/admin/AvatarPickerModal";
import {
  DidPortraitPickerModal,
  type SavedPortrait,
} from "@/components/admin/DidPortraitPickerModal";

type ProviderRow = {
  id: string;
  kind: VideoProviderKind;
  label: string | null;
  apiKeyPreview: string;
  avatarId: string | null;
  voiceId: string | null;
  isDefault: boolean;
  createdAt: string;
};

export function VideoProvidersManager({
  providers,
  savedPortraits = [],
  envFallbackKinds = [],
}: {
  providers: ProviderRow[];
  savedPortraits?: SavedPortrait[];
  envFallbackKinds?: VideoProviderKind[];
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
              <Icon name="play" size={18} />
            </div>
            <h3 className="font-display text-[18px] mt-3 text-ink">
              No providers configured yet
            </h3>
            <p className="text-[13px] text-ink-2 mt-1 max-w-[420px] mx-auto leading-[1.55]">
              Add your first provider below. HeyGen is recommended for the
              fastest path to a working render today.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {providers.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                savedPortraits={savedPortraits}
              />
            ))}
          </ul>
        )}
      </section>

      <AddProviderCard
        savedPortraits={savedPortraits}
        envFallbackKinds={envFallbackKinds}
      />
    </div>
  );
}

// ─────────────── Card ───────────────

function ProviderCard({
  provider,
  savedPortraits,
}: {
  provider: ProviderRow;
  savedPortraits: SavedPortrait[];
}) {
  const [label, setLabel] = useState(provider.label ?? "");
  const [apiKey, setApiKey] = useState("");
  const [avatarId, setAvatarId] = useState(provider.avatarId ?? "");
  const [voiceId, setVoiceId] = useState(provider.voiceId ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showDidPicker, setShowDidPicker] = useState(false);
  const [testState, setTestState] = useState<
    { kind: "idle" } | { kind: "ok" } | { kind: "fail"; message: string }
  >({ kind: "idle" });
  const [testing, startTestTransition] = useTransition();

  const implemented = PROVIDER_IMPLEMENTED[provider.kind];
  const canPickAvatar = provider.kind === "heygen";
  const canPickDidPortrait =
    provider.kind === "did" && savedPortraits.length > 0;
  // Every implemented provider now has a probe wired in the action — show
  // Test for all of them, hide it for the still-inert ElevenLabs row.
  const canTestKey = implemented;

  function runTest() {
    setTestState({ kind: "idle" });
    startTestTransition(async () => {
      try {
        const result = await testStreamingProvider(provider.id);
        if (result.ok) {
          setTestState({ kind: "ok" });
        } else {
          setTestState({ kind: "fail", message: result.message });
        }
      } catch (e) {
        setTestState({
          kind: "fail",
          message: e instanceof Error ? e.message : "Test failed",
        });
      }
    });
  }

  function handlePick(a: PickerAvatar) {
    setAvatarId(a.id);
    // Only overwrite the voice if the admin hasn't typed one yet —
    // they may have a tenant-specific voice they want to preserve.
    if (a.voiceId && !voiceId.trim()) setVoiceId(a.voiceId);
    setShowPicker(false);
  }

  function handlePickDidPortrait(p: SavedPortrait) {
    setAvatarId(p.sourceUrl);
    if (p.voiceId && !voiceId.trim()) setVoiceId(p.voiceId);
    setShowDidPicker(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await updateVideoProvider({
          id: provider.id,
          label: label.trim() || null,
          apiKey: apiKey.trim() ? apiKey.trim() : undefined,
          avatarId: avatarId.trim() || null,
          voiceId: voiceId.trim() || null,
        });
        setApiKey("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function makeDefault() {
    startTransition(() => void setDefaultVideoProvider(provider.id));
  }

  function remove() {
    if (
      !window.confirm(
        `Remove ${PROVIDER_LABEL[provider.kind]}${provider.label ? ` (${provider.label})` : ""}?`,
      )
    )
      return;
    startTransition(() => void deleteVideoProvider(provider.id));
  }

  return (
    <li
      className={cn(
        "bg-surface border rounded-[12px] p-5 space-y-3",
        provider.isDefault ? "border-accent/40" : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 grid place-items-center rounded-md bg-surface-2 text-ink-2 shrink-0">
          <Icon name="play" size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[14px] text-ink">
              {PROVIDER_LABEL[provider.kind]}
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
            {!implemented ? (
              <span
                className="text-[10.5px] font-bold uppercase tracking-[0.08em] bg-[#ede9fe] text-[#6d4ad9] px-2 py-[2px] rounded-[5px]"
                title="Driver scaffolded — fill in the implementation in src/lib/video/providers/ to enable."
              >
                Scaffolded
              </span>
            ) : null}
            {implemented ? (
              <span
                className={cn(
                  "text-[10.5px] font-bold uppercase tracking-[0.08em] px-2 py-[2px] rounded-[5px]",
                  PROVIDER_SUPPORTS_STREAMING[provider.kind]
                    ? "bg-[#e0f7ef] text-[#0a8a55]"
                    : "bg-[#fef3e6] text-[#a66b18]",
                )}
                title={
                  PROVIDER_SUPPORTS_STREAMING[provider.kind]
                    ? "Render + live roleplay streaming."
                    : "Render-only. Live roleplay needs a HeyGen or D-ID row as default."
                }
              >
                {PROVIDER_SUPPORTS_STREAMING[provider.kind]
                  ? "Render + Streaming"
                  : "Render only"}
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
            placeholder="e.g. Production · sales-coach voice"
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
        <Field label="Default avatar ID">
          <div className="flex items-stretch gap-2">
            <input
              value={avatarId}
              onChange={(e) => setAvatarId(e.target.value)}
              placeholder={PROVIDER_AVATAR_HINT[provider.kind]}
              className="flex-1 min-w-0 bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] font-mono focus:outline-none focus:border-accent"
              suppressHydrationWarning
            />
            {canPickAvatar ? (
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                suppressHydrationWarning
                className="px-3 py-2 rounded-md border border-border bg-surface text-[12px] font-semibold text-ink-2 hover:text-ink hover:bg-surface-2 shrink-0"
              >
                Browse…
              </button>
            ) : null}
            {canPickDidPortrait ? (
              <button
                type="button"
                onClick={() => setShowDidPicker(true)}
                suppressHydrationWarning
                title="Pick from your saved D-ID portraits library"
                className="px-3 py-2 rounded-md border border-border bg-surface text-[12px] font-semibold text-ink-2 hover:text-ink hover:bg-surface-2 shrink-0"
              >
                Browse saved…
              </button>
            ) : null}
          </div>
        </Field>
        <Field label="Default voice ID">
          <input
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            placeholder={PROVIDER_VOICE_HINT[provider.kind]}
            className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] font-mono focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-3 flex-wrap">
        {error ? (
          <span className="text-[12px] text-bad font-mono">{error}</span>
        ) : null}
        {testState.kind === "ok" ? (
          <span className="text-[12px] text-good font-mono">
            ✓ Key works
          </span>
        ) : testState.kind === "fail" ? (
          <span
            className="text-[12px] text-bad font-mono break-words max-w-[480px]"
            title={testState.message}
          >
            ✗ {testState.message}
          </span>
        ) : null}
        {canTestKey ? (
          <button
            type="button"
            onClick={runTest}
            disabled={testing || pending}
            suppressHydrationWarning
            className="text-[12px] font-semibold px-3 py-1.5 rounded-md border border-border bg-surface text-ink-2 hover:text-ink hover:bg-surface-2 disabled:opacity-60"
            title="Hits the provider's authenticated endpoint to verify the API key works."
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
        ) : null}
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

      {showPicker ? (
        <AvatarPickerModal
          currentAvatarId={avatarId || undefined}
          onClose={() => setShowPicker(false)}
          onPick={handlePick}
        />
      ) : null}

      {showDidPicker ? (
        <DidPortraitPickerModal
          portraits={savedPortraits}
          currentSourceUrl={avatarId || undefined}
          onClose={() => setShowDidPicker(false)}
          onPick={handlePickDidPortrait}
        />
      ) : null}
    </li>
  );
}

// ─────────────── Add provider ───────────────

function AddProviderCard({
  savedPortraits,
  envFallbackKinds,
}: {
  savedPortraits: SavedPortrait[];
  envFallbackKinds: VideoProviderKind[];
}) {
  const [kind, setKind] = useState<VideoProviderKind>("heygen");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [avatarId, setAvatarId] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [showDidPicker, setShowDidPicker] = useState(false);

  const canPickAvatar = kind === "heygen";
  const canPickDidPortrait = kind === "did" && savedPortraits.length > 0;
  const hasEnvFallback = envFallbackKinds.includes(kind);

  function handlePick(a: PickerAvatar) {
    setAvatarId(a.id);
    if (a.voiceId && !voiceId.trim()) setVoiceId(a.voiceId);
    setShowPicker(false);
  }

  function handlePickDidPortrait(p: SavedPortrait) {
    setAvatarId(p.sourceUrl);
    if (p.voiceId && !voiceId.trim()) setVoiceId(p.voiceId);
    setShowDidPicker(false);
  }
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
        await createVideoProvider({
          kind,
          label: label.trim() || null,
          apiKey: apiKey.trim(),
          avatarId: avatarId.trim() || null,
          voiceId: voiceId.trim() || null,
          isDefault,
        });
        setLabel("");
        setApiKey("");
        setAvatarId("");
        setVoiceId("");
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
          {PROVIDER_DESCRIPTION[kind]}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {PROVIDER_KINDS.map((k) => (
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
            {PROVIDER_LABEL[k]}
            {!PROVIDER_IMPLEMENTED[k] ? (
              <span className="ml-1.5 text-[10px] opacity-70">scaffolded</span>
            ) : PROVIDER_SUPPORTS_STREAMING[k] ? (
              <span className="ml-1.5 text-[10px] opacity-70">streaming</span>
            ) : null}
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
            placeholder={hasEnvFallback ? "leave blank to use server env" : "paste secret"}
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
        <Field label="Default avatar ID (optional)">
          <div className="flex items-stretch gap-2">
            <input
              value={avatarId}
              onChange={(e) => setAvatarId(e.target.value)}
              placeholder={PROVIDER_AVATAR_HINT[kind]}
              className="flex-1 min-w-0 bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] font-mono focus:outline-none focus:border-accent"
              suppressHydrationWarning
            />
            {canPickAvatar ? (
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                suppressHydrationWarning
                className="px-3 py-2 rounded-md border border-border bg-surface text-[12px] font-semibold text-ink-2 hover:text-ink hover:bg-surface-2 shrink-0"
              >
                Browse…
              </button>
            ) : null}
            {canPickDidPortrait ? (
              <button
                type="button"
                onClick={() => setShowDidPicker(true)}
                suppressHydrationWarning
                title="Pick from your saved D-ID portraits library"
                className="px-3 py-2 rounded-md border border-border bg-surface text-[12px] font-semibold text-ink-2 hover:text-ink hover:bg-surface-2 shrink-0"
              >
                Browse saved…
              </button>
            ) : null}
          </div>
        </Field>
        <Field label="Default voice ID (optional)">
          <input
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            placeholder={PROVIDER_VOICE_HINT[kind]}
            className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] font-mono focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </Field>
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

      {showPicker ? (
        <AvatarPickerModal
          currentAvatarId={avatarId || undefined}
          onClose={() => setShowPicker(false)}
          onPick={handlePick}
        />
      ) : null}

      {showDidPicker ? (
        <DidPortraitPickerModal
          portraits={savedPortraits}
          currentSourceUrl={avatarId || undefined}
          onClose={() => setShowDidPicker(false)}
          onPick={handlePickDidPortrait}
        />
      ) : null}
    </section>
  );
}

// ─────────────── Atom ───────────────

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
