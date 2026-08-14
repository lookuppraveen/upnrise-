"use server";

// TTS provider config actions. Same one-default-at-a-time shape as
// video-providers / llm-providers.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { TtsProviderKind } from "@prisma/client";
import {
  TTS_ENV_FALLBACK_VARS,
  resolveTtsEnvFallback,
} from "@/lib/tts/env-fallback";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    throw new Error("forbidden");
  }
  return user;
}

const CreateSchema = z.object({
  kind: z.nativeEnum(TtsProviderKind),
  label: z.string().max(80).optional().nullable(),
  apiKey: z.string().max(500).optional().default(""),
  voiceId: z.string().max(120).optional().nullable(),
  model: z.string().max(120).optional().nullable(),
  isDefault: z.boolean().default(true),
});

export async function createTtsProvider(
  data: z.infer<typeof CreateSchema>,
) {
  const user = await requireAdmin();
  const parsed = CreateSchema.parse(data);

  const typedKey = parsed.apiKey.trim();
  let effectiveKey = typedKey;
  if (!effectiveKey) {
    const envKey = resolveTtsEnvFallback(parsed.kind);
    if (!envKey) {
      const varName = TTS_ENV_FALLBACK_VARS[parsed.kind];
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
      await tx.ttsProvider.updateMany({
        where: { companyId: user.companyId!, isDefault: true },
        data: { isDefault: false },
      });
    }
    await tx.ttsProvider.create({
      data: {
        companyId: user.companyId!,
        kind: parsed.kind,
        label: parsed.label?.trim() || null,
        apiKey: effectiveKey,
        voiceId: parsed.voiceId?.trim() || null,
        model: parsed.model?.trim() || null,
        isDefault: parsed.isDefault,
      },
    });
  });
  revalidatePath("/admin/tts-providers");
}

const UpdateSchema = z.object({
  id: z.string().uuid(),
  label: z.string().max(80).optional().nullable(),
  apiKey: z.string().min(8).max(500).optional(),
  voiceId: z.string().max(120).optional().nullable(),
  model: z.string().max(120).optional().nullable(),
});

export async function updateTtsProvider(
  data: z.infer<typeof UpdateSchema>,
) {
  const user = await requireAdmin();
  const parsed = UpdateSchema.parse(data);
  const row = await prisma.ttsProvider.findFirst({
    where: { id: parsed.id, companyId: user.companyId! },
    select: { id: true },
  });
  if (!row) throw new Error("not found");
  await prisma.ttsProvider.update({
    where: { id: parsed.id },
    data: {
      label:
        parsed.label !== undefined ? parsed.label?.trim() || null : undefined,
      apiKey: parsed.apiKey?.trim(),
      voiceId:
        parsed.voiceId !== undefined
          ? parsed.voiceId?.trim() || null
          : undefined,
      model:
        parsed.model !== undefined ? parsed.model?.trim() || null : undefined,
    },
  });
  revalidatePath("/admin/tts-providers");
}

export async function setDefaultTtsProvider(id: string) {
  const user = await requireAdmin();
  await prisma.$transaction(async (tx) => {
    const row = await tx.ttsProvider.findFirst({
      where: { id, companyId: user.companyId! },
      select: { id: true },
    });
    if (!row) throw new Error("not found");
    await tx.ttsProvider.updateMany({
      where: { companyId: user.companyId!, isDefault: true },
      data: { isDefault: false },
    });
    await tx.ttsProvider.update({
      where: { id },
      data: { isDefault: true },
    });
  });
  revalidatePath("/admin/tts-providers");
}

export async function deleteTtsProvider(id: string) {
  const user = await requireAdmin();
  await prisma.ttsProvider.deleteMany({
    where: { id, companyId: user.companyId! },
  });
  revalidatePath("/admin/tts-providers");
}

// Cheap connection probe. ElevenLabs → GET /v1/user. Sarvam → the TTS
// endpoint responds 200 to a 1-char sample if the key is valid.
export async function testTtsProvider(
  id: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const user = await requireAdmin();
  const provider = await prisma.ttsProvider.findFirst({
    where: { id, companyId: user.companyId! },
    select: { kind: true, apiKey: true, voiceId: true },
  });
  if (!provider)
    return { ok: false, status: 404, message: "Provider not found." };
  try {
    if (provider.kind === "elevenlabs") {
      const res = await fetch("https://api.elevenlabs.io/v1/user", {
        headers: { "xi-api-key": provider.apiKey },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return { ok: true };
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        message:
          res.status === 401 || res.status === 403
            ? `ElevenLabs rejected the API key. Upstream: ${text.slice(0, 160)}`
            : `ElevenLabs HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    // sarvam
    const res = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": provider.apiKey,
      },
      body: JSON.stringify({
        inputs: ["hi"],
        target_language_code: "en-IN",
        speaker: provider.voiceId ?? "meera",
        model: "bulbul:v2",
      }),
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
