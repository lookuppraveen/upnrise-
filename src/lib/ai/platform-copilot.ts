// Platform AI Copilot — system prompt + tool-use loop runner.
//
// Key design property: this assistant is OPERATOR-LEVEL. It can reason
// across tenants and surface aggregated insights, but the prompt forbids
// blending one tenant's specifics into another's discussion. When it talks
// about a specific tenant, that tenant is named.

import { anthropic } from "./client";
import { getAIConfig } from "./config";
import { PLATFORM_TOOLS, getPlatformTool } from "./platform-tools";
import type { SessionUser } from "@/lib/auth/session";

type Msg = { role: "user" | "assistant"; content: string };

export type ActionLogEntry = {
  tool: string;
  summary: string;
  ok: boolean;
};

const MAX_TOOL_ROUNDS = 6;

function buildSystemPrompt(args: {
  operatorEmail: string;
  currentPath: string | null;
}): string {
  return [
    `You are the Platform AI Copilot for the UPnRise super-admin (${args.operatorEmail}).`,
    "",
    "## Who you serve",
    "An UPnRise platform operator — sales/CS leadership running the business across all tenants. They need concrete, data-backed answers fast, and they need help drafting CSM-quality interventions.",
    "",
    "## Tools",
    "You have read-only tools to query platform stats, list at-risk tenants, list companies (with filters), get a specific tenant's detail, list plans, and read the cross-tenant audit log. Use them.",
    "- ALWAYS call a tool when the user asks about real numbers, named tenants, or specific accounts. Never fabricate names, numbers, churn risks, or stats.",
    "- For 'who is at risk' or 'draft an outreach' questions, start with list_at_risk_companies, then optionally get_company_detail for the one(s) you'll discuss.",
    "- For plan-mix or pricing questions, list_plans is your starting point.",
    "",
    "## Anti-leakage discipline (critical)",
    "- When you reference a tenant's specifics (numbers, names, stats), they must be tied to that tenant by name. Don't blend stats from multiple tenants in a single statistic.",
    "- Never expose one tenant's internal data while pretending to talk about a different tenant. If asked something like 'how does Cyberdyne compare to Hooli', use both names explicitly and quote each one's own numbers.",
    "- It's fine to discuss AGGREGATES (e.g. 'avg score across all tenants') — those are operator-level by design.",
    "",
    "## Voice",
    "- 2–3 sentence default. Lists only when listing.",
    "- Be concrete: 'Hooli is at 78% churn risk, MRR $36.5k. Suggest reaching out to alex@upnrise.com this week with...' — not 'Hooli might need attention.'",
    "- Drafting outreach: write the actual sentences a CSM would say or send, in 2–4 sentences. No template language.",
    "- Forecasts: anchor in real numbers from tools. Caveat with 'based on current trend' once when relevant; don't pile on hedges.",
    "- Markdown links to /super/companies/[id] etc are OK and navigate naturally.",
    args.currentPath ? `\n## Current page\nThe operator is viewing \`${args.currentPath}\`.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function runPlatformCopilotTurn(args: {
  user: SessionUser;
  currentPath: string | null;
  messages: Msg[];
}): Promise<{ reply: string; actions: ActionLogEntry[] }> {
  const system = buildSystemPrompt({
    operatorEmail: args.user.email,
    currentPath: args.currentPath,
  });

  type AnthMsg = {
    role: "user" | "assistant";
    content:
      | string
      | Array<
          | { type: "text"; text: string }
          | { type: "tool_use"; id: string; name: string; input: unknown }
          | {
              type: "tool_result";
              tool_use_id: string;
              content: string;
              is_error?: boolean;
            }
        >;
  };
  const messages: AnthMsg[] = args.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const ai = await getAIConfig();
  const actions: ActionLogEntry[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model: ai.model,
      max_tokens: Math.max(1500, ai.maxTokensPerTurn),
      system,
      tools: PLATFORM_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as never,
      })),
      messages: messages as never,
    });

    messages.push({ role: "assistant", content: response.content as never });

    if (response.stop_reason !== "tool_use") {
      const replyText = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();
      return { reply: replyText || "(no reply)", actions };
    }

    const toolUses = response.content.filter((b) => b.type === "tool_use");
    const toolResults: Array<{
      type: "tool_result";
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    }> = [];

    for (const block of toolUses) {
      if (block.type !== "tool_use") continue;
      const tool = getPlatformTool(block.name);
      if (!tool) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ error: `unknown tool: ${block.name}` }),
          is_error: true,
        });
        actions.push({ tool: block.name, summary: "unknown tool", ok: false });
        continue;
      }
      try {
        const result = await tool.handler(block.input);
        if (result.ok) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result.data),
          });
          actions.push({
            tool: block.name,
            summary: result.summary,
            ok: true,
          });
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ error: result.error }),
            is_error: true,
          });
          actions.push({ tool: block.name, summary: result.error, ok: false });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "tool execution failed";
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ error: msg }),
          is_error: true,
        });
        actions.push({ tool: block.name, summary: msg, ok: false });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  return {
    reply:
      "I hit the tool-use round limit. Try breaking the request into smaller steps.",
    actions,
  };
}
