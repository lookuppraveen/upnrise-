// Env-var fallback for TTS providers. Mirrors src/lib/video/env-fallback.ts.

import type { TtsProviderKind } from "@prisma/client";

export const TTS_ENV_FALLBACK_VARS: Partial<Record<TtsProviderKind, string>> = {
  elevenlabs: "ELEVENLABS_API_KEY",
  sarvam: "SARVAM_API_KEY",
};

export function resolveTtsEnvFallback(kind: TtsProviderKind): string | null {
  const varName = TTS_ENV_FALLBACK_VARS[kind];
  if (!varName) return null;
  const val = process.env[varName];
  return val && val.trim().length >= 8 ? val.trim() : null;
}

export function getTtsEnvFallbackKinds(): TtsProviderKind[] {
  const kinds: TtsProviderKind[] = [];
  for (const kind of Object.keys(TTS_ENV_FALLBACK_VARS) as TtsProviderKind[]) {
    if (resolveTtsEnvFallback(kind)) kinds.push(kind);
  }
  return kinds;
}
