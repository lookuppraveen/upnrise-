// Trainee · Roleplay player.
//
// Server component: validates module + tenant, extracts persona + scenario
// + rubric for the three-panel player, hands off to the client component
// which drives the streaming conversation.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { loadModuleForUser } from "@/lib/ai/roleplay-access";
import { prisma } from "@/lib/db/client";
import { RoleplayPlayer } from "@/components/roleplay/RoleplayPlayer";
import { Button } from "@/components/ui/Button";
import {
  parseAdditionalSettings,
  resolveAvailableModes,
  type PlayerMode,
} from "@/lib/roleplay/additional-settings";

export const dynamic = "force-dynamic";

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

export default async function PlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; mid: string }>;
  searchParams: Promise<{ lang?: string; mode?: string }>;
}) {
  const { id, mid } = await params;
  const { lang: langParam, mode: modeParam } = await searchParams;
  const user = await getSessionUser();
  if (!user || user.role !== "trainee") notFound();

  const mod = await loadModuleForUser(user, mid);
  if (!mod || !mod.roleplayConfig) notFound();

  const cfg = mod.roleplayConfig;
  const personaName = derivePersonaName(cfg.persona);
  const personaBlurb = afterPersonaName(cfg.persona);
  const rubric = parseRubric(cfg.rubric);

  const settings = parseAdditionalSettings(mod.body);
  const availableModes = resolveAvailableModes(settings.modes);
  const userChoiceMode = settings.modes.userChoice && availableModes.length > 1;

  // Count prior attempts so we can render either a "limit reached"
  // screen or an inline counter. The start route enforces the cap
  // again — this is just nicer UX, not the authoritative check.
  const limited = settings.attempts.kind === "limited";
  const attemptsUsed = limited
    ? await prisma.roleplaySession.count({
        where: { userId: user.id, moduleId: mod.id },
      })
    : 0;
  const attemptsExhausted = limited && attemptsUsed >= settings.attempts.limit;

  if (attemptsExhausted) {
    return (
      <div className="px-7 pt-5 pb-8 max-w-[640px] mx-auto py-8 space-y-5">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-3">
          Roleplay
        </div>
        <h1 className="font-display text-[26px] leading-tight -tracking-[0.01em]">
          {mod.name}
        </h1>
        <div className="rounded-[14px] border border-border bg-surface p-5 space-y-3">
          <div className="text-[13.5px] font-semibold text-ink">
            You&apos;ve used all your attempts on this roleplay.
          </div>
          <p className="text-[12.5px] text-ink-2 leading-[1.55]">
            The trainer set a cap of{" "}
            <span className="font-semibold text-ink">
              {settings.attempts.limit}
            </span>{" "}
            attempt{settings.attempts.limit === 1 ? "" : "s"}, and you&apos;ve
            run {attemptsUsed}. Reach out if you need it reset.
          </p>
          <div className="flex items-center gap-2 pt-2">
            <Link href={`/learn/trainings/${id}`}>
              <Button variant="accent" size="md">
                Back to training
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const attemptInfo = limited
    ? { used: attemptsUsed, limit: settings.attempts.limit }
    : null;

  const duration = {
    minMin: settings.minDurationMin,
    maxMin: settings.maxDurationMin,
    autoDisconnect: settings.autoDisconnectOnLimit,
    disconnectOnInactivity: settings.disconnectOnInactivity,
    failBelowMin: settings.failBelowMinDuration,
  };

  const flow = {
    startBy: settings.startRoleplayBy,
    endBy: settings.endRoleplayBy,
  };

  const hints = {
    kind: settings.hints.kind,
    limit: settings.hints.limit,
    type: settings.hintType,
  };

  // Languages the persona was configured for. Pre-session gate prompts
  // the trainee to pick one when there's more than one. Fallback to
  // ["English"] for legacy modules so the player still works.
  const personaLanguages: string[] = Array.isArray(
    (mod.body as { persona?: { languages?: unknown } } | null)?.persona
      ?.languages,
  )
    ? ((mod.body as { persona: { languages: string[] } }).persona
        .languages as string[])
    : [];
  const allLanguages = personaLanguages.length > 0 ? personaLanguages : ["English"];

  const chosenLang = langParam && allLanguages.includes(langParam) ? langParam : null;
  const availableLanguages = chosenLang ? [chosenLang] : allLanguages;

  const chosenModeParam = modeParam as PlayerMode | undefined;
  const filteredModes =
    chosenModeParam && availableModes.includes(chosenModeParam)
      ? [chosenModeParam]
      : availableModes;
  const filteredUserChoiceMode =
    filteredModes.length > 1 ? userChoiceMode : false;

  // Resolve the portrait URL the audio-only surface should render.
  // Order of precedence:
  //   1. persona.liveDisplayUrl on this module (admin picked a saved
  //      D-ID portrait via the persona editor)
  //   2. companyId's first D-ID portrait that matches the provider's
  //      default sourceUrl (so the tenant default also gets a face)
  //   3. null  → surface falls back to initials circle
  const personaOverride = (
    mod.body as { persona?: { liveDisplayUrl?: string | null } } | null
  )?.persona;
  let personaPortraitUrl: string | null = personaOverride?.liveDisplayUrl ?? null;
  if (!personaPortraitUrl) {
    const providerDefault = await prisma.videoProvider.findFirst({
      where: {
        companyId: user.companyId!,
        kind: "did",
        isDefault: true,
      },
      select: { avatarId: true },
    });
    if (providerDefault?.avatarId) {
      const match = await prisma.didPortrait.findFirst({
        where: {
          companyId: user.companyId!,
          sourceUrl: providerDefault.avatarId,
        },
        select: { displayUrl: true },
      });
      personaPortraitUrl = match?.displayUrl ?? null;
    }
  }

  return (
    <div className="px-7 pt-5 pb-8 max-w-[1280px] mx-auto">
      <RoleplayPlayer
        moduleId={mod.id}
        moduleName={mod.name}
        trainingTitle={mod.training?.title ?? ""}
        personaName={personaName}
        personaBlurb={personaBlurb}
        scenario={cfg.scenario}
        mode={cfg.mode}
        rubric={rubric}
        availableModes={filteredModes}
        userChoiceMode={filteredUserChoiceMode}
        scenarioIntroGif={settings.scenarioIntroGif}
        attemptInfo={attemptInfo}
        duration={duration}
        flow={flow}
        hints={hints}
        recordAv={settings.recordAv === "yes"}
        availableLanguages={availableLanguages}
        personaPortraitUrl={personaPortraitUrl}
      />
    </div>
  );
}

/**
 * Persona blurbs follow the convention "Name, Title at Co. Other detail."
 * The header shows just "Name, Title".
 */
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
