// /invite/[token]
//
// Trainee landing page for an invite link. Validates the HMAC token,
// confirms the User row is still status="invited", and hands off to
// the client form. Already-accepted invites short-circuit to a "log
// in instead" message rather than letting them set a fresh password
// (which would silently overwrite the existing one in Supabase Auth).

import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { verifyInviteToken } from "@/lib/auth/invite-token";
import { AcceptInviteForm } from "@/components/auth/AcceptInviteForm";

export const dynamic = "force-dynamic";

export default async function InviteAcceptancePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = verifyInviteToken(token);

  if (!payload) {
    return (
      <InviteShell title="Link expired or invalid">
        <p className="text-[13px] text-ink-2 leading-[1.55]">
          This invite link can&apos;t be verified. It may have expired (links
          last 7 days) or been revoked. Ask your admin to send a fresh one.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-md border border-border bg-surface text-[13px] font-semibold text-ink-2 hover:text-ink"
        >
          Go to login
        </Link>
      </InviteShell>
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, name: true, status: true },
  });
  if (!user) {
    return (
      <InviteShell title="Invite no longer valid">
        <p className="text-[13px] text-ink-2 leading-[1.55]">
          The teammate this invite was for can&apos;t be found. They may have
          been removed from the roster. Ask your admin for a new invite.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-md border border-border bg-surface text-[13px] font-semibold text-ink-2 hover:text-ink"
        >
          Go to login
        </Link>
      </InviteShell>
    );
  }

  if (user.status !== "invited") {
    return (
      <InviteShell title="Already accepted">
        <p className="text-[13px] text-ink-2 leading-[1.55]">
          You&apos;ve already activated this account. Sign in with your
          password to continue.
        </p>
        <Link
          href={`/login?email=${encodeURIComponent(user.email)}`}
          className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-md bg-accent text-white text-[13px] font-semibold hover:bg-accent-strong"
        >
          Go to login
        </Link>
      </InviteShell>
    );
  }

  const expiresAtLabel = new Date(payload.expiresAt).toLocaleDateString(
    undefined,
    { month: "short", day: "numeric", year: "numeric" },
  );

  return (
    <InviteShell title={`Welcome${user.name ? `, ${user.name.split(" ")[0]}` : ""} 👋`}>
      <p className="text-[13px] text-ink-2 leading-[1.55]">
        You&apos;ve been invited to join your team&apos;s training portal. Set
        a password to activate your account — you&apos;ll be signed in right
        after.
      </p>
      <AcceptInviteForm token={token} email={user.email} />
      <p className="text-[11.5px] text-ink-3 mt-4">
        Link valid until {expiresAtLabel}.
      </p>
    </InviteShell>
  );
}

function InviteShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg grid place-items-center px-4 py-10">
      <div className="w-full max-w-[480px] bg-surface border border-border rounded-[14px] p-6 md:p-8 shadow-sm">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-3 mb-2">
          UPnRise
        </div>
        <h1 className="font-display text-[26px] leading-tight -tracking-[0.01em] mb-4">
          {title}
        </h1>
        {children}
      </div>
    </div>
  );
}
