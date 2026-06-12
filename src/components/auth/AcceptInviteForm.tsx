// Acceptance form for /invite/[token]. Captures a password (twice) and
// posts to the acceptInviteAndRedirect server action. On success the
// action redirects server-side, which preserves the auth cookies set
// during sign-in. On error we surface the message inline.

"use client";

import { useState, useTransition } from "react";
import { acceptInviteAndRedirect } from "@/app/invite/[token]/actions";
import { cn } from "@/lib/cn";

export function AcceptInviteForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    startTransition(async () => {
      const result = await acceptInviteAndRedirect({ token, password });
      // The action redirects on success — if we get a result back, it
      // means activation failed and the redirect didn't fire.
      if (result && "error" in result) {
        setError(result.error);
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-3 mt-4"
    >
      <label className="block space-y-1.5">
        <span className="block text-[12.5px] font-semibold text-ink">
          Email
        </span>
        <input
          type="email"
          value={email}
          readOnly
          className="w-full bg-surface-2 border border-border rounded-md px-3 py-2.5 text-[13px] font-mono text-ink-2 focus:outline-none"
          suppressHydrationWarning
        />
      </label>

      <label className="block space-y-1.5">
        <span className="block text-[12.5px] font-semibold text-ink">
          Choose a password
        </span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          placeholder="8+ characters"
          autoComplete="new-password"
          className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent"
          suppressHydrationWarning
        />
      </label>

      <label className="block space-y-1.5">
        <span className="block text-[12.5px] font-semibold text-ink">
          Confirm password
        </span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Re-type it"
          autoComplete="new-password"
          className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent"
          suppressHydrationWarning
        />
      </label>

      {error ? (
        <p className="text-[12px] text-bad font-mono break-words">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        suppressHydrationWarning
        className={cn(
          "w-full px-5 py-2.5 rounded-md bg-accent text-white text-[13px] font-semibold hover:bg-accent-strong disabled:opacity-60",
        )}
      >
        {pending ? "Activating…" : "Activate account & sign in"}
      </button>
    </form>
  );
}
