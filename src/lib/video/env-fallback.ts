// Server-only helpers for provider env-var fallback. Some providers
// (currently ElevenLabs) let admins skip pasting a key and use the
// server-configured env var instead. This module owns the mapping and
// the resolve logic so the admin server action and the admin page stay
// in sync.

import type { VideoProviderKind } from "@prisma/client";

export const ENV_FALLBACK_VARS: Partial<Record<VideoProviderKind, string>> = {
  elevenlabs: "ELEVENLABS_API_KEY",
};

export function resolveEnvFallback(kind: VideoProviderKind): string | null {
  const varName = ENV_FALLBACK_VARS[kind];
  if (!varName) return null;
  const val = process.env[varName];
  return val && val.trim().length >= 8 ? val.trim() : null;
}

export function getEnvFallbackKinds(): VideoProviderKind[] {
  const kinds: VideoProviderKind[] = [];
  for (const kind of Object.keys(ENV_FALLBACK_VARS) as VideoProviderKind[]) {
    if (resolveEnvFallback(kind)) kinds.push(kind);
  }
  return kinds;
}
