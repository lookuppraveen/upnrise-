"use server";

// LLM provider config actions. Same one-default-at-a-time shape as
// video-providers/actions.ts. Only tenant admins can call these.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { LlmProviderKind } from "@prisma/client";
import {
  LLM_ENV_FALLBACK_VARS,
  resolveLlmEnvFallback,
} from "@/lib/ai/llm-env-fallback";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    throw new Error("forbidden");
  }
  return user;
}

const CreateSchema = z.object({
  kind: z.nativeEnum(LlmProviderKind),
  label: z.string().max(80).optional().nullable(),
  apiKey: z.string().max(500).optional().default(""),
  baseUrl: z.string().max(500).optional().nullable(),
  defaultModel: z.string().max(120).optional().nullable(),
  fastModel: z.string().max(120).optional().nullable(),
  isDefault: z.boolean().default(true),
});

export async function createLlmProvider(
  data: z.infer<typeof CreateSchema>,
) {
  const user = await requireAdmin();
  const parsed = CreateSchema.parse(data);

  const typedKey = parsed.apiKey.trim();
  let effectiveKey = typedKey;
  if (!effectiveKey) {
    const envKey = resolveLlmEnvFallback(parsed.kind);
    if (!envKey) {
      const varName = LLM_ENV_FALLBACK_VARS[parsed.kind];
      throw new Error(
        varName
          ? `API key is required. Paste one, or set ${varName} in .env and reload the server.`
          : "API key is required.",
      );
    }
    effectiveKey = envKey;
  } else if (effectiveKey.length < 8) {
    throw new Error("API key looks too short (min 8 chars).");
  }

  await prisma.$transaction(async (tx) => {
    if (parsed.isDefault) {
      await tx.llmProvider.updateMany({
        where: { companyId: user.companyId!, isDefault: true },
        data: { isDefault: false },
      });
    }
    await tx.llmProvider.create({
      data: {
        companyId: user.companyId!,
        kind: parsed.kind,
        label: parsed.label?.trim() || null,
        apiKey: effectiveKey,
        baseUrl: parsed.baseUrl?.trim() || null,
        defaultModel: parsed.defaultModel?.trim() || null,
        fastModel: parsed.fastModel?.trim() || null,
        isDefault: parsed.isDefault,
      },
    });
  });
  revalidatePath("/admin/llm-providers");
}

const UpdateSchema = z.object({
  id: z.string().uuid(),
  label: z.string().max(80).optional().nullable(),
  apiKey: z.string().min(8).max(500).optional(),
  baseUrl: z.string().max(500).optional().nullable(),
  defaultModel: z.string().max(120).optional().nullable(),
  fastModel: z.string().max(120).optional().nullable(),
});

export async function updateLlmProvider(
  data: z.infer<typeof UpdateSchema>,
) {
  const user = await requireAdmin();
  const parsed = UpdateSchema.parse(data);
  const row = await prisma.llmProvider.findFirst({
    where: { id: parsed.id, companyId: user.companyId! },
    select: { id: true },
  });
  if (!row) throw new Error("not found");
  await prisma.llmProvider.update({
    where: { id: parsed.id },
    data: {
      label:
        parsed.label !== undefined ? parsed.label?.trim() || null : undefined,
      apiKey: parsed.apiKey?.trim(),
      baseUrl:
        parsed.baseUrl !== undefined
          ? parsed.baseUrl?.trim() || null
          : undefined,
      defaultModel:
        parsed.defaultModel !== undefined
          ? parsed.defaultModel?.trim() || null
          : undefined,
      fastModel:
        parsed.fastModel !== undefined
          ? parsed.fastModel?.trim() || null
          : undefined,
    },
  });
  revalidatePath("/admin/llm-providers");
}

export async function setDefaultLlmProvider(id: string) {
  const user = await requireAdmin();
  await prisma.$transaction(async (tx) => {
    const row = await tx.llmProvider.findFirst({
      where: { id, companyId: user.companyId! },
      select: { id: true },
    });
    if (!row) throw new Error("not found");
    await tx.llmProvider.updateMany({
      where: { companyId: user.companyId!, isDefault: true },
      data: { isDefault: false },
    });
    await tx.llmProvider.update({
      where: { id },
      data: { isDefault: true },
    });
  });
  revalidatePath("/admin/llm-providers");
}

export async function deleteLlmProvider(id: string) {
  const user = await requireAdmin();
  await prisma.llmProvider.deleteMany({
    where: { id, companyId: user.companyId! },
  });
  revalidatePath("/admin/llm-providers");
}

// Cheap connection probe. Anthropic → GET /v1/models. Sarvam →
// GET /v1/models (OpenAI-compat). 401/403 = bad key.
export async function testLlmProvider(
  id: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const user = await requireAdmin();
  const provider = await prisma.llmProvider.findFirst({
    where: { id, companyId: user.companyId! },
    select: { kind: true, apiKey: true, baseUrl: true },
  });
  if (!provider)
    return { ok: false, status: 404, message: "Provider not found." };
  try {
    if (provider.kind === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": provider.apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return { ok: true };
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        message:
          res.status === 401 || res.status === 403
            ? `Anthropic rejected the API key. Upstream: ${text.slice(0, 160)}`
            : `Anthropic HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    // sarvam
    const base = provider.baseUrl?.trim() || "https://api.sarvam.ai/v1";
    const res = await fetch(`${base.replace(/\/$/, "")}/models`, {
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { ok: true };
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      status: res.status,
      message:
        res.status === 401 || res.status === 403
          ? `Sarvam rejected the API key. Upstream: ${text.slice(0, 160)}`
          : `Sarvam HTTP ${res.status}: ${text.slice(0, 200)}`,
    };
  } catch (e) {
    return {
      ok: false,
      status: 502,
      message: e instanceof Error ? e.message : "Network error",
    };
  }
}
