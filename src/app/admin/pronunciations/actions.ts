"use server";

// Server actions for the Pronunciations editor.
// - CRUD: create, update, delete (admin gate, tenant-scoped)
// - AI: generate via Claude with forced tool-use for guaranteed JSON
//
// AI calls run against the Fast model (cheap, deterministic), respecting the
// platform AI config Phase 5.0 wires up.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { anthropic } from "@/lib/ai/client";
import { getAIConfig } from "@/lib/ai/config";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    throw new Error("forbidden");
  }
  return user;
}

const WordSchema = z.string().min(1).max(80).trim();

const PayloadSchema = z.object({
  word: WordSchema,
  phonetic: z.string().min(1).max(200).trim(),
  mnemonic: z.string().max(400).trim().optional(),
  notes: z.string().max(600).trim().optional(),
  generatedByAi: z.boolean().optional(),
});

export async function createPronunciation(input: z.infer<typeof PayloadSchema>) {
  const user = await requireAdmin();
  const parsed = PayloadSchema.parse(input);
  await prisma.pronunciation.upsert({
    where: {
      companyId_word: { companyId: user.companyId!, word: parsed.word },
    },
    update: {
      phonetic: parsed.phonetic,
      mnemonic: parsed.mnemonic || null,
      notes: parsed.notes || null,
      generatedByAi: parsed.generatedByAi ?? false,
    },
    create: {
      companyId: user.companyId!,
      word: parsed.word,
      phonetic: parsed.phonetic,
      mnemonic: parsed.mnemonic || null,
      notes: parsed.notes || null,
      generatedByAi: parsed.generatedByAi ?? false,
    },
  });
  revalidatePath("/admin/pronunciations");
}

export async function updatePronunciation(
  id: string,
  input: z.infer<typeof PayloadSchema>,
) {
  const user = await requireAdmin();
  const parsed = PayloadSchema.parse(input);
  const existing = await prisma.pronunciation.findFirst({
    where: { id, companyId: user.companyId! },
    select: { id: true },
  });
  if (!existing) throw new Error("not found");
  await prisma.pronunciation.update({
    where: { id },
    data: {
      word: parsed.word,
      phonetic: parsed.phonetic,
      mnemonic: parsed.mnemonic || null,
      notes: parsed.notes || null,
      // Manual edits unset the AI badge unless the caller explicitly preserves it.
      generatedByAi: parsed.generatedByAi ?? false,
    },
  });
  revalidatePath("/admin/pronunciations");
}

export async function deletePronunciation(id: string) {
  const user = await requireAdmin();
  const existing = await prisma.pronunciation.findFirst({
    where: { id, companyId: user.companyId! },
    select: { id: true },
  });
  if (!existing) throw new Error("not found");
  await prisma.pronunciation.delete({ where: { id } });
  revalidatePath("/admin/pronunciations");
}

const GenerateInput = z.object({
  word: WordSchema,
  context: z.string().max(400).trim().optional(),
});

const GenerateResult = z.object({
  phonetic: z.string().min(1).max(200),
  mnemonic: z.string().min(1).max(400),
  notes: z.string().max(600).optional(),
});

export async function generatePronunciation(
  input: z.infer<typeof GenerateInput>,
): Promise<{ phonetic: string; mnemonic: string; notes: string }> {
  await requireAdmin();
  const parsed = GenerateInput.parse(input);

  const system = [
    "You are a pronunciation coach for a sales training tool. Given a word",
    "(often a brand name, acronym, or industry jargon), produce a tight",
    "phonetic spelling, a 'say-it-like' mnemonic, and a one-sentence note.",
    "",
    "Rules:",
    "- phonetic: simple readable spelling with hyphens between syllables and",
    "  the stressed syllable in CAPS. e.g. 'MED-ick', 'SIGH-ber-dyne'.",
    "  Do NOT use IPA — most users can't read it.",
    "- mnemonic: 'rhymes with…' or 'like… but with…' — 1 sentence max.",
    "- notes: brief — origin, stress nuance, common mispronunciation. 1 sentence.",
    "- Use the submit_pronunciation tool. Never write prose outside the tool call.",
  ].join("\n");

  const ai = await getAIConfig();
  const result = await anthropic.messages.create({
    model: ai.fastModel,
    max_tokens: 400,
    system,
    tools: [
      {
        name: "submit_pronunciation",
        description: "Submit the pronunciation breakdown.",
        input_schema: {
          type: "object",
          properties: {
            phonetic: { type: "string" },
            mnemonic: { type: "string" },
            notes: { type: "string" },
          },
          required: ["phonetic", "mnemonic"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "submit_pronunciation" },
    messages: [
      {
        role: "user",
        content: parsed.context
          ? `## Word\n${parsed.word}\n\n## Context\n${parsed.context}\n\nProduce the pronunciation.`
          : `## Word\n${parsed.word}\n\nProduce the pronunciation.`,
      },
    ],
  });

  const toolUse = result.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("AI did not return structured output");
  }
  const validated = GenerateResult.safeParse(toolUse.input);
  if (!validated.success) {
    throw new Error("AI output failed validation");
  }
  return {
    phonetic: validated.data.phonetic,
    mnemonic: validated.data.mnemonic,
    notes: validated.data.notes ?? "",
  };
}
