// /admin/preview/trainings/[id]/modules/[mid]/play
//
// Admin-only "Preview as trainee" surface for roleplay modules.
// Mounts the same RoleplayPlayer the trainee uses, but reachable
// without trainee role + without the published-gates. Sessions are
// still persisted to roleplay_session (under the admin's user_id),
// which is acceptable for the prototype — analytics queries that
// filter by user role will naturally exclude these previews.
//
// Tenant-scope check happens in loadModuleForUser via the role
// branch we added — admins are matched against the module's company
// and the trainee role gates are skipped.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { loadModuleForUser } from "@/lib/ai/roleplay-access";
import { prisma } from "@/lib/db/client";
import { Icon } from "@/components/ui/Icon";
import { RoleplayPlayer } from "@/components/roleplay/RoleplayPlayer";

type RubricCriterion = {
  id: string;
  label: string;
  weight: number;
  description: string;
};

type Rubric = {
  pass_score?: number;
  criteria: RubricCriterion[];
};

export const dynamic = "force-dynamic";

export default async function AdminPreviewPlay({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; mid: string }>;
  searchParams: Promise<{ ended?: string }>;
}) {
  const { id, mid } = await params;
  const { ended } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") notFound();

  const mod = await loadModuleForUser(user, mid);
  if (!mod || !mod.roleplayConfig) notFound();
  if (mod.training.id !== id) notFound();

  const cfg = mod.roleplayConfig;
  const personaName = derivePersonaName(cfg.persona);
  const personaBlurb = afterPersonaName(cfg.persona);
  const rubric = parseRubric(cfg.rubric);

  // Same resolution as the trainee play page — show the portrait that
  // the persona override or tenant default points at, so the admin
  // preview matches what trainees actually see.
  const personaOverride = (
    mod.body as { persona?: { liveDisplayUrl?: string | null } } | null
  )?.persona;
  let personaPortraitUrl: string | null = personaOverride?.liveDisplayUrl ?? null;
  if (!personaPortraitUrl && user.companyId) {
    const providerDefault = await prisma.videoProvider.findFirst({
      where: { companyId: user.companyId, kind: "did", isDefault: true },
      select: { avatarId: true },
    });
    if (providerDefault?.avatarId) {
      const match = await prisma.didPortrait.findFirst({
        where: { companyId: user.companyId, sourceUrl: providerDefault.avatarId },
        select: { displayUrl: true },
      });
      personaPortraitUrl = match?.displayUrl ?? null;
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Preview banner */}
      <div
        className="px-7 py-2.5 flex items-center justify-between gap-3 border-b border-[#f4d6a3]"
        style={{ background: "#fff7e6" }}
      >
        <div className="flex items-center gap-2 text-[12.5px] text-[#8a6300]">
          <Icon name="alert" size={13} />
          <span className="font-semibold">Preview as trainee.</span>
          <span className="hidden sm:inline text-[#a47700]">
            Conversation runs against the real AI; sessions land under your
            admin user — not counted in trainee analytics.
          </span>
        </div>
        <Link
          href={`/admin/trainings/${id}/modules/${mid}/edit`}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-surface border border-border text-[12px] font-semibold text-ink-2 hover:text-ink"
        >
          <Icon name="chevron-right" size={11} className="rotate-180" />
          Back to editor
        </Link>
      </div>

      {ended === "1" ? (
        <div
          className="px-7 py-2.5 border-b border-[#c8e8d6] flex items-center gap-2 text-[12.5px] text-[#1a5a36]"
          style={{ background: "#ecfdf5" }}
        >
          <Icon name="ai-sparkle" size={11} />
          <span className="font-semibold">Preview session ended.</span>
          <span>
            Start another or head back to the editor to tweak the persona.
          </span>
        </div>
      ) : null}

      <div className="px-7 pt-5 pb-8 max-w-[1280px] mx-auto">
        <RoleplayPlayer
          moduleId={mod.id}
          moduleName={mod.name}
          personaName={personaName}
          personaBlurb={personaBlurb}
          scenario={cfg.scenario}
          mode={cfg.mode}
          rubric={rubric}
          personaPortraitUrl={personaPortraitUrl}
        />
      </div>
    </div>
  );
}

function derivePersonaName(persona: string): string {
  const firstSentence = persona.split(/\.\s/)[0] ?? persona;
  return firstSentence.length > 80
    ? firstSentence.slice(0, 80) + "…"
    : firstSentence;
}

function afterPersonaName(persona: string): string {
  const idx = persona.indexOf(". ");
  if (idx === -1) return "";
  return persona.slice(idx + 2).trim();
}

// Same shape-tolerant parser the trainee /play page uses — keeps a
// rubric-less or malformed config from crashing the preview.
function parseRubric(raw: unknown): Rubric {
  if (!raw || typeof raw !== "object") return { criteria: [] };
  const r = raw as { pass_score?: unknown; criteria?: unknown };
  const criteria: RubricCriterion[] = Array.isArray(r.criteria)
    ? r.criteria.flatMap((c) => {
        if (!c || typeof c !== "object") return [];
        const cc = c as Record<string, unknown>;
        return [
          {
            id: String(cc.id ?? ""),
            label: String(cc.label ?? ""),
            weight: typeof cc.weight === "number" ? cc.weight : 0,
            description: String(cc.description ?? ""),
          },
        ];
      })
    : [];
  return {
    pass_score: typeof r.pass_score === "number" ? r.pass_score : undefined,
    criteria,
  };
}
