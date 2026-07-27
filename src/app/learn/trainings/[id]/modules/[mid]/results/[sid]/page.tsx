// Trainee · Roleplay results.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { loadSessionForUser } from "@/lib/ai/roleplay-access";
import type { TranscriptTurn } from "@/lib/ai/roleplay";
import { parseRubric } from "@/lib/ai/scoring";
import { prisma } from "@/lib/db/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { AIBadge } from "@/components/ui/AIBadge";
import { cn } from "@/lib/cn";
import { parseAdditionalSettings } from "@/lib/roleplay/additional-settings";
import {
  computeAttemptStats,
  computeKeywordCoverage,
  countHintsUsed,
  getAttemptHistory,
} from "@/lib/roleplay/results";
import { computeConversationStats } from "@/lib/roleplay/conversation-stats";
import { computeSpeechDelivery } from "@/lib/roleplay/speech-delivery";
import { getComparativeStats } from "@/lib/roleplay/comparative-stats";
import {
  ProgressHistoryChart,
  SKILL_COLORS,
  type AttemptPoint,
  type SkillSeries,
} from "@/components/results/ProgressHistoryChart";
import { KeywordCoverageCard } from "@/components/results/KeywordCoverageCard";
import { ConversationStatsCard } from "@/components/results/ConversationStatsCard";
import { SpeechDeliveryCard } from "@/components/results/SpeechDeliveryCard";
import { ComparativeContextCard } from "@/components/results/ComparativeContextCard";
import { GradingPoll } from "@/components/results/GradingPoll";

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string; mid: string; sid: string }>;
}) {
  const { id, mid, sid } = await params;
  const user = await getSessionUser();
  if (!user || user.role !== "trainee") notFound();

  const session = await loadSessionForUser(user, sid);
  if (!session) notFound();

  const transcript = session.transcript as unknown as TranscriptTurn[];
  const rubric = session.module.roleplayConfig
    ? parseRubric(session.module.roleplayConfig.rubric)
    : null;
  const rubricScores =
    (session.rubricScores as Record<string, number> | null) ?? {};

  const settings = parseAdditionalSettings(session.module.body);

  const [aiFeedback, recordingRow, history, hintsUsed, fullUser, systemNote] =
    await Promise.all([
      prisma.feedback.findFirst({
        where: {
          sessionId: session.id,
          kind: "ai",
          source: { notIn: ["recording", "hint", "system"] },
        },
        orderBy: { createdAt: "desc" },
        select: { body: true, sentiment: true },
      }),
      prisma.feedback.findFirst({
        where: { sessionId: session.id, source: "recording" },
        select: { body: true },
        orderBy: { createdAt: "desc" },
      }),
      getAttemptHistory(user.id, session.moduleId, settings.minDurationMin),
      countHintsUsed(session.id),
      prisma.user.findUnique({
        where: { id: user.id },
        select: {
          name: true,
          email: true,
          team: { select: { name: true } },
          manager: { select: { name: true, email: true } },
        },
      }),
      prisma.feedback.findFirst({
        where: { sessionId: session.id, source: "system" },
        select: { body: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
  const recordingUrl = recordingRow?.body ?? null;

  const stats = computeAttemptStats(history, session.id);
  const keywordCoverage = computeKeywordCoverage(
    transcript,
    Array.isArray(
      (session.module.body as { keywords?: unknown } | null)?.keywords,
    )
      ? ((session.module.body as { keywords: string[] }).keywords as string[])
      : [],
  );
  const conversationStats = computeConversationStats(transcript);
  const speechDelivery = computeSpeechDelivery(transcript, session.durationSec);
  const comparativeStats = user.companyId
    ? await getComparativeStats({
        companyId: user.companyId,
        userId: user.id,
        moduleId: session.moduleId,
        currentScore: session.score,
        minDurationMin: settings.failBelowMinDuration
          ? settings.minDurationMin
          : 0,
      })
    : null;

  const sessionLanguage = (session as { language?: string | null }).language;
  const personaBody = session.module.body as
    | { persona?: { languages?: string[] } }
    | null;
  const language =
    sessionLanguage?.trim() ||
    personaBody?.persona?.languages?.[0] ||
    "English";

  const tipsGif = settings.tipsOnReportGif;
  const passScore = rubric?.pass_score ?? 70;
  const overall = session.score;

  const minSec = settings.minDurationMin * 60;
  const autoFailed =
    overall === 0 &&
    Object.keys(rubricScores).length === 0 &&
    settings.failBelowMinDuration &&
    minSec > 0 &&
    (session.durationSec ?? 0) < minSec;

  const passed = !autoFailed && overall != null && overall >= passScore;

  const skillSeries: SkillSeries[] = rubric
    ? rubric.criteria.map((c, i) => ({
        id: c.id,
        label: c.label,
        color: SKILL_COLORS[i % SKILL_COLORS.length],
      }))
    : [];
  const attemptPoints: AttemptPoint[] = history.map((h, i) => ({
    index: i + 1,
    score: h.score,
    rubric: h.rubricScores,
    autoFailed: h.autoFailed,
  }));

  const personaFirstName =
    session.module.roleplayConfig?.persona.split(/[,\s]/)[0] ?? "Persona";

  return (
    <div className="px-7 pt-5 pb-24 max-w-[1280px] mx-auto space-y-6">
      {/* Breadcrumb */}
      <Link
        href={`/learn/trainings/${id}`}
        className="inline-flex items-center gap-1 text-[12.5px] text-ink-2 hover:text-ink transition-colors"
      >
        <Icon name="chevron-right" size={14} className="rotate-180" />
        Back to training
      </Link>

      {/* Grading-in-progress poll — /end returns immediately and scores
          via Next 16 after(), so score/rubric can still be null on the
          first render. This client component reloads the page every 2s
          until scoring lands. */}
      <GradingPoll scored={autoFailed || overall != null} />

      {/* Auto-fail banner */}
      {autoFailed ? (
        <div
          className="flex items-start gap-3 rounded-[var(--r-md)] border border-warn/30 bg-warn-pale px-4 py-3.5"
        >
          <span
            aria-hidden
            className="w-8 h-8 grid place-items-center rounded-md text-white shrink-0 bg-warn mt-0.5"
          >
            <Icon name="alert" size={14} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-warn mb-1">
              Session marked as failed
            </div>
            <p className="text-[12.5px] text-ink-2 leading-snug">
              {systemNote?.body ??
                `This session ended after ${fmtDuration(session.durationSec)} — below the ${settings.minDurationMin}-minute minimum your trainer set. Retry and stay in the conversation long enough to demonstrate the full flow.`}
            </p>
          </div>
        </div>
      ) : null}

      {/* Page header */}
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] leading-none uppercase tracking-[0.04em] text-ink">
            Roleplay Result
          </h1>
          <p className="text-[12.5px] text-ink-2 mt-1.5 leading-snug">
            <span className="text-ink-3">Training:</span>{" "}
            <span className="font-medium text-ink">
              {session.module.training.title}
            </span>
            <span className="mx-2 text-border-strong">·</span>
            <span className="text-ink-3">Module:</span>{" "}
            <span className="font-medium text-ink">{session.module.name}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border text-[11.5px] font-semibold text-ink-2">
            <Icon name="history" size={11} />
            {fmtDuration(session.durationSec)}
          </span>
          <Link href={`/learn/trainings/${id}/modules/${mid}/play`}>
            <Button
              variant="accent"
              size="md"
              type="button"
              suppressHydrationWarning
            >
              <Icon name="play" size={11} />
              Retry session
            </Button>
          </Link>
        </div>
      </header>

      {/* ── Hero score card ── */}
      <div
        className="rounded-[var(--r-lg)] border border-border bg-surface overflow-hidden"
        style={{ boxShadow: "var(--shadow-md)" }}
      >
        {/* Accent top stripe */}
        <div
          className="h-[3px] w-full"
          style={{ background: "var(--ai-grad)" }}
          aria-hidden
        />

        <div className="px-8 py-7">
          <div
            className="grid gap-0 items-stretch"
            style={{ gridTemplateColumns: "240px 1px minmax(0,1fr)" }}
          >
            {/* ── Score column ── */}
            <div className="flex flex-col items-center text-center pr-8">
              {autoFailed ? (
                <FailedRing />
              ) : overall != null ? (
                <ScoreRing value={overall} max={100} passScore={passScore} />
              ) : (
                <div
                  style={{ width: 200, height: 200 }}
                  className="grid place-items-center rounded-full border border-border text-ink-3 text-[12px] font-mono"
                >
                  no score
                </div>
              )}

              <div className="mt-4">
                <PassFailBadge
                  passed={passed}
                  autoFailed={autoFailed}
                  overall={overall}
                />
              </div>

              {!autoFailed && overall != null ? (
                <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-3 mt-2">
                  Pass threshold · {passScore}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-4 w-full mt-5 pt-5 border-t border-border">
                <Metric
                  icon="layers"
                  label="Attempt"
                  value={String(stats.attemptNumber)}
                />
                <Metric
                  icon="chart"
                  label="Improvement"
                  value={fmtImprovement(stats.improvementPct)}
                  tone={
                    stats.improvementPct == null
                      ? "neutral"
                      : stats.improvementPct >= 0
                        ? "good"
                        : "bad"
                  }
                />
              </div>
            </div>

            {/* Vertical divider */}
            <div className="bg-border self-stretch" aria-hidden />

            {/* ── Info column ── */}
            <div className="flex flex-col gap-5 pl-8">
              {/* Session tags */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3 mb-2.5">
                  Session Details
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-2 border border-border text-[11.5px] font-semibold text-ink-2">
                    <Icon name="mic" size={11} />
                    {prettyMode(session.mode)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-2 border border-border text-[11.5px] font-semibold text-ink-2">
                    <Icon name="globe" size={11} />
                    {language}
                  </span>
                  {hintsUsed > 0 ? (
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-semibold"
                      style={{ background: "#ede9fe", color: "#6d4ad9" }}
                    >
                      <Icon name="ai-sparkle" size={11} />
                      Hint used{hintsUsed > 1 ? ` × ${hintsUsed}` : ""}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-border" aria-hidden />

              {/* Meta grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                <MetaCell
                  icon="users"
                  label="Trainee"
                  value={fullUser?.name || fullUser?.email || "—"}
                />
                <MetaCell
                  icon="users"
                  label="Manager"
                  value={
                    fullUser?.manager?.name ||
                    fullUser?.manager?.email ||
                    fullUser?.team?.name ||
                    "—"
                  }
                  sub={
                    fullUser?.manager && fullUser.team?.name
                      ? `Team · ${fullUser.team.name}`
                      : undefined
                  }
                />
                <MetaCell
                  icon="play"
                  label="Training"
                  value={session.module.training.title}
                />
                <MetaCell
                  icon="layers"
                  label="Module"
                  value={session.module.name}
                />
                <MetaCell
                  icon="history"
                  label="Started"
                  value={fmtTime(session.startedAt)}
                  sub={fmtDate(session.startedAt)}
                />
                <MetaCell
                  icon="history"
                  label="Ended"
                  value={fmtTime(session.endedAt ?? session.startedAt)}
                  sub={fmtDate(session.endedAt ?? session.startedAt)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── AI Coaching feedback — prominent, full-width ── */}
      {aiFeedback ? (
        <div
          className="rounded-[var(--r-lg)] border p-6"
          style={{
            background: "var(--ai-grad-soft)",
            borderColor: "rgba(232,93,58,0.2)",
            boxShadow: "0 4px 20px rgba(232,93,58,0.08)",
          }}
        >
          <div className="flex items-start gap-4">
            <div
              className="w-10 h-10 grid place-items-center rounded-lg text-white shrink-0"
              style={{
                background: "var(--ai-grad)",
                boxShadow: "0 4px 12px rgba(232,93,58,0.3)",
              }}
            >
              <Icon name="ai-sparkle" size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="font-semibold text-[15px] text-ink">
                  AI Coaching Feedback
                </span>
                <AIBadge>AI</AIBadge>
                {aiFeedback.sentiment ? (
                  <span
                    className={cn(
                      "text-[10.5px] font-semibold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full",
                      aiFeedback.sentiment === "positive"
                        ? "bg-good-pale text-good"
                        : aiFeedback.sentiment === "negative"
                          ? "bg-bad-pale text-bad"
                          : "bg-surface-2 text-ink-3",
                    )}
                  >
                    {aiFeedback.sentiment}
                  </span>
                ) : null}
              </div>
              <p className="text-[13.5px] text-ink-2 leading-[1.65] whitespace-pre-wrap">
                {aiFeedback.body}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── How you compare (peer + personal benchmarks) ── */}
      {comparativeStats ? (
        <Card pad="md" className="space-y-4">
          <SectionHeader
            title="How you compare"
            subtitle="Your score in context — peers, history, trend"
          />
          <ComparativeContextCard
            currentScore={session.score}
            stats={comparativeStats}
          />
        </Card>
      ) : null}

      {/* ── Evaluation Criteria + Breakdown ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card pad="md" className="space-y-4 min-h-[260px]">
          <SectionHeader
            title="Evaluation Criteria"
            subtitle="Performance across key areas"
          />
          {rubric && rubric.criteria.length > 0 ? (
            <RubricBars
              criteria={rubric.criteria.map((c, i) => ({
                id: c.id,
                label: c.label,
                weight: c.weight,
                color: SKILL_COLORS[i % SKILL_COLORS.length],
              }))}
              scores={rubricScores}
              passScore={passScore}
            />
          ) : (
            <div className="border border-dashed border-border rounded-md p-6 text-center">
              <p className="text-[12px] text-ink-3 italic">
                No evaluation criteria configured on this module.
              </p>
            </div>
          )}
        </Card>
        <Card pad="md" className="space-y-4 min-h-[260px]">
          <SectionHeader
            title="Criteria Breakdown"
            subtitle="Detailed score per skill area"
          />
          {rubric && rubric.criteria.length > 0 ? (
            <div className="space-y-2.5">
              {rubric.criteria.map((c, i) => (
                <CriterionDetail
                  key={c.id}
                  label={c.label}
                  description={c.description}
                  score={rubricScores[c.id]}
                  passScore={passScore}
                  color={SKILL_COLORS[i % SKILL_COLORS.length]}
                />
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-border rounded-md p-6 text-center">
              <p className="text-[12px] text-ink-3 italic">
                No evaluation criteria configured on this module.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* ── Speech Delivery (pace, fillers, sentence length) ── */}
      <Card pad="md" className="space-y-4">
        <SectionHeader
          title="Speech Delivery"
          subtitle="How you spoke — pace, fillers, sentence shape"
        />
        <SpeechDeliveryCard stats={speechDelivery} />
      </Card>

      {/* ── Conversation Stats (derived from transcript) ── */}
      <Card pad="md" className="space-y-4">
        <SectionHeader
          title="Conversation Stats"
          subtitle="What the transcript itself tells us about how you spoke"
        />
        <ConversationStatsCard stats={conversationStats} />
      </Card>

      {/* ── Strengths + Improvement Areas ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card pad="md" className="space-y-4 min-h-[180px]">
          <SectionHeader
            title="Strengths"
            subtitle="Positive aspects of your performance"
          />
          <SkillList
            skills={session.strongSkills}
            tone="good"
            empty="No specific strengths identified yet."
          />
        </Card>
        <Card pad="md" className="space-y-4 min-h-[180px]">
          <SectionHeader
            title="Improvement Areas"
            subtitle="Focus points for your next attempt"
          />
          <SkillList
            skills={session.weakSkills}
            tone="warn"
            empty="No specific areas for improvement identified."
          />
        </Card>
      </div>

      {/* ── Progress History + Keyword Coverage ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card pad="md" className="space-y-3">
          <SectionHeader
            title="Progress History"
            subtitle="Performance trends across attempts"
          />
          <ProgressHistoryChart
            attempts={attemptPoints}
            skills={skillSeries}
          />
        </Card>
        <Card pad="md" className="space-y-3">
          <SectionHeader
            title="Keyword Coverage"
            subtitle="Key terms covered in this session"
            badge={
              keywordCoverage.total > 0
                ? `${keywordCoverage.percent}%`
                : undefined
            }
          />
          <KeywordCoverageCard coverage={keywordCoverage} />
        </Card>
      </div>

      {/* ── Recording ── */}
      {recordingUrl ? (
        <Card pad="md" className="space-y-3">
          <SectionHeader title="Session Recording" />
          <audio
            controls
            preload="metadata"
            src={recordingUrl}
            className="w-full"
          />
          <div className="flex items-center gap-4 text-[11.5px] text-ink-2 font-semibold">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ background: "#7c5cd6" }}
              />
              AI Persona
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ background: "#f59e0b" }}
              />
              You
            </span>
          </div>
        </Card>
      ) : null}

      {/* ── Tips GIF ── */}
      {tipsGif ? (
        <Card pad="md" className="space-y-3">
          <SectionHeader title="Tips from your trainer" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={tipsGif.dataUrl}
            alt={tipsGif.name}
            className="max-w-[480px] rounded-md border border-border bg-surface-2 object-cover"
          />
        </Card>
      ) : null}

      {/* ── Transcript ── */}
      <Card pad="md" className="space-y-4">
        <SectionHeader
          title="Conversation Transcript"
          subtitle={`${transcript.length} turns`}
        />
        <div className="flex flex-col gap-3">
          {transcript.map((t, i) => (
            <TranscriptLine key={i} turn={t} personaFirst={personaFirstName} />
          ))}
        </div>
      </Card>

      {/* ── Bottom action ── */}
      <div className="flex justify-end pt-2">
        <Link href={`/learn/trainings/${id}/modules/${mid}/play`}>
          <Button
            variant="accent"
            size="md"
            type="button"
            suppressHydrationWarning
          >
            <Icon name="play" size={11} />
            Retry session
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Layout atoms
// ═══════════════════════════════════════════════════════════

function SectionHeader({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="w-[3px] h-5 rounded-full bg-accent shrink-0"
        />
        <div>
          <h2 className="font-semibold text-[15px] text-ink leading-tight">
            {title}
          </h2>
          {subtitle ? (
            <p className="text-[11.5px] text-ink-3 mt-0.5">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {badge ? (
        <span
          className="text-[10.5px] font-bold uppercase tracking-[0.1em] px-2.5 py-1 rounded-full shrink-0"
          style={{ background: "#ede9fe", color: "#6d4ad9" }}
        >
          {badge}
        </span>
      ) : null}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  value: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "text-good"
      : tone === "bad"
        ? "text-bad"
        : "text-ink";
  return (
    <div className="text-left">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-3 flex items-center gap-1">
        <Icon name={icon} size={10} />
        {label}
      </div>
      <div
        className={cn(
          "text-[16px] font-semibold leading-tight mt-0.5",
          toneClass,
        )}
      >
        {value}
      </div>
    </div>
  );
}

function MetaCell({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span
        aria-hidden
        className="w-7 h-7 grid place-items-center rounded-md bg-surface-2 text-ink-2 shrink-0 mt-0.5"
      >
        <Icon name={icon} size={12} />
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-3">
          {label}
        </div>
        <div
          className="text-[13px] font-semibold text-ink leading-tight truncate"
          title={value}
        >
          {value}
        </div>
        {sub ? (
          <div className="text-[10.5px] text-ink-3 font-mono mt-0.5">{sub}</div>
        ) : null}
      </div>
    </div>
  );
}

function PassFailBadge({
  passed,
  autoFailed,
  overall,
}: {
  passed: boolean;
  autoFailed: boolean;
  overall: number | null;
}) {
  if (autoFailed) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-semibold bg-warn-pale text-warn border border-warn/25">
        Auto-failed
      </span>
    );
  }
  if (overall == null) return null;
  return passed ? (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-semibold bg-good-pale text-good border border-good/25">
      Passed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-semibold bg-bad-pale text-bad border border-bad/25">
      Below threshold
    </span>
  );
}

// ═══════════════════════════════════════════════════════════
// Score rings
// ═══════════════════════════════════════════════════════════

function FailedRing() {
  const size = 200;
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        background:
          "radial-gradient(circle at 30% 30%, rgba(201,122,27,0.16), rgba(201,122,27,0.04))",
        border: "2.5px dashed var(--warn)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      <span className="font-display text-[34px] leading-none text-warn">
        Failed
      </span>
      <span className="text-[11px] text-ink-3 font-mono">ended too early</span>
    </div>
  );
}

function ScoreRing({
  value,
  max,
  passScore,
}: {
  value: number;
  max: number;
  passScore: number;
}) {
  const size = 200;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(max, value));
  const fillOffset = circumference * (1 - clamped / max);
  const cx = size / 2;
  const cy = size / 2;

  const arcColor =
    clamped >= passScore
      ? "var(--good)"
      : clamped >= passScore * 0.7
        ? "var(--warn)"
        : "var(--bad)";

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: "block" }}
      >
        {/* Track ring */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={stroke}
        />
        {/* Filled arc — rotated so the arc starts at the top (12 o'clock) */}
        <g transform={`rotate(-90, ${cx}, ${cy})`}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={arcColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={fillOffset}
          />
        </g>
      </svg>
      {/* Score number overlay — pure inline style to avoid Tailwind scoping issues */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          pointerEvents: "none",
        }}
      >
        <span className="font-display text-[52px] leading-none text-ink">
          {Math.round(clamped)}
        </span>
        <span className="text-[12px] text-ink-3">/ {max}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Rubric bars
// ═══════════════════════════════════════════════════════════

function RubricBars({
  criteria,
  scores,
  passScore,
}: {
  criteria: { id: string; label: string; weight: number; color: string }[];
  scores: Record<string, number>;
  passScore: number;
}) {
  return (
    <div className="space-y-4">
      {criteria.map((c) => {
        const s = scores[c.id];
        const scored = typeof s === "number";
        const barColor = scored
          ? s >= passScore
            ? "var(--good)"
            : s >= passScore * 0.7
              ? "var(--warn)"
              : "var(--bad)"
          : "var(--border)";
        return (
          <div key={c.id}>
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <span className="flex items-center gap-1.5 text-[12.5px] text-ink">
                <span
                  aria-hidden
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ background: c.color }}
                />
                <span className="font-medium">{c.label}</span>
                <span className="text-ink-3 font-mono text-[10.5px]">
                  ×{(c.weight * 100).toFixed(0)}%
                </span>
              </span>
              {scored ? (
                <span
                  className={cn(
                    "font-display font-normal text-[17px] leading-none tabular-nums",
                    s >= passScore
                      ? "text-good"
                      : s >= passScore * 0.7
                        ? "text-warn"
                        : "text-bad",
                  )}
                >
                  {Math.round(s)}
                </span>
              ) : (
                <span className="text-ink-3 text-[11px] font-mono">—</span>
              )}
            </div>
            <div className="h-[7px] rounded-full bg-surface-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: scored ? `${Math.max(2, Math.min(100, s))}%` : "0%",
                  background: barColor,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CriterionDetail({
  label,
  description,
  score,
  passScore,
  color,
}: {
  label: string;
  description?: string;
  score: number | undefined;
  passScore: number;
  color: string;
}) {
  const scored = typeof score === "number";
  const scoreColor = scored
    ? score >= passScore
      ? "text-good"
      : score >= passScore * 0.7
        ? "text-warn"
        : "text-bad"
    : "text-ink-3";

  return (
    <div className="p-3 bg-surface-2/50 border border-border rounded-[var(--r-md)] space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0 mt-0.5"
            style={{ background: color }}
          />
          <span className="text-[13px] font-semibold text-ink leading-tight">
            {label}
          </span>
        </div>
        {scored ? (
          <span
            className={cn(
              "font-display font-normal text-[18px] leading-none shrink-0 tabular-nums",
              scoreColor,
            )}
          >
            {Math.round(score)}
            <span className="text-[10.5px] text-ink-3 ml-0.5 font-sans">
              /100
            </span>
          </span>
        ) : (
          <span className="text-ink-3 text-[11px] font-mono shrink-0">
            not scored
          </span>
        )}
      </div>
      {scored ? (
        <div className="h-[5px] rounded-full bg-surface-2 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(2, Math.min(100, score))}%`,
              background: color,
              opacity: 0.7,
            }}
          />
        </div>
      ) : null}
      {description ? (
        <p className="text-[11.5px] text-ink-2 leading-[1.5]">{description}</p>
      ) : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Skill lists (strengths / improvements)
// ═══════════════════════════════════════════════════════════

function SkillList({
  skills,
  tone,
  empty,
}: {
  skills: string[];
  tone: "good" | "warn";
  empty: string;
}) {
  if (skills.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-md p-6 text-center">
        <p className="text-[12px] text-ink-3 italic">{empty}</p>
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {skills.map((s) => (
        <li
          key={s}
          className={cn(
            "flex items-start gap-2.5 text-[12.5px] px-3 py-2.5 rounded-[var(--r-sm)] border leading-snug",
            tone === "good"
              ? "bg-good-pale border-good/20 text-good"
              : "bg-warn-pale border-warn/20 text-warn",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "inline-flex w-4 h-4 rounded-full items-center justify-center text-white text-[9px] font-bold shrink-0 mt-[1px]",
              tone === "good" ? "bg-good" : "bg-warn",
            )}
          >
            {tone === "good" ? "✓" : "!"}
          </span>
          {s}
        </li>
      ))}
    </ul>
  );
}

// ═══════════════════════════════════════════════════════════
// Transcript
// ═══════════════════════════════════════════════════════════

function TranscriptLine({
  turn,
  personaFirst,
}: {
  turn: TranscriptTurn;
  personaFirst: string;
}) {
  const isPersona = turn.role === "persona";
  const initial = isPersona ? personaFirst.charAt(0).toUpperCase() : "Y";

  return (
    <div
      className={cn(
        "flex items-end gap-2.5",
        !isPersona && "flex-row-reverse",
      )}
    >
      <div
        className={cn(
          "w-7 h-7 rounded-full grid place-items-center text-[11px] font-semibold shrink-0",
          isPersona
            ? "text-white"
            : "bg-surface-2 text-ink-2 border border-border",
        )}
        style={
          isPersona
            ? { background: "linear-gradient(135deg, #847460, #4b3f2f)" }
            : undefined
        }
      >
        {initial}
      </div>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-4 py-2.5 text-[13px] leading-[1.55] whitespace-pre-wrap",
          isPersona
            ? "bg-surface-2 text-ink rounded-bl-sm"
            : "bg-accent-pale text-ink border border-accent/15 rounded-br-sm",
        )}
      >
        {turn.content}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Format helpers
// ═══════════════════════════════════════════════════════════

function fmtDuration(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtImprovement(pct: number | null): string {
  if (pct == null) return "—";
  if (pct === 0) return "+0%";
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

function prettyMode(mode: string): string {
  switch (mode.toLowerCase()) {
    case "video":
      return "Video";
    case "voice":
    case "audio":
      return "Audio";
    case "text":
      return "Text";
    default:
      return mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase();
  }
}
