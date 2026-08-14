// Admin · TTS Providers
//
// Tenant CRUD for TTS keys. Drives the /api/roleplay/tts route so persona
// voices in live roleplays can be routed per-tenant. ElevenLabs is the
// default runtime; Sarvam's Bulbul is available for Indic personas.

import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { TtsProvidersManager } from "@/components/admin/TtsProvidersManager";
import { getTtsEnvFallbackKinds } from "@/lib/tts/env-fallback";

export default async function AdminTtsProvidersPage() {
  const user = (await getSessionUser())!;
  if (!user.companyId) return null;

  const providers = await prisma.ttsProvider.findMany({
    where: { companyId: user.companyId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      kind: true,
      label: true,
      apiKey: true,
      voiceId: true,
      model: true,
      isDefault: true,
      createdAt: true,
    },
  });

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1100px] space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
          TTS Providers
        </h1>
        <p className="text-ink-2 text-[13.5px] max-w-[680px] leading-[1.5]">
          Add the TTS keys UPnRise should use for live-roleplay persona
          voices. ElevenLabs is the default; Sarvam AI (Bulbul) is available
          for Indic-language personas.
        </p>
      </header>

      <TtsProvidersManager
        providers={providers.map((p) => ({
          id: p.id,
          kind: p.kind,
          label: p.label,
          apiKeyPreview: previewKey(p.apiKey),
          voiceId: p.voiceId,
          model: p.model,
          isDefault: p.isDefault,
          createdAt: p.createdAt.toISOString(),
        }))}
        envFallbackKinds={getTtsEnvFallbackKinds()}
      />
    </div>
  );
}

function previewKey(key: string): string {
  if (key.length <= 12) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(8)}${key.slice(-4)}`;
}
