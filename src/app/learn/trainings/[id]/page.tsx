// Trainee · Training Detail  (03_TRAINEE.md §Training Detail)
//
// Pixel-perfect pass matches the prototype screenshot (learn-02-training-detail.png):
//   - Two-column hero: big .scen-thumb-style illustration on the left,
//     "Training Completion" + horizontal progress bar + display title +
//     description on the right
//   - Purple-soft AI Coach insight card with real session-count subtitle
//     and contextual prose driven by per-module stats
//   - Module list refresh — flat list with type tag + "Your best vs Org best"

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import {
  getTrainingWithModulesForTenant,
  getModuleStatsForUser,
  getTrainingProgressForUser,
} from "@/lib/db/queries";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import type { ModuleType } from "@prisma/client";
import { cn } from "@/lib/cn";
import {
  parseAdditionalSettings,
  resolveAvailableModes,
} from "@/lib/roleplay/additional-settings";
import { ModuleStartButton } from "@/components/learn/ModuleStartButton";

const MODULE_ICON: Record<ModuleType, IconName> = {
  video: "play",
  roleplay: "mic",
  quiz: "clipboard",
  document: "book",
  gamified: "trophy",
  evaluation: "wand",
};

const MODULE_LABEL: Record<ModuleType, string> = {
  video: "Video",
  roleplay: "Roleplay",
  quiz: "Quiz",
  document: "Document",
  gamified: "Activity",
  evaluation: "Evaluation",
};

// Document storage covers three surfaces; reads body.kind to pick the
// right icon + label.
function moduleDisplayMeta(
  type: ModuleType,
  body: unknown,
): { icon: IconName; label: string } {
  if (type === "document" && body && typeof body === "object") {
    const kind = (body as Record<string, unknown>).kind;
    if (kind === "coach") return { icon: "trophy", label: "Coach" };
    if (kind === "scorm") return { icon: "layers", label: "SCORM" };
  }
  return { icon: MODULE_ICON[type], label: MODULE_LABEL[type] };
}

