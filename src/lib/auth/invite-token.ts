// Stateless HMAC-signed invite tokens.
//
// Each token encodes `{ userId, expiresAt }` plus an HMAC-SHA256
// signature derived from a server-side secret. Verifying a token is a
// pure string + crypto operation — no DB lookup, no InviteToken table,
// no schema migration. The trade-off: single-use enforcement happens
// at the acceptance step (step c) by checking `User.status === "invited"`
// before activating the account.
//
// Secret resolution order:
//   1. INVITE_TOKEN_SECRET (preferred — rotateable independent of other keys)
//   2. SUPABASE_SERVICE_ROLE_KEY (fallback — already server-only secret)
//
// If neither is set, `getSecret()` throws so we never accidentally
// issue tokens signed with an empty key.

import { createHmac, timingSafeEqual } from "crypto";

const DEFAULT_TTL_DAYS = 7;

export type InvitePayload = { userId: string; expiresAt: number };

export function signInviteToken(
  userId: string,
  opts?: { ttlDays?: number },
): { token: string; expiresAt: Date } {
  const ttl = (opts?.ttlDays ?? DEFAULT_TTL_DAYS) * 86_400 * 1000;
  const expiresAtMs = Date.now() + ttl;
  const payload = encodePayload({ userId, expiresAt: expiresAtMs });
  const sig = sign(payload);
  return {
    token: `${payload}.${sig}`,
    expiresAt: new Date(expiresAtMs),
  };
}

/**
 * Verify a token and return its payload, or null when the signature is
 * invalid / the token has expired / the format is malformed.
 *
 * Always uses constant-time compare on the signature so an attacker
 * can't time-attack the HMAC.
 */
export function verifyInviteToken(token: string): InvitePayload | null {
  if (typeof token !== "string" || token.length === 0) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig) return null;

  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  const decoded = decodePayload(payload);
  if (!decoded) return null;
  if (decoded.expiresAt < Date.now()) return null;
  return decoded;
}

export function inviteUrlFor(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base.replace(/\/+$/, "")}/invite/${token}`;
}

// ─────────────── internals ───────────────

function getSecret(): string {
  const s =
    process.env.INVITE_TOKEN_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) {
    throw new Error(
      "Invite tokens need INVITE_TOKEN_SECRET (or SUPABASE_SERVICE_ROLE_KEY) set.",
    );
  }
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
}

function encodePayload(p: InvitePayload): string {
  return Buffer.from(`${p.userId}.${p.expiresAt}`).toString("base64url");
}

function decodePayload(encoded: string): InvitePayload | null {
  let raw: string;
  try {
    raw = Buffer.from(encoded, "base64url").toString();
  } catch {
    return null;
  }
  const dot = raw.indexOf(".");
  if (dot < 1) return null;
  const userId = raw.slice(0, dot);
  const expiresAt = Number(raw.slice(dot + 1));
  if (!userId || !Number.isFinite(expiresAt)) return null;
  return { userId, expiresAt };
}
