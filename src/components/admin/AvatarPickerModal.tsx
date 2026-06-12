// Browse the LiveAvatar public catalogue and pick an avatar + voice
// without leaving the Video Providers admin page. Replaces the manual
// "paste a UUID" workflow.
//
// Renders as a modal grid of preview cards. Search filters the visible
// set client-side. Picking commits both the avatar id and (optionally)
// the avatar's default voice id back to the parent — the caller can
// ignore the voice if they want to keep their own selection.

"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

export type PickerAvatar = {
  id: string;
  name: string;
  previewUrl: string | null;
  voiceId: string | null;
  voiceName: string | null;
  status: string;
};

export function AvatarPickerModal({
  currentAvatarId,
  onClose,
  onPick,
}: {
  currentAvatarId?: string;
  onClose: () => void;
  onPick: (avatar: PickerAvatar) => void;
}) {
  const [avatars, setAvatars] = useState<PickerAvatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    // `loading` is already `true` and `error` is already `null` from
    // useState's initial values — no need to re-set them here, and
    // re-setting trips react-hooks/set-state-in-effect. Just fire the
    // fetch and let the .then/.catch/.finally flip the flags.
    let cancelled = false;
    fetch("/api/admin/video-providers/avatars", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? `fetch failed: ${res.status}`);
        }
        return (await res.json()) as { avatars: PickerAvatar[] };
      })
      .then((data) => {
        if (cancelled) return;
        setAvatars(data.avatars);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load avatars");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return avatars;
    return avatars.filter((a) =>
      `${a.name} ${a.id} ${a.voiceName ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [avatars, q]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pick an avatar"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-bg border border-border rounded-[12px] w-full max-w-[960px] my-4 shadow-xl flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border gap-3">
          <div className="min-w-0">
            <h2 className="text-[18px] font-semibold text-ink">
              Pick an avatar
            </h2>
            <p className="text-[11.5px] text-ink-3 mt-0.5">
              Public LiveAvatar catalogue. Pick one to fill the Avatar ID and
              default voice on this provider.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-3 hover:text-ink text-[20px] leading-none px-1"
          >
            ×
          </button>
        </div>

        {/* Search */}
        <div className="px-6 pt-3 pb-2 border-b border-border">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, voice, or id"
            className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-[12.5px] text-ink-3 text-center py-12">
              Loading avatars…
            </p>
          ) : error ? (
            <div className="text-center py-12 space-y-2">
              <p className="text-[12.5px] text-bad font-mono break-words">
                {error}
              </p>
              <p className="text-[11.5px] text-ink-3">
                You can still paste a UUID manually back on the provider card.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-[12.5px] text-ink-3 text-center py-12">
              No avatars matched &ldquo;{q}&rdquo;.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filtered.map((a) => {
                const selected = a.id === currentAvatarId;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onPick(a)}
                    suppressHydrationWarning
                    className={cn(
                      "text-left rounded-[10px] border-2 overflow-hidden transition-all bg-surface hover:border-accent-pale",
                      selected
                        ? "border-accent shadow-[0_0_0_3px_rgba(255,124,82,0.15)]"
                        : "border-border",
                    )}
                    title={a.id}
                  >
                    <div
                      className="aspect-[3/4] bg-surface-2 relative"
                      style={{
                        background:
                          "linear-gradient(140deg, #1a1f2a 0%, #2a3242 60%, #1a1f2a 100%)",
                      }}
                    >
                      {a.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.previewUrl}
                          alt={a.name}
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center text-ink-3 text-[11px] font-mono">
                          no preview
                        </div>
                      )}
                      {selected ? (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 grid place-items-center rounded-full bg-accent text-white text-[10px]">
                          ✓
                        </div>
                      ) : null}
                    </div>
                    <div className="px-2.5 py-2 space-y-0.5">
                      <div className="text-[12.5px] font-semibold text-ink truncate">
                        {a.name}
                      </div>
                      <div className="text-[10.5px] text-ink-3 font-mono truncate">
                        {a.id}
                      </div>
                      {a.voiceName ? (
                        <div className="text-[10.5px] text-ink-3 truncate">
                          Voice: {a.voiceName}
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-6 py-3 border-t border-border">
          <div className="text-[11px] text-ink-3">
            {loading
              ? "—"
              : `${filtered.length} of ${avatars.length} avatars`}
          </div>
          <button
            type="button"
            onClick={onClose}
            suppressHydrationWarning
            className="px-4 py-2 rounded-md border border-border bg-surface text-[12.5px] font-semibold text-ink-2 hover:text-ink hover:bg-surface-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
