// Client-safe constants for the LLM provider UI. Kept out of llm.ts
// because that file `import "server-only"` and drags in the Anthropic
// SDK, which fails at client-bundle time (node:fs/promises etc.).

import type { LlmProviderKind } from "@prisma/client";

// These strings intentionally duplicate the defaults from src/lib/ai/llm.ts
// (SARVAM_DEFAULT_* + the MODEL / MODEL_FAST constants from client.ts).
// Keeping them here means UI code doesn't need a server-only import; the
// factory is the source of truth for runtime behavior.
const ANTHROPIC_DEFAULT_MODEL = "claude-opus-4-7";
const ANTHROPIC_DEFAULT_FAST_MODEL = "claude-haiku-4-5-20251001";
// Keep in sync with SARVAM_DEFAULT_MODEL in llm.ts. sarvam-m was
// deprecated Aug 2026 — sarvam-105b replaced it.
const SARVAM_DEFAULT_MODEL = "sarvam-105b";
const SARVAM_DEFAULT_BASE = "https://api.sarvam.ai/v1";

export const LLM_PROVIDER_LABEL: Record<LlmProviderKind, string> = {
  anthropic: "Anthropic (Claude)",
  sarvam: "Sarvam AI",
};

export const LLM_PROVIDER_DESCRIPTION: Record<LlmProviderKind, string> = {
  anthropic:
    "Default. Powers every Copilot, Coach, Roleplay, and scoring call.",
  sarvam:
    "OpenAI-compatible Indic-first LLM. Routed for weekly briefs and other simple text-gen calls only — the tool-use Copilots stay on Anthropic.",
};

export const LLM_PROVIDER_KINDS: LlmProviderKind[] = ["anthropic", "sarvam"];

export const LLM_DEFAULT_MODEL: Record<LlmProviderKind, string> = {
  anthropic: ANTHROPIC_DEFAULT_MODEL,
  sarvam: SARVAM_DEFAULT_MODEL,
};

export const LLM_DEFAULT_FAST_MODEL: Record<LlmProviderKind, string> = {
  anthropic: ANTHROPIC_DEFAULT_FAST_MODEL,
  sarvam: SARVAM_DEFAULT_MODEL,
};

export const LLM_DEFAULT_BASE_URL: Record<LlmProviderKind, string | null> = {
  anthropic: null,
  sarvam: SARVAM_DEFAULT_BASE,
};
