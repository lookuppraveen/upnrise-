// POST /api/admin/training-draft/improve
//
// Body: { title?: string, description: string }
// Resp: { description: string }
//
// Inline "Improve with AI" for the Step 1 description field. Takes the
// admin's current draft and returns a tightened version — same voice,
// scenario-led opener, 2–3 sentences. Forced tool-use for guaranteed JSON.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { anthropic } from "@/lib/ai/client";
import { getAIConfig } from "@/lib/ai/config";

const Body = z.object({
  title: z.string().max(200).optional(),
  description: z.string().min(10).max(2000),
});

const OutSchema = z.object({
  description: z.string().min(20).max(600),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad body" }, { status: 400 });

  const systemPrompt = [
    "You are a sales L&D copywriter. Improve a training description.",
    "Rules:",
    "- 2-3 sentences. Open with the buyer scenario the learner will face. End with what they will be able to do.",
    "- Keep the original meaning. Tighten, sharpen verbs, remove abstractions.",
    "- Don't add scope the original didn't promise.",
    "- Use the submit_improved tool. Never write prose outside the tool call.",
  ].join("\n");

  const ai = await getAIConfig();
  const result = await anthropic.messages.create({
    model: ai.fastModel,
    max_tokens: 600,
    system: systemPrompt,
    tools: [
      {
        name: "submit_improved",
        description: "Submit the tightened description.",
        input_schema: {
          type: "object",
          properties: { description: { type: "string" } },
          required: ["description"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "submit_improved" },
    messages: [
      {
        role: "user",
        content: [
          parsed.data.title ? `## Title\n${parsed.data.title}\n` : "",
          `## Current description\n${parsed.data.description}\n`,
          "Improve it. Use the submit_improved tool.",
        ]
          .filter(Boolean)
          .join("\n"),
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
