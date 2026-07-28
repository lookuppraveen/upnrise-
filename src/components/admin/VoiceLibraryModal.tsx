// Voice library search modal — opens from the persona editor's
// "Roleplay voice" card. Lets admins pick any voice ElevenLabs
// exposes on their subscription (Starter+ unlocks the shared library
// via API).
//
// Design goals:
//   • Indian voices are the primary use case → preset chips land those
//     first without typing.
//   • Free-text search hits ElevenLabs's shared-voices endpoint via
//     our proxy at /api/admin/voices/search.
//   • Every result has a Play button that calls /api/roleplay/tts —
//     admins hear the voice before committing.
//   • Selecting a voice returns just the voice_id to the parent modal;
//     PersonaModal writes it into `elevenLabsVoiceId`.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  VOICE_LIBRARY_PRESETS,
  type VoiceLibraryPreset,
} from "@/lib/voice/voice-catalog";

type LibraryVoice = {
  id: string;
  name: string;
  gender: "male" | "female" | "neutral";
  accent: string | null;
  language: string | null;
  category: string | null;
  description: string | null;
  previewUrl: string | null;
};

const DEBOUNCE_MS = 350;

export function VoiceLibraryModal({
  initialQuery,
  onPick,
  onClose,
}: {
  /** Preset that opens by default — the parent passes one that matches
   *  the persona's gender so the admin doesn't start on Adam voices
   *  when their persona is Priya. */
  initialQuery?: {
    gender?: "male" | "female" | "neutral";
    accent?: string;
    language?: string;
  };
  onPick: (voiceId: string, name: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [activePreset, setActivePreset] = useState<VoiceLibraryPreset | null>(
    () => pickDefaultPreset(initialQuery),
  );
  const [voices, setVoices] = useState<LibraryVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch — debounced on `search`, immediate on preset changes.
  const runSearch = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (activePreset?.query.gender)
      params.set("gender", activePreset.query.gender);
    if (activePreset?.query.language)
      params.set("language", activePreset.query.language);
    if (activePreset?.query.accent)
      params.set("accent", activePreset.query.accent);
    params.set("pageSize", "30");

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/voices/search?${params.toString()}`,
        { signal: controller.signal },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          status?: number;
        };
        // Surface the upstream HTTP status so "401 — key missing voices:read"
        // is one glance away from the admin instead of buried in terminal
        // logs. Falls back to the local response status when the route
        // didn't include an upstream status.
        const upstream = body.status ? ` (${body.status})` : "";
        throw new Error(`${body.error ?? "search_error"}${upstream}`);
      }
      const data = (await res.json()) as { voices: LibraryVoice[] };
      setVoices(data.voices);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(
        err instanceof Error ? err.message : "Failed to load voices",
      );
      setVoices([]);
    } finally {
      setLoading(false);
    }
  }, [search, activePreset]);

  // Debounce the free-text search — cheap for the admin, kind to the
  // provider quota.
  useEffect(() => {
    const t = setTimeout(runSearch, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [runSearch]);

  // Stop any running preview when the modal closes so audio doesn't
  // keep playing under the next thing the admin opens.
  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause();
      abortRef.current?.abort();
    };
  }, []);

  async function preview(voice: LibraryVoice) {
    setPreviewingId(voice.id);
    try {
      previewAudioRef.current?.pause();
      const sample = `Hi, I'm ${voice.name}. This is a sample of how I'd sound as your persona.`;
      const res = await fetch("/api/roleplay/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sample, voiceId: voice.id }),
      });
      if (!res.ok) throw new Error(`tts_${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = previewAudioRef.current ?? new Audio();
      previewAudioRef.current = audio;
      audio.src = url;
      const cleanup = () => {
        URL.revokeObjectURL(url);
        setPreviewingId((cur) => (cur === voice.id ? null : cur));
      };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      await audio.play();
    } catch (err) {
      console.warn(
        "[voice-library] preview failed",
        err instanceof Error ? err.message : err,
      );
      setPreviewingId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-[min(760px,92vw)] max-h-[86vh] bg-surface rounded-[12px] shadow-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
          <div>
            <div className="text-[15px] font-semibold text-ink">
              Browse voice library
            </div>
            <div className="text-[11.5px] text-ink-3 mt-0.5">
              Search across every ElevenLabs voice your subscription unlocks.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 grid place-items-center rounded-md hover:bg-surface-2"
          >
            <Icon name="chevron-right" size={14} className="rotate-45" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-border space-y-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, tone, or accent (e.g. Priya, warm, Hindi)…"
            className="w-full px-3 py-2 rounded-md border border-border bg-surface-2 text-[13px] focus:outline-none focus:border-accent"
          />
          <div className="flex flex-wrap gap-2">
            {VOICE_LIBRARY_PRESETS.map((p) => {
              const active = activePreset?.key === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() =>
                    setActivePreset((cur) => (cur?.key === p.key ? null : p))
                  }
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[11.5px] font-semibold border transition-colors",
                    active
                      ? "border-accent bg-accent-pale text-accent"
                      : "border-border bg-surface hover:bg-surface-2 text-ink-2",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
            {activePreset ? (
              <button
                type="button"
                onClick={() => setActivePreset(null)}
                className="text-[11.5px] text-ink-3 hover:text-ink underline underline-offset-2"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="text-[12.5px] text-ink-3 italic">
              Loading voices…
            </div>
          ) : error ? (
            <div className="text-[12.5px] text-bad">
              Couldn&apos;t load voices — {error}. Try again in a moment.
            </div>
          ) : voices.length === 0 ? (
            <div className="text-[12.5px] text-ink-3 italic">
              No voices matched. Try a different preset or search term.
            </div>
          ) : (
            <ul className="grid gap-2">
              {voices.map((v) => (
                <li
                  key={v.id}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-md border border-border bg-surface hover:bg-surface-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-ink flex items-center gap-2 flex-wrap">
                      {v.name}
                      {v.gender !== "neutral" ? (
                        <Chip>{v.gender}</Chip>
                      ) : null}
                      {v.accent ? <Chip>{v.accent}</Chip> : null}
                      {v.language ? <Chip>{v.language}</Chip> : null}
                    </div>
                    {v.description ? (
                      <div className="text-[11.5px] text-ink-3 mt-0.5 line-clamp-2">
                        {v.description}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => preview(v)}
                      disabled={previewingId === v.id}
                      aria-label={`Preview ${v.name}`}
                      className="w-8 h-8 grid place-items-center rounded-md border border-border-strong bg-surface hover:bg-surface-2 disabled:opacity-60"
                      title="Play a sample"
                    >
                      <Icon
                        name={previewingId === v.id ? "history" : "play"}
                        size={12}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => onPick(v.id, v.name)}
                      className="px-3 py-1.5 rounded-md bg-accent text-white text-[12px] font-semibold hover:bg-accent-strong"
                    >
                      Use
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md bg-[#dadbe6] text-ink text-[12.5px] font-semibold hover:bg-[#c8c9d6]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3 bg-surface-2 border border-border rounded-sm px-1.5 py-[1px]">
      {children}
    </span>
  );
}

function pickDefaultPreset(initial?: {
  gender?: "male" | "female" | "neutral";
  accent?: string;
  language?: string;
}): VoiceLibraryPreset | null {
  if (!initial) return VOICE_LIBRARY_PRESETS[0] ?? null;
  // Try to match the persona's gender + accent hint; otherwise fall
  // back to the first preset (Indian · Female) so admins don't stare
  // at an empty search when they open the modal.
  const match = VOICE_LIBRARY_PRESETS.find((p) => {
    if (initial.gender && p.query.gender !== initial.gender) return false;
    if (initial.accent && p.query.accent !== initial.accent) return false;
    if (initial.language && p.query.language !== initial.language) return false;
    return true;
  });
  return match ?? VOICE_LIBRARY_PRESETS[0] ?? null;
}
