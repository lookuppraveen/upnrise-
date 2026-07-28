// Voice usage tracking + cap enforcement.
//
// All reads/writes go through here so the routes don't scatter Prisma
// calls for what is really one concept.
//
// Cap model (Phase 4):
//   • Per-session cap: env var VOICE_MAX_CHARS_PER_SESSION (default
//     12,000 — roughly $0.06 at Flash). Once a session's cumulative
//     TTS chars exceed this, the route returns 503 "cap_reached" and
//     the client falls back to browser TTS for the rest of the session.
//   • Per-tenant monthly cap: read from the subscribed plan's
//     `limits.voice_chars_per_month` JSON field. Null / missing =
//     unlimited (the historical default). When exceeded, same 503.
//
// All writes are fire-and-forget from the caller's POV. Failures are
// swallowed so a logging blip never blocks a persona from speaking —
// the trainee experience is more important than perfect attribution.

import { prisma } from "@/lib/db/client";

const DEFAULT_SESSION_CAP_CHARS = 12_000;

export type VoiceUsageInsert = {
  companyId: string;
  userId: string;
  sessionId?: string | null;
  kind: "tts" | "stt" | "tts_preview";
  provider?: string;
  model?: string | null;
  voiceId?: string | null;
  charsIn?: number | null;
  bytesIn?: number | null;
  costCents: number;
  meta?: Record<string, unknown> | null;
};

export async function recordVoiceUsage(row: VoiceUsageInsert): Promise<void> {
  try {
    await prisma.voiceUsageLog.create({
      data: {
        companyId: row.companyId,
        userId: row.userId,
        sessionId: row.sessionId ?? null,
        kind: row.kind,
        provider: row.provider ?? "elevenlabs",
        model: row.model ?? null,
        voiceId: row.voiceId ?? null,
        charsIn: row.charsIn ?? null,
        bytesIn: row.bytesIn ?? null,
        costCents: row.costCents,
        meta: (row.meta as never) ?? null,
      },
    });
  } catch (err) {
    // Never surface a logging error to the caller — the persona is
    // more important than a row in a metrics table.
    console.warn(
      "[voice-usage] insert failed",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Per-session soft cap. Returns { allowed, used, cap }.
 * Only counts kind="tts" — STT and previews don't affect the session
 * budget for the persona voice.
 */
export async function checkSessionTtsCap(sessionId: string): Promise<{
  allowed: boolean;
  used: number;
  cap: number;
}> {
  const cap = readSessionCapChars();
  if (cap <= 0) return { allowed: true, used: 0, cap: 0 };

  const agg = await prisma.voiceUsageLog.aggregate({
    where: { sessionId, kind: "tts" },
    _sum: { charsIn: true },
  });
  const used = agg._sum.charsIn ?? 0;
  return { allowed: used < cap, used, cap };
}

/**
 * Per-tenant monthly cap. Reads the cap from the company's active
 * subscription's plan.limits.voice_chars_per_month; returns
 * { allowed: true, cap: null } when no cap is configured.
 *
 * "Month" here is the calendar month in UTC — good enough for a first
 * cut. Phase 5 could switch to the plan's billing anchor date.
 */
export async function checkTenantMonthlyTtsCap(
  companyId: string,
): Promise<{ allowed: boolean; used: number; cap: number | null }> {
  const cap = await readTenantCapChars(companyId);
  if (cap == null) return { allowed: true, used: 0, cap: null };

  const monthStart = startOfMonthUtc(new Date());
  const agg = await prisma.voiceUsageLog.aggregate({
    where: {
      companyId,
      kind: "tts",
      createdAt: { gte: monthStart },
    },
    _sum: { charsIn: true },
  });
  const used = agg._sum.charsIn ?? 0;
  return { allowed: used < cap, used, cap };
}

function readSessionCapChars(): number {
  const raw = process.env.VOICE_MAX_CHARS_PER_SESSION;
  if (!raw) return DEFAULT_SESSION_CAP_CHARS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_SESSION_CAP_CHARS;
  return n;
}

async function readTenantCapChars(companyId: string): Promise<number | null> {
  const sub = await prisma.subscription.findUnique({
    where: { companyId },
    select: { plan: { select: { limits: true } } },
  });
  const limits = sub?.plan?.limits;
  if (!limits || typeof limits !== "object" || Array.isArray(limits)) {
    return null;
  }
  const raw = (limits as Record<string, unknown>).voice_chars_per_month;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    return null;
  }
  return raw;
}

function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
