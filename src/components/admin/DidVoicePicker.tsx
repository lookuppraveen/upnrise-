// Dropdown picker for D-ID-compatible Microsoft voices. Grouped by
// language (en-IN, hi-IN, …) so the most common Indian options are at
// the top. A "Custom…" option flips to a free-text input so admins
// can paste a voice id we haven't curated yet.

"use client";

import { useEffect, useState } from "react";
import {
  DID_VOICE_GROUPS,
  formatDidVoiceLabel,
  lookupDidVoice,
} from "@/lib/video/did-voices";

const CUSTOM_VALUE = "__custom__";

export function DidVoicePicker({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: { id: string; name: string }) => void;
  placeholder?: string;
}) {
  const matched = lookupDidVoice(value);
  const [customMode, setCustomMode] = useState(
    () => Boolean(value && !matched),
  );
  const [customInput, setCustomInput] = useState(value || "");

  useEffect(() => {
    // If the parent flips value to one we know, drop custom mode so
    // the dropdown reflects the selection cleanly.
    if (value && lookupDidVoice(value)) setCustomMode(false);
  }, [value]);

  if (customMode) {
    return (
      <div className="flex items-stretch gap-2">
        <input
          value={customInput}
          onChange={(e) => {
            setCustomInput(e.target.value);
            onChange({ id: e.target.value.trim(), name: "" });
          }}
          placeholder={placeholder ?? "e.g. en-IN-NeerjaNeural"}
          className="flex-1 min-w-0 bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] font-mono focus:outline-none focus:border-accent"
          suppressHydrationWarning
        />
        <button
          type="button"
          onClick={() => {
            setCustomMode(false);
            setCustomInput("");
            onChange({ id: "", name: "" });
          }}
          suppressHydrationWarning
          className="px-3 py-2 rounded-md border border-border bg-surface text-[12px] font-semibold text-ink-2 hover:text-ink hover:bg-surface-2 shrink-0"
        >
          Use list
        </button>
      </div>
    );
  }

  return (
    <select
      value={matched?.id ?? ""}
      onChange={(e) => {
        const next = e.target.value;
        if (next === CUSTOM_VALUE) {
          setCustomMode(true);
          setCustomInput("");
          return;
        }
        const v = lookupDidVoice(next);
        if (!v) {
          onChange({ id: "", name: "" });
          return;
        }
        onChange({ id: v.id, name: formatDidVoiceLabel(v) });
      }}
      className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-[12.5px] focus:outline-none focus:border-accent"
      suppressHydrationWarning
    >
      <option value="">— No voice (use provider default) —</option>
      {DID_VOICE_GROUPS.map((group) => (
        <optgroup key={group.lang} label={group.label}>
          {group.voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} · {v.gender === "F" ? "Female" : "Male"}
            </option>
          ))}
        </optgroup>
      ))}
      <option value={CUSTOM_VALUE}>Custom voice id…</option>
    </select>
  );
}
