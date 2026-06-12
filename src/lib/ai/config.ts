// Runtime AI config resolver.
//
// Resolves model IDs + caps + coach defaults from a tiered hierarchy:
//   1. Environment variables (ANTHROPIC_MODEL, ANTHROPIC_MODEL_FAST) — win
//      when set. Useful for dev overrides and per-deployment overrides
//      without touching the DB.
//   2. PlatformSettings singleton row (edited via /super/ai-config).
//   3. Hard-coded fallbacks (safe defaults if neither is available).
//
// Cached per request via React.cache so the singleton is fetched at most
// once per request even when multiple AI calls happen.

import { cache } from "react";
import { prisma } from "@/lib/db/client";

const FALLBACK = {
  model: "claude-opus-4-7",
  fastModel: "claude-haiku-4-5-20251001",
  maxTokensPerTurn: 700,
  defaultCoachPersona: null as string | null,
  defaultCoachGuardrails: null as string | null,
};

export type AIConfig = {
  model: string;
  fastModel: string;
  maxTokensPerTurn: number;
  defaultCoachPersona: string | null;
  defaultCoachGuardrails: string | null;
  /** What hierarchy slot supplied the model/fastModel. Useful for debugging. */
  source: "env" | "db" | "fallback";
};

export const getAIConfig = cache(async (): Promise<AIConfig> => {
  const envModel = process.env.ANTHROPIC_MODEL;
  const envFast = process.env.ANTHROPIC_MODEL_FAST;
  const envOverride = Boolean(envModel || envFast);

  let dbModel: string | null = null;
  let dbFast: string | null = null;
  let maxTokens = FALLBACK.maxTokensPerTurn;
  let defaultPersona: string | null = null;
  let defaultGuardrails: string | null = null;
  let foundDb = false;

  try {
    const row = await prisma.platformSettings.findUnique({
      where: { id: "singleton" },
    });
    if (row) {
      foundDb = true;
      dbModel = row.defaultModel;
      dbFast = row.fastModel;
      maxTokens = row.maxTokensPerTurn;
      defaultPersona = row.defaultCoachPersona;
      defaultGuardrails = row.defaultCoachGuardrails;
    }
  } catch {
    // DB not reachable; use fallback. Don't fail AI requests on settings.
  }

  return {
    model: envModel ?? dbModel ?? FALLBACK.model,
    fastModel: envFast ?? dbFast ?? FALLBACK.fastModel,
    maxTokensPerTurn: maxTokens,
    defaultCoachPersona: defaultPersona,
    defaultCoachGuardrails: defaultGuardrails,
    source: envOverride ? "env" : foundDb ? "db" : "fallback",
  };
});