export default async function TrainingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = (await getSessionUser())!;
  if (!user.companyId) notFound();

  const training = await getTrainingWithModulesForTenant(id, user.companyId);
  if (!training) notFound();

  const progress = await getTrainingProgressForUser(user.id, training.id);

  const moduleStats = await Promise.all(
    training.modules.map(async (m) => ({
      module: m,
      stats: await getModuleStatsForUser(user.id, m.id),
    })),
  );

  const totalAttempts = moduleStats.reduce(
    (s, ms) => s + ms.stats.attempts,
    0,
  );
  const insight = composeCoachInsight(moduleStats);

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1180px] space-y-6">
      <Link
        href="/learn/trainings"
        className="inline-flex items-center gap-1 text-[12.5px] text-ink-2 hover:text-ink"
      >
        <Icon name="chevron-right" size={14} className="rotate-180" />
        Back to Trainings
      </Link>

      {/* Hero — two-column */}
      <Card
        pad="lg"
        className="grid gap-7 items-start"
        style={{ gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)" }}
      >
        <HeroThumb thumbnailUrl={training.thumbnailUrl} />

        <div className="space-y-4 min-w-0">
          {training.categories.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {training.categories.map((c) => (
                <span
                  key={c}
                  className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-2 bg-surface-2 border border-border rounded-sm px-[6px] py-[2px]"
                >
                  {c}
                </span>
              ))}
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
                Training completion
              </span>
              <span className="text-[12px] font-mono text-ink-2">
                {progress}%
              </span>
            </div>
            <div className="h-[6px] rounded-[3px] bg-surface-2 overflow-hidden">
              <div
                className="h-full rounded-[3px] bg-accent"
                style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
              />
            </div>
          </div>

          <h1 className="font-display text-[36px] leading-[1.05] -tracking-[0.015em]">
            {training.title}
          </h1>

          {training.description ? (
            <p className="text-ink-2 text-[14px] leading-[1.55] max-w-[640px]">
              {training.description}
            </p>
          ) : null}

          <div className="flex items-center gap-4 text-[12px] font-mono text-ink-3 pt-1">
            <span>
              {training.modules.length}{" "}
              {training.modules.length === 1 ? "module" : "modules"}
            </span>
            {totalAttempts > 0 ? (
              <span>· {totalAttempts} attempts</span>
            ) : null}
          </div>

          <AiCoachInsight insight={insight} sessionsBasedOn={totalAttempts} />
        </div>
      </Card>

      {/* Modules */}
      <section className="space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
          Modules
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {moduleStats.map(({ module: m, stats }) => {
            const isRoleplay = m.type === "roleplay";
            const meta = moduleDisplayMeta(m.type, m.body);

            let startButton: React.ReactNode;
            if (isRoleplay) {
              const settings = parseAdditionalSettings(m.body);
              const availableModes = resolveAvailableModes(settings.modes);
              const body = m.body as Record<string, unknown> | null;
              const keywords: string[] = Array.isArray(body?.keywords)
                ? (body.keywords as string[])
                : [];
              const scenario =
                m.roleplayConfig?.scenario ??
                (typeof body?.scenario === "string" ? body.scenario : "");
              const personaLangs = Array.isArray(
                (body?.persona as { languages?: unknown } | undefined)?.languages,
              )
                ? ((body!.persona as { languages: string[] }).languages as string[])
                : [];
              const availableLanguages = personaLangs.length > 0 ? personaLangs : ["English"];

              startButton = (
                <ModuleStartButton
                  trainingId={training.id}
                  moduleId={m.id}
                  moduleName={m.name}
                  hasAttempts={stats.attempts > 0}
                  scenario={scenario}
                  keywords={keywords}
                  minDurationMin={settings.minDurationMin}
                  maxDurationMin={settings.maxDurationMin}
                  attemptsKind={settings.attempts.kind}
                  attemptsLimit={settings.attempts.limit}
                  attemptsUsed={stats.attempts}
                  hintsKind={settings.hints.kind}
                  hintsLimit={settings.hints.limit}
                  availableModes={availableModes}
                  availableLanguages={availableLanguages}
                />
              );
            } else {
              const startHref = `/learn/trainings/${training.id}/modules/${m.id}`;
              startButton = (
                <Link href={startHref}>
                  <Button variant="accent" size="sm" suppressHydrationWarning>
                    {stats.attempts > 0 ? "Retry" : "Start"}
                  </Button>
                </Link>
              );
            }
            return (
              <Card key={m.id} pad="md" className="flex items-start gap-3">
                <div
                  className="w-10 h-10 grid place-items-center rounded-md bg-surface-2 text-ink-2 shrink-0"
                  aria-hidden
                >
                  <Icon name={meta.icon} size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                      {meta.label}
                    </span>
                    {isRoleplay && m.roleplayConfig ? (
                      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                        · {m.roleplayConfig.mode}
                      </span>
                    ) : null}
                    {!m.published ? (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-warn">
                        Draft
                      </span>
                    ) : null}
                  </div>
                  <div className="font-semibold text-[13.5px] mt-0.5 truncate">
                    {m.name}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-[11.5px] font-mono text-ink-3">
                    <span>
                      Your best:{" "}
                      <span className="text-ink">
                        {stats.yourBest != null ? `${stats.yourBest}%` : "—"}
                      </span>
                    </span>
                    <span>
                      Org best:{" "}
                      <span className="text-ink">
                        {stats.orgBest != null ? `${stats.orgBest}%` : "—"}
                      </span>
                    </span>
                    {stats.attempts > 0 ? (
                      <span>{stats.attempts} attempts</span>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0">
                  {startButton}
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ─────────────── Hero thumb ───────────────
// Big version of .scen-thumb: gradient placeholder with image icon centered.
// Renders the training's thumbnail when set; otherwise a decorative strip.

function HeroThumb({ thumbnailUrl }: { thumbnailUrl: string | null }) {
  return (
    <div
      className="relative w-full rounded-[10px] grid place-items-center text-ink-3 overflow-hidden"
      style={{
        background: thumbnailUrl
          ? undefined
          : "linear-gradient(135deg, #efece5, #d9d4ca)",
        aspectRatio: "4 / 3",
      }}
    >
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <Icon name="image" size={40} />
      )}
    </div>
  );
}

// ─────────────── AI Coach insight ───────────────
// Soft purple-pink gradient card with a small circle badge — visually
// distinct from the dashboard's dark "AI Weekly Brief" so the two AI
// surfaces don't blur together. The subtitle anchors the insight to real
// session data (count) when available.

function AiCoachInsight({
  insight,
  sessionsBasedOn,
}: {
  insight: { body: React.ReactNode; tone: "tip" | "hint" };
  sessionsBasedOn: number;
}) {
  const subtitle =
    sessionsBasedOn > 0
      ? `Based on your last ${sessionsBasedOn} ${sessionsBasedOn === 1 ? "session" : "sessions"}`
      : "No sessions yet — kick one off below";

  return (
    <div
      className="relative rounded-[12px] p-[14px] border flex items-start gap-3"
      style={{
        background:
          "linear-gradient(135deg, #f3eafa 0%, #fce8f0 100%)",
        borderColor: "#e6d2f1",
      }}
    >
      <div
        className="w-7 h-7 rounded-full grid place-items-center text-white shrink-0"
        style={{
          background: "linear-gradient(135deg, #7c3aed, #b94e8d)",
          boxShadow: "0 2px 8px rgba(124,58,237,0.25)",
        }}
        aria-hidden
      >
        <Icon name="ai-sparkle" size={12} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-[13.5px] text-ink">
            AI Coach insight
          </span>
          <span className="text-[11.5px] text-ink-3">{subtitle}</span>
        </div>
        <p className="text-[12.5px] text-ink-2 mt-1 leading-[1.55]">
          {insight.body}
        </p>
      </div>
    </div>
  );
}

function composeCoachInsight(
  stats: Array<{
    module: {
      id: string;
      name: string;
      type: ModuleType;
      order: number;
    };
    stats: {
      yourBest: number | null;
      orgBest: number | null;
      attempts: number;
    };
  }>,
): { body: React.ReactNode; tone: "tip" | "hint" } {
  const playable = stats.filter(
    (s) => s.module.type === "roleplay" || s.module.type === "quiz",
  );

  // Untouched yet.
  if (stats.every((s) => s.stats.attempts === 0)) {
    const first = stats[0];
    if (!first) {
      return {
        tone: "hint",
        body: (
          <>This training is set up but doesn't have any modules yet.</>
        ),
      };
    }
    return {
      tone: "hint",
      body: (
        <>
          Start with{" "}
          <ModuleRef name={first.module.name} order={first.module.order} /> to
          set a baseline. Your AI coach starts watching from session one.
        </>
      ),
    };
  }

  // Largest gap to org-best — the biggest opportunity.
  const gaps = playable
    .map((s) => ({
      module: s.module,
      stats: s.stats,
      gap:
        s.stats.yourBest != null && s.stats.orgBest != null
          ? s.stats.orgBest - s.stats.yourBest
          : null,
    }))
    .filter((g): g is { module: typeof g.module; stats: typeof g.stats; gap: number } => g.gap != null)
    .sort((a, b) => b.gap - a.gap);

  if (gaps.length > 0 && gaps[0].gap >= 10) {
    const top = gaps[0];
    return {
      tone: "tip",
      body: (
        <>
          Your biggest opportunity is{" "}
          <ModuleRef name={top.module.name} order={top.module.order} /> — you're{" "}
          <span className="font-semibold text-bad">−{top.gap} pts</span> from
          org-best. One focused round usually closes most of that.
        </>
      ),
    };
  }

  // No gap data — recommend the next unattempted module if any.
  const unattempted = stats.find(
    (s) => s.stats.attempts === 0 && s.module.type !== "video",
  );
  if (unattempted) {
    return {
      tone: "hint",
      body: (
        <>
          You're trending well. Try{" "}
          <ModuleRef
            name={unattempted.module.name}
            order={unattempted.module.order}
          />{" "}
          next to broaden the coverage.
        </>
      ),
    };
  }

  return {
    tone: "tip",
    body: (
      <>
        Solid progress across every module. Keep stringing reps together —
        repetition is what makes scores stick.
      </>
    ),
  };
}

function ModuleRef({ name, order }: { name: string; order: number }) {
  return (
    <span
      className={cn(
        "font-semibold text-ink rounded-sm px-1",
      )}
      style={{ background: "rgba(124,58,237,0.12)" }}
    >
      Module {order + 1}
      <span className="text-ink-3 font-normal"> · </span>
      <span className="font-normal">{name}</span>
    </span>
  );
}
