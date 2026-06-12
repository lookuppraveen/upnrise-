// Login screen. Minimal — matches prototype tokens (no design for login was
// in the handoff; this is the marketing surface from BUILD_PLAN.md §3).

import { signIn } from "./actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Brand } from "@/components/shell/Brand";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  return (
    <main className="flex-1 flex items-center justify-center px-6">
      <Card pad="lg" className="w-full max-w-[400px] space-y-5">
        <header className="space-y-3">
          <Brand size="lg" />
          <p className="text-ink-2 text-[13px]">
            Use a dev account from the seed (e.g. <code className="font-mono text-[12px]">super@upnrise.local</code>).
          </p>
        </header>

        <form action={handleSignIn} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-[12px] text-ink-2">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              className="w-full border border-border-strong rounded-md bg-surface px-3 py-2 text-[13.5px] focus:outline-none focus:border-accent"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[12px] text-ink-2">Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full border border-border-strong rounded-md bg-surface px-3 py-2 text-[13.5px] focus:outline-none focus:border-accent"
            />
          </label>
          <ErrorBanner searchParams={searchParams} />
          <Button type="submit" size="lg" className="w-full justify-center">
            Sign in
          </Button>
        </form>

        <div className="border-t border-border pt-3 text-[11.5px] font-mono text-ink-3 space-y-0.5">
          <div>super@upnrise.local · password123</div>
          <div>admin@cyberdyne.local · password123</div>
          <div>trainee@cyberdyne.local · password123</div>
        </div>
      </Card>
    </main>
  );
}

async function handleSignIn(formData: FormData) {
  "use server";
  const res = await signIn(formData);
  if (res?.error) {
    // Cheap: re-render login with ?error= in the URL.
    const { redirect } = await import("next/navigation");
    redirect(`/login?error=${encodeURIComponent(res.error)}`);
  }
}

async function ErrorBanner({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  if (!sp.error) return null;
  return (
    <div className="rounded-md border border-bad/30 bg-bad-pale text-bad px-3 py-2 text-[12.5px]">
      {sp.error}
    </div>
  );
}
