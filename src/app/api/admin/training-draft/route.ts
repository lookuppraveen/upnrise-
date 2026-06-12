// POST /api/admin/training-draft
//
// Body: { brief: string }
// Resp: { title, description, categories[], module_suggestions[] }
//
// AI hero for the Add Training wizard. Takes a free-form brief and returns
// a structured starter — title, description, 2–4 category chips, and a few
// module suggestions. Forced tool-use so we get guaranteed JSON.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { anthropic } from "@/lib/ai/client";
import { getAIConfig } from "@/lib/ai/config";

const Body = z.object({ brief: z.string().min(10).max(2000) });

const DraftSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(20).max(600),
  categories: z.array(z.string().min(2).max(40)).min(1).max(4),
  module_suggestions: z
    .array(
      z.object({
        type: z.enum(["video", "roleplay", "quiz"]),
        name: z.string().min(3).max(120),
        reason: z.string().max(200).optional(),
      }),
    )
    .max(5),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad body" }, { status: 400 });

  const systemPrompt = [
    "You are a sales L&D designer. Given a brief, propose a training: a crisp title, a 2-3 sentence description, 2-4 category chips, and 3-5 module suggestions.",
    "Rules:",
    "- title: outcome-focused, ≤8 words. Verbal moves, not abstract nouns (e.g. 'Close on value, not price').",
    "- description: 2-3 sentences. Open with the buyer scenario the learner will face. End with what they'll be able to do.",
    "- categories: short noun phrases, e.g. 'Sales', 'Discovery', 'Pricing', 'Objection handling'. No overlap.",
    "- module_suggestions: realistic mix. Default to one short video + one or two roleplays + one knowledge check.",
    "- Use the submit_draft tool. Never write prose outside the tool call.",
  ].join("\n");

  const ai = await getAIConfig();
  const result = await anthropic.messages.create({
    model: ai.fastModel,
    max_tokens: 1024,
    system: systemPrompt,
    tools: [
      {
        name: "submit_draft",
        description: "Submit the structured training draft.",
        input_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            categories: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
              maxItems: 4,
            },
            module_suggestions: {
              type: "array",
              maxItems: 5,
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["video", "roleplay", "quiz"] },
                  name: { type: "string" },
                  reason: { type: "string" },
                },
                required: ["type", "name"],
              },
            },
          },
          required: ["title", "description", "categories", "module_suggestions"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "submit_draft" },
    messages: [
      {
        role: "user",
        content: `## Brief\n${parsed.data.brief}\n\nDraft a training. Use the submit_draft tool.`,
      },
    ],
  });

  const toolUse = result.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json({ error: "no draft" }, { status: 502 });
  }
  const validated = DraftSchema.safeParse(toolUse.input);
  if (!validated.success) {
    return NextResponse.json({ error: "invalid draft" }, { status: 502 });
  }
  return NextResponse.json(validated.data);
}
