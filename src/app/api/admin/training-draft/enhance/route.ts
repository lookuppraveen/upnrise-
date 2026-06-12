// POST /api/admin/training-draft/enhance
//
// Body: { prompt: string }
// Resp: { prompt: string }
//
// Rewrites the admin's free-form Generator prompt into a structured
// brief the bulk-generate pass can use directly. Mirrors the PDF p7
// "Enhance Prompt" UX: takes a one-liner like "I want to create
// roleplays for sales manager from healthcare company to train on
// negotiation" and returns a sectioned brief with totals, objectives,
// scenarios, skills, etc.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { anthropic } from "@/lib/ai/client";
import { getAIConfig } from "@/lib/ai/config";

const Body = z.object({ prompt: z.string().min(10).max(4000) });

const OutSchema = z.object({
  prompt: z.string().min(50).max(4000),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad body" }, { status: 400 });

  const system = [
    "You are a sales L&D program designer. Take an admin's brief one-line training intent and rewrite it as a structured prompt the downstream module-generation step can use directly.",
    "",
    "Output a multi-section brief in plain text (no markdown headers needed). Cover at minimum:",
    "- Target audience (role + experience level + industry)",
    "- Primary learning objective (one measurable outcome)",
    "- Supporting objectives (2-4 sub-skills)",
    "- Total Roleplays / Total Activities / Total Assessments (suggested counts and what each covers)",
    "- Scenario types the learner will face",
    "- Key challenges to simulate",
    "- Skill development focus",
    "",
    "Stay grounded in the original intent — don't invent industries or audiences the admin didn't mention.",
    "Use the submit_enhanced tool. Never write prose outside the tool call.",
  ].join("\n");

  const ai = await getAIConfig();
  const result = await anthropic.messages.create({
    model: ai.fastModel,
    max_tokens: 1500,
    system,
    tools: [
      {
        name: "submit_enhanced",
        description: "Submit the enhanced multi-section training brief.",
        input_schema: {
          type: "object",
          properties: { prompt: { type: "string" } },
          required: ["prompt"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "submit_enhanced" },
    messages: [
      {
        role: "user",
        content: `## Admin's brief\n${parsed.data.prompt}\n\nRewrite it as a structured training brief.`,
      },
    ],
  });

  const toolUse = result.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json({ error: "no draft" }, { status: 502 });
  }
  const validated = OutSchema.safeParse(toolUse.input);
  if (!validated.success) {
    return NextResponse.json({ error: "invalid draft" }, { status: 502 });
  }
  return NextResponse.json(validated.data);
}
