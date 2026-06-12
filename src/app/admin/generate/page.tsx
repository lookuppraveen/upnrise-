// Admin · Generate with AI  (01_ADMIN.md §Generate with AI)
//
// Pixel-perfect pass matches admin-05-generate.png — single dark "Copilot
// Studio" hero is the focal point, with the artifact toggle + brief +
// attachment placeholders + Generate inside one card. Quick Starts row
// underneath lets admins seed the brief from common templates.

import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getAIConfig } from "@/lib/ai/config";
import { GenerateConsole } from "@/components/admin/GenerateConsole";

export default async function GeneratePage() {
  const user = (await getSessionUser())!;
  const ai = await getAIConfig();
  const houseTone = extractHouseTone(ai.defaultCoachPersona);

  const kbSources = user.companyId
    ? await prisma.kbSource.findMany({
        where: { companyId: user.companyId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          kind: true,
          name: true,
          size: true,
          sourceUrl: true,
        },
      })
    : [];

  return (
    <div className="px-7 pt-6 pb-20 max-w-[920px] space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
          Generate with AI
        </h1>
        <p className="text-ink-2 text-[13.5px] max-w-[620px] leading-[1.5]">
          Tell Copilot what you need — it drafts in seconds. You review, tweak,
          and publish.
        </p>
      </header>

      <GenerateConsole houseTone={houseTone} kbSources={kbSources} />
    </div>
  );
}

/**
 * Pulls a short "tone phrase" out of the tenant/platform default persona for
 * the chip in the Copilot Studio toolbar. We don't model a structured tone
 * descriptor yet; this is a deterministic extraction so the chip reflects
 * real Master Settings rather than a stub.
 */
function extractHouseTone(persona: string | null): string | null {
  if (!persona) return null;
  const first = persona.split(/[.!?\n]/)[0]?.trim();
  if (!first) return null;
  // Keep it short.
  if (first.length <= 64) return first;
  return first.slice(0, 60).trimEnd() + "…";
}
