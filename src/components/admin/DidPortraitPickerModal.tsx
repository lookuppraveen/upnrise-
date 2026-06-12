// Pick a saved D-ID portrait + voice from the tenant library without
// re-typing the long s3:// URL. Mirrors AvatarPickerModal's layout, but
// reads from the in-memory list passed in (no fetch) since portraits
// are already loaded by the Video Providers page.

"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

export type SavedPortrait = {
  id: string;
  label: string;
  sourceUrl: string;
  /** Publicly-fetchable mirror in Supabase Storage. Used by the
   *  audio-only roleplay surface to show the actual portrait instead
   *  of initials. May be null on rows uploaded before this column
   *  existed — picker falls back gracefully. */
  displayUrl: string | null;
  voiceId: string | null;
  voiceName: string | null;
};

export function DidPortraitPickerModal({
  portraits,
  currentSourceUrl,
  onClose,
  onPick,
}: {
  portraits: SavedPortrait[];
  currentSourceUrl?: string;
  onClose: () => void;
  onPick: (portrait: SavedPortrait) => void;
}) {
  const [q, setQ] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return portraits;
    return portraits.filter((p) =>
      `${p.label} ${p.voiceName ?? ""} ${p.sourceUrl}`
        .toLowerCase()
        .includes(needle),
    );
  }, [portraits, q]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pick a saved D-ID portrait"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-bg border border-border rounded-[12px] w-full max-w-[640px] my-4 shadow-xl flex flex-col max-h-[92vh]"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border gap-3">
          <div className="min-w-0">
            <h2 className="text-[18px] font-semibold text-ink">
              Pick a saved portrait
            </h2>
            <p className="text-[11.5px] text-ink-3 mt-0.5">
              Tenant library. Picking one fills the Avatar ID and (when set)
              the default voice on this provider.
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

        <div className="px-6 pt-3 pb-2 border-b border-border">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by label, voice, or URL"
            className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {portraits.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <p className="text-[12.5px] text-ink-3">
                No portraits saved yet.
              </p>
              <p className="text-[11px] text-ink-3 max-w-[360px] mx-auto leading-[1.6]">
                Upload one with{" "}
                <span className="font-mono">POST https://api.d-id.com/images</span>,
                then add the returned URL to the library below the providers
                list.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-[12.5px] text-ink-3 text-center py-12">
              No portraits matched &ldquo;{q}&rdquo;.
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((p) => {
                const selected = p.sourceUrl === currentSourceUrl;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onPick(p)}
                      suppressHydrationWarning
                      className={cn(
                        "w-full text-left rounded-[10px] border-2 px-4 py-3 transition-colors bg-surface hover:border-accent-pale",
                        selected
                          ? "border-accent shadow-[0_0_0_3px_rgba(255,124,82,0.15)]"
                          : "border-border",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {p.displayUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.displayUrl}
                            alt={p.label}
                            loading="lazy"
                            className="w-12 h-12 rounded-md object-cover bg-surface-2 shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-md bg-surface-2 grid place-items-center text-ink-3 text-[10px] font-mono shrink-0">
                            no pic
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-semibold text-ink truncate">
                            {p.label}
                          </div>
                          <div className="text-[10.5px] text-ink-3 font-mono break-all mt-0.5">
                            {p.sourceUrl}
                          </div>
                          {p.voiceName || p.voiceId ? (
                            <div className="text-[11px] text-ink-2 mt-1">
                              Voice: {p.voiceName ?? p.voiceId}
                            </div>
                          ) : null}
                        </div>
                        {selected ? (
                          <div className="w-5 h-5 grid place-items-center rounded-full bg-accent text-white text-[10px] shrink-0">
                            ✓
                          </div>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-3 border-t border-border">
          <div className="text-[11px] text-ink-3">
            {portraits.length === 0
              ? "—"
              : `${filtered.length} of ${portraits.length} portraits`}
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
