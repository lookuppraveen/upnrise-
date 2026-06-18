// Admin · Reports  (01_ADMIN.md §Reports)
//
// We ship three honest exports — trainings, learners, sessions — each
// composed against real data, plus a per-zone breakdown grouped by the
// tenant's org tree (Team → HQ → Zone), plus a saved & scheduled list
// from the SavedReport table. The scheduler runtime that actually emails
// the recurring reports isn't wired yet; cadence renders as informational
// metadata. The skill heatmap from the design source still isn't modeled,
// and the weekly learning-pattern line chart needs per-day rollups we
// don't materialize.

import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import {
  getAdminDashboardStats,
  getLeaderboardForCompany,
  getZoneBreakdownForCompany,
} from "@/lib/db/queries";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type ReportKind = "trainings" | "learners" | "sessions";

export default async function ReportsPage() {
  const user = (await getSessionUser())!;
  if (!user.companyId) return null;

  const [stats, leaderboard, recentSessions, zones, savedReports] =
    await Promise.all([
      getAdminDashboardStats(user.companyId),
      getLeaderboardForCompany(user.companyId),
      prisma.roleplaySession.findMany({
        where: { user: { companyId: user.companyId } },
        orderBy: { startedAt: "desc" },
        take: 8,
        select: {
          id: true,
          startedAt: true,
          score: true,
          user: { select: { email: true, name: true } },
          module: {
            select: {
              name: true,
              training: { select: { title: true } },
            },
          },
        },
      }),
      getZoneBreakdownForCompany(user.companyId),
      prisma.savedReport.findMany({
        where: { companyId: user.companyId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          kind: true,
          cadence: true,
          recipients: true,
          lastSentAt: true,
          nextSendAt: true,
        },
      }),
    ]);

  const top3 = leaderboard.slice(0, 3);
  const struggling = leaderboard
    .filter((r) => r.avgScore != null && r.avgScore < 60)
    .slice(0, 4);

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1280px] space-y-5">
      <Header />
      <KpiStrip stats={stats} struggling={struggling.length} />
      <InsightBanner
        avgScore={stats.avgScore}
        sessions={stats.sessions}
        completionPct={stats.completionPct}
        topName={top3[0]?.name ?? top3[0]?.email.split("@")[0] ?? null}
        topScore={top3[0]?.avgScore ?? null}
        strugglingCount={struggling.length}
      />

      <SectionLabel>Exports</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[14px]">
        <ReportCard
          kind="trainings"
          title="Trainings"
          icon="training"
          tone="accent"
          primary={`${stats.activeTrainings}`}
          primaryLabel="active"
          secondary={
            stats.completionPct != null ? `${stats.completionPct}%` : "—"
          }
          secondaryLabel="completion"
          description="Every training with module count, learners assigned, completion %, and average score."
        />
        <ReportCard
          kind="learners"
          title="Learners"
          icon="users"
          tone="good"
          primary={`${stats.learners}`}
          primaryLabel="trainees"
          secondary={`${stats.sessions}`}
          secondaryLabel="sessions"
          description="Per-learner activity — average & best score, minutes practiced, assignments outstanding."
        />
        <ReportCard
          kind="sessions"
          title="Sessions"
          icon="activity"
          tone="violet"
          primary={`${stats.sessions}`}
          primaryLabel="total"
          secondary={stats.avgScore != null ? `${stats.avgScore}` : "—"}
          secondaryLabel="avg score"
          description="Raw roleplay log — score, mode, duration, strong & weak skills per attempt."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <PerformerList
          title="Top performers"
          hint="Highest average across roleplay attempts."
          tone="good"
          rows={top3.map((t) => ({
            id: t.id,
            name: t.name ?? t.email.split("@")[0],
            value: t.avgScore,
            meta: `${t.sessions} sessions`,
          }))}
          empty="No scored sessions yet."
        />
        <PerformerList
          title="Needs attention"
          hint="Average below 60 — candidates for a coaching nudge."
          tone="bad"
          rows={struggling.map((b) => ({
            id: b.id,
            name: b.name ?? b.email.split("@")[0],
            value: b.avgScore,
            meta: `${b.sessions} sessions`,
          }))}
          empty="No struggling learners — keep at it."
        />
      </div>

      {zones.length > 0 ? <ZoneBreakdown rows={zones} /> : null}

      <SavedReportsCard reports={savedReports} />

      <RecentSessions rows={recentSessions} />
    </div>
  );
}

