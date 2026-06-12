// Admin · Dashboard  (01_ADMIN.md §Dashboard)
//
// Performance pulse across the tenant. Pixel-perfect pass matches the
// prototype's dark "AI Weekly Brief" hero + `.akpi` corner-icon KPIs from
// design_files/admin.css.

import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import {
  getAdminDashboardStats,
  listTrainingsForAdmin,
  listEmployeesForCompany,
  getLeaderboardForCompany,
} from "@/lib/db/queries";
import {
  generateAdminWeeklyBrief,
  type AdminWeeklySignal,
} from "@/lib/ai/summary";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export default async function AdminDashboard() {
  const user = (await getSessionUser())!;
  if (!user.companyId) {
    return (
      <div className="px-6 py-8 max-w-[800px]">
        <Card pad="lg">
          <h2 className="font-display text-[22px]">No tenant linked</h2>
          <p className="text-ink-2 text-[13px] mt-2">
            Your admin account isn't linked to a company. Contact a platform
            operator.
          </p>
        </Card>
      </div>
    );
  }

  const [stats, trainings, employees, leaderboard] = await Promise.all([
    getAdminDashboardStats(user.companyId),
    listTrainingsForAdmin(user.companyId),
    listEmployeesForCompany(user.companyId),
    getLeaderboardForCompany(user.companyId),
  ]);

  const recentTrainings = trainings.slice(0, 3);
  // "Needs attention" = trainees who have a notably low avg score.
  const needsAttention = employees
    .filter(
      (e) => e.role === "trainee" && e.avgScore != null && e.avgScore < 60,
    )
    .slice(0, 4);

  const topPerformer = leaderboard[0];
  const briefSignal: AdminWeeklySignal = {
    learners: stats.learners,
    activeTrainings: stats.activeTrainings,
    sessions: stats.sessions,
    avgScore: stats.avgScore,
    completionPct: stats.completionPct,
    topPerformerName:
      topPerformer && topPerformer.avgScore != null
        ? topPerformer.name ?? topPerformer.email.split("@")[0]
        : null,
    topPerformerScore: topPerformer?.avgScore ?? null,
    strugglingCount: needsAttention.length,
  };
  const aiBrief = await generateAdminWeeklyBrief({
    companyId: user.companyId,
    signal: briefSignal,
  });

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1480px] space-y-[22px]">
      {/* Page head — apage-head from admin.css */}
      <header className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <h1 className="font-display text-[30px] leading-none -tracking-[0.015em]">
            Training Dashboard
          </h1>
          <p className="text-ink-2 text-[13.5px] mt-2 max-w-[540px] leading-[1.5]">
            Performance pulse across your org.
          </p>
        </div>
        <Link
          href="/admin/trainings"
          className="inline-flex items-center gap-1.5 px-[14px] py-[7px] rounded-sm text-[13px] font-medium bg-accent text-white border border-accent hover:bg-accent-strong hover:border-accent-strong"
        >
          <Icon name="ai-sparkle" size={12} />
          New training
        </Link>
      </header>

      <AiWeeklyBrief
        learners={stats.learners}
        activeTrainings={stats.activeTrainings}
        avgScore={stats.avgScore}
        sessions={stats.sessions}
        completionPct={stats.completionPct}
        attentionCount={needsAttention.length}
        aiBrief={aiBrief}
      />

      {/* KPI row — .akpi pattern */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-[14px]">
        <Kpi
          label="Learners"
          value={String(stats.learners)}
          icon="users"
          tone="accent"
        />
        <Kpi
          label="Active trainings"
          value={String(stats.activeTrainings)}
          icon="training"
          tone="good"
        />
        <Kpi
          label="Avg score"
          value={stats.avgScore != null ? String(stats.avgScore) : "—"}
          icon="chart"
          tone="violet"
          delta={
            stats.avgScore != null
              ? {
                  dir: stats.avgScore >= 70 ? "up" : "down",
                  text: stats.avgScore >= 70 ? "on target" : "below 70",
                }
              : null
          }
        />
        <Kpi
          label="Completion"
          value={
            stats.completionPct != null ? `${stats.completionPct}%` : "—"
          }
          icon="clipboard"
          tone="warn"
          delta={
            stats.assignmentsTotal > 0
              ? {
                  dir: "up",
                  text: `${stats.assignmentsCompleted}/${stats.assignmentsTotal}`,
                }
              : null
          }
        />
      </div>

      {/* Two-column: recent trainings + needs attention */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[14px]">
        <Card pad="md" className="lg:col-span-2 space-y-3 rounded-[12px]">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
              Recent trainings
            </div>
            <Link
              href="/admin/trainings"
              className="text-[12px] text-ink-2 hover:text-ink"
            >
              See all →
            </Link>
          </div>
          {recentTrainings.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">
              No trainings yet. Spin up your first one from{" "}
              <Link
                href="/admin/trainings"
                className="text-accent underline"
              >
                Trainings
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-2">
              {recentTrainings.map((t) => (
                <Link
                  key={t.id}
                  href={`/admin/trainings/${t.id}`}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-surface-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[13px] truncate flex items-center gap-2">
                      {t.title}
                      <StatusPill status={t.status} />
                    </div>
                    <div className="text-[11.5px] text-ink-3 font-mono">
                      {t._count.modules} modules · {t.learnerCount} learners
                      {t.completionPct != null
                        ? ` · ${t.completionPct}% complete`
                        : ""}
                    </div>
                  </div>
                  <Icon name="chevron-right" size={14} className="text-ink-3" />
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card pad="md" className="space-y-3 rounded-[12px]">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
            Needs attention
          </div>
          {needsAttention.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">
              No struggling learners right now.
            </p>
          ) : (
            <ul className="space-y-2">
              {needsAttention.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-2 text-[12.5px]"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-bad shrink-0" />
                  <span className="flex-1 truncate text-ink">
                    {e.name ?? e.email}
                  </span>
                  <span className="font-mono text-[11px] text-bad">
                    {e.avgScore}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─────────────── AI Weekly Brief ───────────────
// Dark hero card matching the prototype screenshot (admin-01-dashboard.png).
// Copy is composed deterministically from real stats; "generated just now"
// reflects the per-request server render. A future iteration can swap the
// composed text for a real Claude call cached daily.

function AiWeeklyBrief({
  learners,
  activeTrainings,
  avgScore,
  sessions,
  completionPct,
  attentionCount,
  aiBrief,
}: {
  learners: number;
  activeTrainings: number;
  avgScore: number | null;
  sessions: number;
  completionPct: number | null;
  attentionCount: number;
  aiBrief: string;
}) {
  const title = buildBriefTitle({ attentionCount, sessions, learners });
  const body = buildBriefBody({
    learners,
    activeTrainings,
    avgScore,
    sessions,
    completionPct,
    attentionCount,
  });

  return (
    <div
      className="relative overflow-hidden rounded-[14px] border border-[#2a2230] text-white p-7"
      style={{
        background:
          "radial-gradient(circle at top right, rgba(232,93,58,0.22) 0%, transparent 55%), linear-gradient(135deg, #2a1f2e 0%, #1a1320 60%, #221624 100%)",
      }}
    >
      <div className="relative space-y-3 max-w-[680px]">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-accent">
          <Icon name="ai-sparkle" size={11} />
          <span>AI Weekly Brief</span>
          <span className="text-white/40">·</span>
          <span className="text-white/60 font-semibold tracking-[0.1em]">
            Generated just now
          </span>
        </div>
        <h2 className="font-display text-[36px] leading-[1.1] -tracking-[0.015em] text-white">
          {title}
        </h2>
        <p className="text-[14px] leading-[1.55] text-white/75">{body}</p>
        <p className="text-[13px] leading-[1.55] text-white/65 border-l-2 border-accent/50 pl-3 italic">
          {aiBrief}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Link
            href="/admin/reports"
            className="inline-flex items-center gap-1.5 px-[14px] py-[8px] rounded-[8px] text-[12.5px] font-semibold bg-white text-ink hover:bg-white/90"
          >
            <Icon name="rocket" size={13} />
            View full brief
          </Link>
          {attentionCount > 0 ? (
            <Link
              href="/admin/generate"
              className="inline-flex items-center gap-1.5 px-[14px] py-[8px] rounded-[8px] text-[12.5px] font-semibold text-white border border-white/25 bg-white/[0.08] hover:bg-white/[0.12]"
            >
              Auto-fix all {attentionCount}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function buildBriefTitle({
  attentionCount,
  sessions,
  learners,
}: {
  attentionCount: number;
  sessions: number;
  learners: number;
}): string {
  if (attentionCount >= 3)
    return `${attentionCount} learners need your attention this week.`;
  if (attentionCount > 0)
    return `${attentionCount} ${
      attentionCount === 1 ? "learner needs" : "learners need"
    } a closer look.`;
  if (sessions === 0)
    return "Your team hasn't started practicing yet — kick off your first roleplay.";
  return `Your team's pulse this week — ${learners} ${
    learners === 1 ? "learner" : "learners"
  }, all clear.`;
}

function buildBriefBody(args: {
  learners: number;
  activeTrainings: number;
  avgScore: number | null;
  sessions: number;
  completionPct: number | null;
  attentionCount: number;
}): React.ReactNode {
  const { activeTrainings, avgScore, sessions, completionPct } = args;
  const parts: React.ReactNode[] = [];

  if (activeTrainings > 0)
    parts.push(
      <span key="t">
        {activeTrainings} active{" "}
        {activeTrainings === 1 ? "training" : "trainings"}
      </span>,
    );
  if (sessions > 0)
    parts.push(
      <span key="s">
        {sessions} roleplay {sessions === 1 ? "session" : "sessions"} run
      </span>,
    );
  if (completionPct != null)
    parts.push(
      <span key="c">
        completion at{" "}
        <strong
          className={cn(
            "font-semibold",
            completionPct >= 70 ? "text-good" : "text-warn",
          )}
        >
          {completionPct}%
        </strong>
      </span>,
    );
  if (avgScore != null)
    parts.push(
      <span key="a">
        avg score{" "}
        <strong
          className={cn(
            "font-semibold",
            avgScore >= 70 ? "text-good" : "text-bad",
          )}
        >
          {avgScore}
        </strong>
      </span>,
    );

  if (parts.length === 0)
    return (
      <>
        No activity yet. Once your team starts running roleplays this brief
        will surface trends, dips, and one-click fixes.
      </>
    );

  const stitched: React.ReactNode[] = [];
  parts.forEach((p, i) => {
    if (i === 0) stitched.push(p);
    else if (i === parts.length - 1) stitched.push(", and ", p);
    else stitched.push(", ", p);
  });
  return <>{stitched}.</>;
}

// ─────────────── KPI tile ───────────────
// Matches admin.css `.akpi` — 12px radius, 16/18 padding, label / value / delta,
// 30×30 corner icon chip with tone-tinted bg.

function Kpi({
  label,
  value,
  icon,
  tone,
  delta,
}: {
  label: string;
  value: string;
  icon: IconName;
  tone: "accent" | "good" | "warn" | "violet";
  delta?: { dir: "up" | "down"; text: string } | null;
}) {
  const cornerTone =
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
      {delta ? (
        <div
          className={cn(
            "text-[11.5px] inline-flex items-center gap-[3px] mt-[5px]",
            delta.dir === "up" ? "text-good" : "text-bad",
          )}
        >
          <span>{delta.dir === "up" ? "↑" : "↓"}</span>
          <span>{delta.text}</span>
        </div>
      ) : null}
      <div
        className={cn(
          "absolute top-[14px] right-[14px] w-[30px] h-[30px] rounded-[8px] grid place-items-center",
          cornerTone,
        )}
      >
        <Icon name={icon} size={14} />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: "draft" | "published" | "archived" }) {
  const cls =
    status === "published"
      ? "bg-good-pale text-good border-good/20"
      : status === "draft"
        ? "bg-warn-pale text-warn border-warn/20"
        : "bg-surface-2 text-ink-3 border-border";
  return (
    <span
      className={cn(
        "text-[10px] font-semibold uppercase tracking-[0.08em] px-[6px] py-[1px] rounded-sm border",
        cls,
      )}
    >
      {status}
    </span>
  );
}
