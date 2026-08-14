// Env-var fallback for LLM providers. Mirrors src/lib/video/env-fallback.ts.
// When an admin saves an LlmProvider row with a blank apiKey and the kind
// has a mapped env var, we hydrate the DB row from process.env at save
// time. Rotating the env var later requires re-saving the row.

import type { LlmProviderKind } from "@prisma/client";

export const LLM_ENV_FALLBACK_VARS: Partial<Record<LlmProviderKind, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  sarvam: "SARVAM_API_KEY",
};

export function resolveLlmEnvFallback(kind: LlmProviderKind): string | null {
  const varName = LLM_ENV_FALLBACK_VARS[kind];
  if (!varName) return null;
  const val = process.env[varName];
  return val && val.trim().length >= 8 ? val.trim() : null;
}

export function getLlmEnvFallbackKinds(): LlmProviderKind[] {
  const kinds: LlmProviderKind[] = [];
  for (const kind of Object.keys(LLM_ENV_FALLBACK_VARS) as LlmProviderKind[]) {
    if (resolveLlmEnvFallback(kind)) kinds.push(kind);
  }
  return kinds;
}
