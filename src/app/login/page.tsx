// Login screen — split-screen layout. Left rail is a marketing/
// how-it-works panel over an accent gradient; right rail is the sign-in
// form. On mobile the two stack vertically with the form on top.
//
// No seed credentials are surfaced here — production users are invited
// by their admin, and dev accounts belong in local docs, not on a
// public URL.

import Link from "next/link";
import { signIn } from "./actions";
import { Button } from "@/components/ui/Button";
import { Brand } from "@/components/shell/Brand";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  return (
    <main className="min-h-screen flex flex-col lg:flex-row">
      {/* Left rail — marketing / how-it-works */}
      <aside
        className="relative overflow-hidden text-white px-8 py-10 lg:px-14 lg:py-16 lg:w-[520px] lg:min-h-screen flex flex-col justify-between"
        style={{
          background:
            "radial-gradient(circle at 15% 15%, rgba(232,93,58,0.35) 0%, transparent 55%), radial-gradient(circle at 85% 85%, rgba(124,92,214,0.30) 0%, transparent 55%), linear-gradient(135deg, #2a1f2e 0%, #1a1320 60%, #221624 100%)",
        }}
      >
        <div className="space-y-8 relative">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-md grid place-items-center text-white font-bold text-[15px]"
              style={{ background: "var(--ai-grad, #e85d3a)" }}
              aria-hidden
            >
              U
            </div>
            <div className="text-[13px] font-bold uppercase tracking-[0.24em] text-white/70">
              UPnRise
            </div>
          </div>

          <div className="space-y-4 max-w-[380px]">
            <h1 className="font-display text-[38px] leading-[1.05] -tracking-[0.015em] text-white">
              Practice sales conversations with an AI coach.
            </h1>
            <p className="text-[14.5px] text-white/75 leading-[1.6]">
              UPnRise is your team&rsquo;s AI-powered sales training studio —
              realistic roleplays, instant feedback, and coaching that
              adapts to how each rep learns.
            </p>
          </div>

          <div className="space-y-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">
              How signing in works
            </div>
            <ol className="space-y-4 text-[13.5px] text-white/85 leading-[1.5]">
              <Step index={1} title="Your admin invites you">
                Sign-in is by invitation. Your admin adds you to your
                company&rsquo;s workspace and sends the credentials to your
                work email.
              </Step>
              <Step index={2} title="Use your work email">
                Enter the email address your admin used to invite you and
                the password from the invitation email.
              </Step>
              <Step index={3} title="Land on your dashboard">
                Trainees see their assigned trainings and progress. Admins
                land on the tenant dashboard. Your role decides the view.
              </Step>
            </ol>
          </div>
        </div>

        <div className="text-[11.5px] text-white/50 relative">
          Trouble signing in?{" "}
          <a
            href="mailto:support@upnrise.com"
            className="text-white/80 underline underline-offset-2 hover:text-white"
          >
            Contact support
          </a>
          .
        </div>
      </aside>

      {/* Right rail — sign-in form */}
      <section className="flex-1 flex items-center justify-center px-6 py-10 lg:py-16 bg-bg">
        <div className="w-full max-w-[400px] space-y-6">
          <div className="lg:hidden">
            <Brand size="md" />
          </div>

          <div className="space-y-1.5">
            <h2 className="font-display text-[26px] leading-tight -tracking-[0.01em]">
              Sign in
            </h2>
            <p className="text-ink-2 text-[13px]">
              Enter the credentials your admin sent to your work email.
            </p>
          </div>

          <form action={handleSignIn} className="space-y-3.5">
            <label className="block space-y-1">
              <span className="text-[12px] font-semibold text-ink-2">
                Work email
              </span>
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
                placeholder="you@company.com"
                className="w-full border border-border-strong rounded-md bg-surface px-3 py-2.5 text-[13.5px] focus:outline-none focus:border-accent"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[12px] font-semibold text-ink-2">
                Password
              </span>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="w-full border border-border-strong rounded-md bg-surface px-3 py-2.5 text-[13.5px] focus:outline-none focus:border-accent"
              />
            </label>
            <ErrorBanner searchParams={searchParams} />
            <Button type="submit" size="lg" className="w-full justify-center">
              Sign in
            </Button>
          </form>

          <div className="text-[12px] text-ink-3 leading-[1.55] space-y-1">
            <div>
              Forgot your password?{" "}
              <a
                href="mailto:support@upnrise.com?subject=Password%20reset"
                className="text-accent hover:text-accent-strong underline underline-offset-2"
              >
                Email support
              </a>{" "}
              and we&rsquo;ll help you reset it.
            </div>
            <div>
              New here?{" "}
              <span className="text-ink-2">
                Ask your admin to add you to your company workspace.
              </span>
            </div>
          </div>

          <div className="border-t border-border pt-4 flex items-center justify-between text-[11.5px] text-ink-3">
            <Link href="/" className="hover:text-ink">
              ← Back to home
            </Link>
            <div className="inline-flex items-center gap-1.5">
              <LockIcon />
              Secured with encryption
            </div>
          </div>
        </div>
      </section>
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

function Step({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <div
        className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold shrink-0 mt-0.5"
        style={{
          background: "rgba(255,255,255,0.12)",
          border: "1px solid rgba(255,255,255,0.22)",
        }}
      >
        {index}
      </div>
      <div>
        <div className="font-semibold text-white">{title}</div>
        <div className="text-white/70 text-[12.5px] leading-[1.5] mt-0.5">
          {children}
        </div>
      </div>
    </li>
  );
}

function LockIcon() {
  return (
    <svg
      width="10"
      height="12"
      viewBox="0 0 10 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect
        x="1"
        y="5"
        width="8"
        height="6"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M3 5V3.5A2 2 0 015 1.5V1.5A2 2 0 017 3.5V5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}
