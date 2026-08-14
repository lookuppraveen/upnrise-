// Per-tenant LLM factory for the "simple text-gen" surfaces.
//
// Scope reminder (BUILD_PLAN option B): this factory covers stateless
// one-shot text generation only — weekly briefs, single-turn copy
// rewrites, that kind of thing. The Anthropic-tool-use loops in
// admin-copilot.ts / platform-copilot.ts / scoring.ts stay hardcoded on
// the direct anthropic client until we build an Anthropic ↔ OpenAI
// message-shape translator.
//
// Resolution order (mirrors getAIConfig):
//   1. Tenant LlmProvider row with isDefault=true
//   2. Environment variables (ANTHROPIC_MODEL, ANTHROPIC_MODEL_FAST)
//   3. PlatformSettings singleton
//   4. Hard-coded fallbacks
//
// Both Anthropic and Sarvam ship a `generateText()` returning a string,
// so call sites don't need to branch on provider.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { LlmProviderKind } from "@prisma/client";
import { anthropic as sharedAnthropic } from "./client";
import { getAIConfig } from "./config";
import { prisma } from "@/lib/db/client";

const SARVAM_DEFAULT_BASE = "https://api.sarvam.ai/v1";
// sarvam-m was deprecated Aug 2026; sarvam-105b is the current
// general-purpose chat model, sarvam-105b-conversations is tuned for
// multi-turn. We default to sarvam-105b for the one-shot text-gen surfaces
// that this factory covers.
const SARVAM_DEFAULT_MODEL = "sarvam-105b";

export type LlmClient = {
  kind: LlmProviderKind;
  model: string;
  fastModel: string;
  /**
   * Non-streaming single-turn text generation. Returns "" if the upstream
   * fails — callers already handle empty replies as "use deterministic
   * fallback" per the summary.ts contract.
   */
  generateText(args: {
    system: string;
    user: string;
    maxTokens?: number;
    /** Use the fast model instead of the default. */
    fast?: boolean;
  }): Promise<string>;
};

/**
 * Resolve an LLM client for the given company. Pass `null` (unknown tenant,
 * platform-scope call) to get the platform-default Anthropic client.
 */
export async function getLlmClient(
  companyId: string | null,
): Promise<LlmClient> {
  const ai = await getAIConfig();

  if (companyId) {
    const row = await prisma.llmProvider
      .findFirst({
        where: { companyId, isDefault: true },
      })
      .catch(() => null);
    if (row) {
      if (row.kind === "sarvam") {
        return buildSarvamClient({
          apiKey: row.apiKey,
          baseUrl: row.baseUrl ?? SARVAM_DEFAULT_BASE,
          model: row.defaultModel ?? SARVAM_DEFAULT_MODEL,
          fastModel: row.fastModel ?? row.defaultModel ?? SARVAM_DEFAULT_MODEL,
        });
      }
      // Anthropic — use a tenant-scoped client if the row has its own key.
      return buildAnthropicClient({
        apiKey: row.apiKey,
        model: row.defaultModel ?? ai.model,
        fastModel: row.fastModel ?? ai.fastModel,
      });
    }
  }

  // Platform default — reuse the shared Anthropic client so we don't
  // spin up a new one per request.
  return {
    kind: "anthropic",
    model: ai.model,
    fastModel: ai.fastModel,
    generateText: (args) =>
      anthropicGenerateText(sharedAnthropic, {
        model: args.fast ? ai.fastModel : ai.model,
        system: args.system,
        user: args.user,
        maxTokens: args.maxTokens ?? ai.maxTokensPerTurn,
      }),
  };
}

// ─── Drivers ───

function buildAnthropicClient(cfg: {
  apiKey: string;
  model: string;
  fastModel: string;
}): LlmClient {
  const client = new Anthropic({ apiKey: cfg.apiKey });
  return {
    kind: "anthropic",
    model: cfg.model,
    fastModel: cfg.fastModel,
    generateText: (args) =>
      anthropicGenerateText(client, {
        model: args.fast ? cfg.fastModel : cfg.model,
        system: args.system,
        user: args.user,
        maxTokens: args.maxTokens ?? 700,
      }),
  };
}

function buildSarvamClient(cfg: {
  apiKey: string;
  baseUrl: string;
  model: string;
  fastModel: string;
}): LlmClient {
  return {
    kind: "sarvam",
    model: cfg.model,
    fastModel: cfg.fastModel,
    generateText: async (args) =>
      sarvamGenerateText({
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        model: args.fast ? cfg.fastModel : cfg.model,
        system: args.system,
        user: args.user,
        maxTokens: args.maxTokens ?? 700,
      }),
  };
}

async function anthropicGenerateText(
  client: Anthropic,
  args: {
    model: string;
    system: string;
    user: string;
    maxTokens: number;
  },
): Promise<string> {
  try {
    const resp = await client.messages.create({
      model: args.model,
      max_tokens: args.maxTokens,
      system: args.system,
      messages: [{ role: "user", content: args.user }],
    });
    return resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
  } catch (err) {
    console.error("[llm.anthropic] error", err);
    return "";
  }
}

// Sarvam's chat completions endpoint is OpenAI-compatible; we hit it with
// fetch to avoid pulling the openai SDK just for one call site.
async function sarvamGenerateText(args: {
  apiKey: string;
  baseUrl: string;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
}): Promise<string> {
  try {
    const res = await fetch(
      `${args.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${args.apiKey}`,
        },
        body: JSON.stringify({
          model: args.model,
          max_tokens: args.maxTokens,
          messages: [
            { role: "system", content: args.system },
            { role: "user", content: args.user },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[llm.sarvam] HTTP ${res.status}: ${text.slice(0, 200)}`,
      );
      return "";
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content?.trim() ?? "";
  } catch (err) {
    console.error("[llm.sarvam] error", err);
    return "";
  }
}

// Re-export client-safe label/model constants. These live in
// llm-constants.ts so client components can import them without
// dragging in the Anthropic SDK (which requires node:fs/promises).
export {
  LLM_PROVIDER_LABEL,
  LLM_PROVIDER_DESCRIPTION,
  LLM_PROVIDER_KINDS,
  LLM_DEFAULT_MODEL,
  LLM_DEFAULT_FAST_MODEL,
  LLM_DEFAULT_BASE_URL,
} from "./llm-constants";
