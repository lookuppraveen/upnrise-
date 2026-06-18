// Admin · Video Providers
//
// CRUD for tenant-configured avatar render integrations. Exactly one
// provider per tenant is the "default" — that's the one renderAvatarVideo()
// reaches for. HeyGen is the only fully-wired driver; the others are
// listed so the UI accepts a key today and switches on when their
// drivers are filled in.

import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { VideoProvidersManager } from "@/components/admin/VideoProvidersManager";
import { SavedPortraitsManager } from "@/components/admin/SavedPortraitsManager";

export default async function AdminVideoProvidersPage() {
  const user = (await getSessionUser())!;
  if (!user.companyId) return null;

  const [providers, portraits] = await Promise.all([
    prisma.videoProvider.findMany({
      where: { companyId: user.companyId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        kind: true,
        label: true,
        apiKey: true,
        avatarId: true,
        voiceId: true,
        isDefault: true,
        createdAt: true,
      },
    }),
    prisma.didPortrait.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        label: true,
        sourceUrl: true,
        displayUrl: true,
        voiceId: true,
        voiceName: true,
        createdAt: true,
      },
    }),
  ]);

  const portraitRows = portraits.map((p) => ({
    id: p.id,
    label: p.label,
    sourceUrl: p.sourceUrl,
    displayUrl: p.displayUrl,
    voiceId: p.voiceId,
    voiceName: p.voiceName,
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1100px] space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
          Avatars & Voices
        </h1>
        <p className="text-ink-2 text-[13.5px] max-w-[640px] leading-[1.5]">
          Add the API key for your avatar render service. The default
          provider is what UPnRise uses when you click &quot;Render avatar
          video&quot; on a video module. You can register multiple
          providers and switch the default any time.
        </p>
      </header>

      <VideoProvidersManager
        providers={providers.map((p) => ({
          id: p.id,
          kind: p.kind,
          label: p.label,
          apiKeyPreview: previewKey(p.apiKey),
          avatarId: p.avatarId,
          voiceId: p.voiceId,
          isDefault: p.isDefault,
          createdAt: p.createdAt.toISOString(),
        }))}
        savedPortraits={portraitRows}
      />

      <SavedPortraitsManager portraits={portraitRows} />
    </div>
  );
}

/**
 * Show first 4 + last 4 chars of the stored key so admins can tell
 * which one is which without exposing the secret in HTML.
 */
function previewKey(key: string): string {
  if (key.length <= 12) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(8)}${key.slice(-4)}`;
}
