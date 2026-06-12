"use client";

import { useTransition } from "react";
import { deleteKbSource } from "@/app/admin/knowledge/actions";

export function DeleteKbButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
    startTransition(() => void deleteKbSource(id));
  }

  return (
    <button
      type="button"
      onClick={confirmDelete}
      disabled={pending}
      className="text-ink-3 hover:text-bad hover:bg-bad-pale rounded-md w-7 h-7 grid place-items-center shrink-0 disabled:opacity-50 text-[16px] leading-none"
      aria-label={`Delete ${name}`}
    >
      ×
    </button>
  );
}
