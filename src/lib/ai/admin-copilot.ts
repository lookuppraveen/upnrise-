// Admin Copilot — system prompt + tool-use loop runner.
//
// runCopilotTurn() takes the conversation so far + current page context and
// returns the final assistant text plus a log of tool calls performed (so the
// client can show "took N actions").
//
// We use non-streaming for Phase 3.3 — tool rounds make streaming complex,
// and a 5–15s response with a spinner is acceptable for actions like
// "assign this training to the EMEA team."

import { anthropic } from "./client";
import { getAIConfig } from "./config";
import { ADMIN_TOOLS, getTool, type ToolCtx } from "./admin-tools";
import type { SessionUser } from "@/lib/auth/session";

type Msg = { role: "user" | "assistant"; content: string };

export type ActionLogEntry = {
  tool: string;
  summary: string;
  ok: boolean;
};

const MAX_TOOL_ROUNDS = 5;

function buildSystemPrompt(args: {
  companyName: string | null;
  currentPath: string | null;
}): string {
  const { companyName, currentPath } = args;
  return [
    `You are the Admin Copilot for ${companyName ?? "the admin's tenant"}.`,
    "",
    "## Who you serve",
    "An L&D admin who manages trainings, learners, and assignments. They expect concrete, data-backed answers and a fast path to action.",
    "",
    "## Tools",
    "You have tools to read data (stats, trainings, assignments, employees) and one tool to act (assign_training). Use them.",
    "- ALWAYS call a tool when the user asks about real numbers or named entities. Never fabricate names, IDs, or stats.",
    "- For 'assign X to Y', call assign_training. You can list_employees first if you need to resolve a description (e.g. 'all EMEA reps') to specific emails.",
    "- Don't ask for confirmation for additive actions like assigning training. Just do it and report what happened.",
    "- For destructive or large-scale changes (50+ learners, mass unassign, etc), summarize the plan in one sentence FIRST and let the user confirm before calling the write tool.",
    "",
    "## Voice",
    "- 2–3 sentence default. Lists only when listing things.",
    "- Use the data, not generic frameworks. Specific names, specific numbers.",
    "- After taking an action, say what was done and offer one concrete next step.",
    "- Markdown links are OK and will navigate naturally — point to /admin/trainings, /admin/assignments, etc. when relevant.",
    currentPath ? `\n## Current page\nThe admin is viewing \`${currentPath}\`. Use that as context but don't be limited by it.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function runCopilotTurn(args: {
  user: SessionUser;
  companyName: string | null;
  currentPath: string | null;
  messages: Msg[];
}): Promise<{ reply: string; actions: ActionLogEntry[] }> {
  if (!args.user.companyId) {
    return {
      reply: "Your account isn't linked to a tenant.",
      actions: [],
    };
  }
  const ctx: ToolCtx = { user: args.user, companyId: args.user.companyId };

  const system = buildSystemPrompt({
    companyName: args.companyName,
    currentPath: args.currentPath,
  });

  // Build the Anthropic messages array. Starts as the conversation, mutates
  // as we accumulate assistant responses and tool results.
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
      max_tokens: Math.max(1200, ai.maxTokensPerTurn),
      system,
      tools: ADMIN_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as never,
      })),
      messages: messages as never,
    });

    // Push the assistant message in full (text + tool_use blocks) so the
    // next round has the right context.
    messages.push({ role: "assistant", content: response.content as never });

    if (response.stop_reason !== "tool_use") {
      const replyText = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();
      return { reply: replyText || "(no reply)", actions };
    }

    // Execute every tool_use block in this assistant turn.
    const toolUses = response.content.filter((b) => b.type === "tool_use");
    const toolResults: Array<{
      type: "tool_result";
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    }> = [];

    for (const block of toolUses) {
      if (block.type !== "tool_use") continue;
      const tool = getTool(block.name);
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
        const result = await tool.handler(block.input, ctx);
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

  // Exceeded round budget — fail gracefully.
  return {
    reply:
      "I hit the tool-use round limit. Try breaking the request into smaller steps.",
    actions,
  };
}
