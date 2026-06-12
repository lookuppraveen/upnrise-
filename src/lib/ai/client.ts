// Centralized Anthropic client. All AI surfaces in the prototypes are scripted —
// in production every Copilot / Coach / Roleplay / Generate call goes through here.
// See BUILD_PLAN.md §6.
//
// Per-feature system prompts and streaming wrappers live next to this file in
// Phases 2–3. This module is intentionally tiny in Phase 0.

import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey && process.env.NODE_ENV === "production") {
  throw new Error("ANTHROPIC_API_KEY is not set");
}

export const anthropic = new Anthropic({
  apiKey: apiKey ?? "missing-key-set-in-env",
});

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";
export const MODEL_FAST =
  process.env.ANTHROPIC_MODEL_FAST ?? "claude-haiku-4-5-20251001";