// ─────────────── Zone breakdown ───────────────

function ZoneBreakdown({
  rows,
}: {
  rows: Array<{
    zoneId: string | null;
    zoneName: string;
    learners: number;
    sessions: number;
    avgScore: number | null;
  }>;
}) {
  const maxSessions = Math.max(...rows.map((r) => r.sessions), 1);
  const totalLearners = rows.reduce((acc, r) => acc + r.learners, 0);
  return (
    <div className="bg-surface border border-border rounded-[12px] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-[28px] h-[28px] rounded-[7px] bg-accent-pale text-accent-strong grid place-items-center">
            <Icon name="globe" size={13} />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
              By zone
            </div>
            <p className="text-[12px] text-ink-2 mt-0.5">
              Trainees grouped by the zone their team sits in.
            </p>
          </div>
        </div>
        <span className="text-[10.5px] font-mono text-ink-3">
          {totalLearners} learner{totalLearners === 1 ? "" : "s"} total
        </span>
      </div>
      <ul className="space-y-3">
        {rows.map((r, i) => {
          const pct = Math.round((r.sessions / maxSessions) * 100);
          const isUnassigned = r.zoneId === null;
          const tone =
            r.avgScore == null
              ? "text-ink-3"
              : r.avgScore >= 75
                ? "text-good"
                : r.avgScore >= 60
                  ? "text-warn"
                  : "text-bad";
          return (
            <li key={r.zoneId ?? "unassigned"} className="space-y-1">
              <div className="flex items-center gap-3 text-[12.5px]">
                <span
                  className={cn(
                    "font-semibold truncate",
                    isUnassigned ? "text-ink-3 italic" : "text-ink",
                  )}
                >
                  {r.zoneName}
                </span>
                <span className="text-[10.5px] font-mono text-ink-3 shrink-0">
                  {r.learners} learner{r.learners === 1 ? "" : "s"} · {r.sessions} session{r.sessions === 1 ? "" : "s"}
                </span>
                <span
                  className={cn(
                    "ml-auto font-display text-[18px] leading-none tabular-nums shrink-0",
                    tone,
                  )}
                >
                  {r.avgScore ?? "—"}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3 shrink-0 w-[34px] text-right">
                  avg
                </span>
              </div>
              <div className="h-[6px] rounded-full bg-surface-2 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    i === 0 && !isUnassigned ? "bg-accent" : "bg-accent/55",
                  )}
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─────────────── Header ───────────────

function Header() {
  return (
    <header className="space-y-2">
      <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
        Reports
      </h1>
      <p className="text-ink-2 text-[13.5px] max-w-[680px] leading-[1.5]">
        Snapshots of what your learners are doing — download each as CSV
        for the spreadsheet pass. Scheduled emails and ad-hoc builders ship
        in a later phase.
      </p>
    </header>
  );
}

// ─────────────── KPI strip ───────────────

function KpiStrip({
  stats,
  struggling,
}: {
  stats: Awaited<ReturnType<typeof getAdminDashboardStats>>;
  struggling: number;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-[14px]">
      <KpiTile
        label="Sessions"
        value={String(stats.sessions)}
        sub={
          stats.sessions === 0
            ? "no roleplays logged"
            : `across ${stats.learners} trainees`
        }
        icon="activity"
        tone="accent"
      />
      <KpiTile
        label="Avg score"
        value={stats.avgScore != null ? `${stats.avgScore}` : "—"}
        sub={
          stats.avgScore == null
            ? "no scored attempts"
            : stats.avgScore >= 75
              ? "healthy band"
              : stats.avgScore >= 60
                ? "room to grow"
                : "below target"
        }
        icon="chart"
        tone={
          stats.avgScore == null || stats.avgScore >= 75
            ? "good"
            : stats.avgScore >= 60
              ? "warn"
              : "warn"
        }
      />
      <KpiTile
        label="Completion"
        value={
          stats.completionPct != null ? `${stats.completionPct}%` : "—"
        }
        sub={
          stats.assignmentsTotal === 0
            ? "no assignments yet"
            : `${stats.assignmentsCompleted} of ${stats.assignmentsTotal} done`
        }
        icon="clipboard"
        tone="violet"
      />
      <KpiTile
        label="Needs attention"
        value={String(struggling)}
        sub={
          struggling === 0
            ? "no struggling learners"
            : "average below 60"
        }
        icon="alert"
        tone={struggling > 0 ? "warn" : "good"}
      />
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: IconName;
  tone: "accent" | "good" | "warn" | "violet";
}) {
  const corner =
    tone === "accent"
      ? "bg-accent-pale text-accent-strong"
      : tone === "good"
        ? "bg-good-pale text-good"
        : tone === "warn"
          ? "bg-warn-pale text-warn"
          : "bg-[#ede9fe] text-[#6d4ad9]";
  return (
    <div className="relative bg-surface border border-border rounded-[12px] px-[18px] py-4 flex flex-col gap-1">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {label}
      </div>
      <div className="font-display text-[32px] leading-[1.05] -tracking-[0.01em] mt-1">
        {value}
      </div>
      <div className="text-[11.5px] text-ink-3 mt-[3px] truncate">{sub}</div>
      <div
        className={cn(
          "absolute top-[14px] right-[14px] w-[28px] h-[28px] rounded-[7px] grid place-items-center",
          corner,
        )}
      >
        <Icon name={icon} size={13} />
      </div>
    </div>
  );
}

// ─────────────── Insight banner ───────────────
//
// One short paragraph composed from the same numbers shown above —
// helps the admin notice the headline before scrolling.

function InsightBanner({
  avgScore,
  sessions,
  completionPct,
  topName,
  topScore,
  strugglingCount,
}: {
  avgScore: number | null;
  sessions: number;
  completionPct: number | null;
  topName: string | null;
  topScore: number | null;
  strugglingCount: number;
}) {
  let body: React.ReactNode;
  if (sessions === 0) {
    body = (
      <>
        No roleplays have been run yet. Once trainees start practising the
        report kinds below will fill in.
      </>
    );
  } else {
    const avgTone =
      avgScore == null
        ? null
        : avgScore >= 75
          ? "text-good"
          : avgScore >= 60
            ? "text-warn"
            : "text-bad";
    body = (
      <>
        {avgScore != null ? (
          <>
            Org average is{" "}
            <span className={cn("font-semibold", avgTone)}>{avgScore}</span>{" "}
            across {sessions} session{sessions === 1 ? "" : "s"}
            {completionPct != null
              ? `, with assignments at ${completionPct}% complete`
              : ""}
            .
          </>
        ) : null}
        {topName && topScore != null ? (
          <>
            {" "}
            <span className="font-semibold text-ink">{topName}</span> is
            pacing the leaderboard at {topScore}.
          </>
        ) : null}
        {strugglingCount > 0 ? (
          <>
            {" "}
            <span className="font-semibold text-bad">{strugglingCount}</span>{" "}
            learner{strugglingCount === 1 ? " is" : "s are"} averaging below
            60 — worth a coaching pass.
          </>
        ) : (
          <> No-one is averaging below 60 right now.</>
        )}
      </>
    );
  }

  return (
    <div
      className="rounded-[12px] border px-5 py-4 flex items-start gap-3"
      style={{
        background: "linear-gradient(135deg, #f3eafa, #fce8f0)",
        borderColor: "#e6d2f1",
      }}
    >
      <div
        className="w-[32px] h-[32px] rounded-[8px] grid place-items-center text-white shrink-0"
        style={{
          background: "linear-gradient(135deg, #a855f7, #ec4899)",
        }}
      >
        <Icon name="ai-sparkle" size={14} />
      </div>
      <div className="min-w-0 space-y-1">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#6d4ad9]">
          UPnRise AI · Brief
        </div>
        <p className="text-[13px] text-ink leading-[1.55]">{body}</p>
      </div>
    </div>
  );
}

// ─────────────── Section label ───────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3 pt-1">
      {children}
    </div>
  );
}

// ─────────────── Report card ───────────────

function ReportCard({
  kind,
  title,
  icon,
  tone,
  primary,
  primaryLabel,
  secondary,
  secondaryLabel,
  description,
}: {
  kind: ReportKind;
  title: string;
  icon: IconName;
  tone: "accent" | "good" | "violet";
  primary: string;
  primaryLabel: string;
  secondary: string;
  secondaryLabel: string;
  description: string;
}) {
  const corner =
    tone === "accent"
      ? "bg-accent-pale text-accent-strong"
      : tone === "good"
        ? "bg-good-pale text-good"
        : "bg-[#ede9fe] text-[#6d4ad9]";
  return (
    <div className="relative bg-surface border border-border rounded-[12px] p-5 flex flex-col gap-3">
      <div
        className={cn(
          "absolute top-[14px] right-[14px] w-[32px] h-[32px] rounded-[8px] grid place-items-center",
          corner,
        )}
      >
        <Icon name={icon} size={15} />
      </div>
      <div className="text-[13.5px] font-semibold text-ink">{title}</div>
      <div className="flex items-end gap-5">
        <Stat value={primary} label={primaryLabel} />
        <div className="w-px h-[34px] bg-border" />
        <Stat value={secondary} label={secondaryLabel} />
      </div>
      <p className="text-[12px] text-ink-2 leading-[1.55]">{description}</p>
      <a
        href={`/api/admin/reports/export?kind=${kind}`}
        download
        className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accent hover:text-accent-strong w-fit"
      >
        Download CSV
        <Icon name="chevron-right" size={12} />
      </a>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-display text-[28px] leading-[1] -tracking-[0.01em] text-ink">
        {value}
      </div>
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3 mt-1">
        {label}
      </div>
    </div>
  );
}

// ─────────────── Performer lists ───────────────

function PerformerList({
  title,
  hint,
  tone,
  rows,
  empty,
}: {
  title: string;
  hint: string;
  tone: "good" | "bad";
  rows: Array<{
    id: string;
    name: string;
    value: number | null;
    meta: string;
  }>;
  empty: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-[12px] p-5 space-y-3">
      <div className="space-y-1">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
          {title}
        </div>
        <p className="text-[12px] text-ink-2 leading-[1.5]">{hint}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-ink-3">{empty}</p>
      ) : (
        <ul className="space-y-[2px]">
          {rows.map((r, i) => (
            <li
              key={r.id}
              className="flex items-center gap-3 py-2 border-t border-border first:border-t-0"
            >
              <span className="w-[22px] text-[11px] font-mono text-ink-3 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block truncate text-[13px] text-ink">
                  {r.name}
                </span>
                <span className="block text-[11px] text-ink-3">{r.meta}</span>
              </span>
              <span
                className={cn(
                  "font-display text-[20px] leading-none tabular-nums shrink-0",
                  tone === "good" ? "text-good" : "text-bad",
                )}
              >
                {r.value ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────── Saved reports ───────────────

type SavedReport = {
  id: string;
  name: string;
  kind: "trainings" | "learners" | "sessions" | "zone";
  cadence: "manual" | "daily" | "weekly" | "monthly";
  recipients: string[];
  lastSentAt: Date | null;
  nextSendAt: Date | null;
};

function SavedReportsCard({ reports }: { reports: SavedReport[] }) {
  return (
    <div className="bg-surface border border-border rounded-[12px] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-[28px] h-[28px] rounded-[7px] bg-[#ede9fe] text-[#6d4ad9] grid place-items-center">
            <Icon name="layers" size={13} />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
              Saved &amp; scheduled
            </div>
            <p className="text-[12px] text-ink-2 mt-0.5">
              Exports pinned for download or email. The runtime scheduler
              isn&apos;t wired yet — scheduled reports show their cadence and
              await delivery.
            </p>
          </div>
        </div>
      </div>
      {reports.length === 0 ? (
        <p className="text-[12.5px] text-ink-3">
          No saved reports yet. A future iteration adds &quot;Save current view&quot; to
          each exports card.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {reports.map((r) => (
            <li key={r.id} className="py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-semibold text-ink truncate">
                    {r.name}
                  </span>
                  <KindChip kind={r.kind} />
                  <CadencePill cadence={r.cadence} />
                </div>
                <div className="text-[11px] text-ink-3 font-mono mt-1 truncate">
                  {r.recipients.length === 0
                    ? "download only"
                    : `${r.recipients.length} recipient${r.recipients.length === 1 ? "" : "s"} · ${r.recipients.slice(0, 2).join(", ")}${r.recipients.length > 2 ? ` +${r.recipients.length - 2}` : ""}`}
                  {r.lastSentAt
                    ? ` · last sent ${r.lastSentAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                    : ""}
                </div>
              </div>
              {r.kind === "zone" ? (
                <span className="text-[11px] text-ink-3 font-mono shrink-0">
                  (in-page)
                </span>
              ) : (
                <a
                  href={`/api/admin/reports/export?kind=${r.kind}`}
                  download
                  className="text-[12px] font-semibold text-accent hover:text-accent-strong shrink-0"
                >
                  Download
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KindChip({
  kind,
}: {
  kind: "trainings" | "learners" | "sessions" | "zone";
}) {
  const label = {
    trainings: "Trainings",
    learners: "Learners",
    sessions: "Sessions",
    zone: "Zone",
  }[kind];
  const cls = {
    trainings: "bg-accent-pale text-accent-strong",
    learners: "bg-good-pale text-good",
    sessions: "bg-[#ede9fe] text-[#6d4ad9]",
    zone: "bg-warn-pale text-warn",
  }[kind];
  return (
    <span
      className={cn(
        "text-[10px] font-bold uppercase tracking-[0.08em] px-2 py-0.5 rounded-[5px]",
        cls,
      )}
    >
      {label}
    </span>
  );
}

function CadencePill({
  cadence,
}: {
  cadence: "manual" | "daily" | "weekly" | "monthly";
}) {
  if (cadence === "manual") {
    return (
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
        Manual
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-2">
      <Icon name="calendar" size={9} />
      {cadence}
    </span>
  );
}

// ─────────────── Recent sessions ───────────────

function RecentSessions({
  rows,
}: {
  rows: Array<{
    id: string;
    startedAt: Date;
    score: number | null;
    user: { email: string; name: string | null };
    module: { name: string; training: { title: string } };
  }>;
}) {
  return (
    <div className="bg-surface border border-border rounded-[12px] overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
            Recent sessions
          </div>
          <p className="text-[12px] text-ink-2 mt-1">
            Latest 8 attempts — drill into the Sessions CSV for the full log.
          </p>
        </div>
        <a
          href="/api/admin/reports/export?kind=sessions"
          download
          className="text-[12.5px] font-semibold text-accent hover:text-accent-strong inline-flex items-center gap-1"
        >
          Full log
          <Icon name="chevron-right" size={12} />
        </a>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-ink-3">
          No sessions yet.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((s) => {
            const who = s.user.name ?? s.user.email.split("@")[0];
            const scoreTone =
              s.score == null
                ? "text-ink-3"
                : s.score >= 75
                  ? "text-good"
                  : s.score >= 60
                    ? "text-warn"
                    : "text-bad";
            return (
              <li key={s.id}>
                <Link
                  href={`/admin/sessions/${s.id}`}
                  className="px-5 py-3 flex items-center gap-4 hover:bg-surface-2 transition-colors"
                >
                  <span className="font-mono text-[11px] text-ink-3 w-[68px] shrink-0">
                    {new Date(s.startedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-[13px] text-ink">
                      {who} · {s.module.training.title}
                    </span>
                    <span className="block truncate text-[11.5px] text-ink-3">
                      {s.module.name}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "font-display text-[20px] leading-none tabular-nums shrink-0",
                      scoreTone,
                    )}
                  >
                    {s.score ?? "—"}
                  </span>
                  <Icon
                    name="chevron-right"
                    size={14}
                    className="text-ink-3 shrink-0"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
