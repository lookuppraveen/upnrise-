// Trainee · Dashboard  (03_TRAINEE.md §Dashboard)
//
// Pixel-perfect pass matches the prototype screenshot (learn-03-dashboard.png):
//   - Accent-colored "Welcome, ${first}" headline
//   - Date-aware subtitle ("Tuesday, May 27 · 2 modules due this week")
//   - AI Focus card: soft accent gradient (.hero), floating dark gradient
//     pill, AI-gradient icon tile, highlighted-text title, contextual body
//   - KPI strip + Due soon + What to work on retained below
//
// Rankings cards from the prototype (team/zone/HQ) are deliberately skipped
// — we don't model team/zone yet.

import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import {
  getDashboardStatsForUser,
  getLastSessionForUser,
  getTopWeakSkillsForUser,
  getAssignmentsWithProgressForUser,
} from "@/lib/db/queries";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { AIBadge } from "@/components/ui/AIBadge";
import { ProgressRing } from "@/components/ui/ProgressRing";

export default async function LearnDashboard() {
  const user = (await getSessionUser())!;
  const [stats, last, weakSkills, assignments] = await Promise.all([
    getDashboardStatsForUser(user.id),
    getLastSessionForUser(user.id),
    getTopWeakSkillsForUser(user.id),
    getAssignmentsWithProgressForUser(user.id),
  ]);

  const dueSoon = assignments
    .filter((a) => a.computedStatus !== "completed")
    .slice(0, 3);

  const firstName = pickFirstName(user.name, user.email);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const dueThisWeekCount = countDueWithinDays(assignments, 7);

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1180px] space-y-6">
      <header>
        <h1 className="font-display text-[36px] leading-[1.05] -tracking-[0.015em] text-accent">
          Welcome, {firstName}
        </h1>
        <p className="text-ink-2 text-[13.5px] mt-2">
          {today}
          {dueThisWeekCount > 0
            ? ` · ${dueThisWeekCount} module${dueThisWeekCount === 1 ? "" : "s"} due this week`
            : " · all clear this week"}
        </p>
      </header>

      <AiFocusCard last={last} />

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Sessions" value={String(stats.sessions)} />
        <Kpi
          label="Avg score"
          value={stats.avgScore != null ? String(stats.avgScore) : "—"}
        />
        <Kpi
          label="Best"
          value={stats.bestScore != null ? String(stats.bestScore) : "—"}
        />
        <Kpi label="Min practiced" value={String(stats.minutesPracticed)} />
        <Kpi label="Points" value={stats.points.toLocaleString()} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Due assignments (2 cols) */}
        <div className="lg:col-span-2">
          <Card pad="md" className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                Due soon
              </div>
              <Link
                href="/learn/assignments"
                className="text-[12px] text-ink-2 hover:text-ink"
              >
                See all →
              </Link>
            </div>
            {dueSoon.length === 0 ? (
              <p className="text-[12.5px] text-ink-3">
                Nothing due right now. Browse{" "}
                <Link href="/learn/trainings" className="text-accent underline">
                  Trainings
                </Link>{" "}
                for more practice.
              </p>
            ) : (
              <div className="space-y-2">
                {dueSoon.map((a) => (
                  <Link
                    key={a.id}
                    href={`/learn/trainings/${a.training.id}`}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-surface-2"
                  >
                    <ProgressRing value={a.computedProgress} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[13px] truncate">
                        {a.training.title}
                      </div>
                      <div className="text-[11.5px] text-ink-3 font-mono">
                        {a.priority.toUpperCase()} ·{" "}
                        {a.dueAt
                          ? new Date(a.dueAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          : "no due date"}
                      </div>
                    </div>
                    <Icon
                      name="chevron-right"
                      size={14}
                      className="text-ink-3"
                    />
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Skill gaps */}
        <div>
          <Card pad="md" className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                What to work on
              </span>
              <AIBadge>Trend</AIBadge>
            </div>
            {weakSkills.length === 0 ? (
              <p className="text-[12.5px] text-ink-3">
                Run a few sessions and your top skill gaps will show up here.
              </p>
            ) : (
              <ul className="space-y-2">
                {weakSkills.map((w) => (
                  <li
                    key={w.skill}
                    className="flex items-center gap-2 text-[12.5px]"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-warn shrink-0" />
                    <span className="flex-1 text-ink">{w.skill}</span>
                    <span className="font-mono text-[10.5px] text-ink-3">
                      ×{w.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─────────────── AI Focus card ───────────────
// Soft accent gradient (.hero) with a floating dark gradient pill (`AI focus
// for today`) at the top edge and an AI-gradient square icon tile on the
// left. The training title is wrapped in an accent-pale highlight span.

function AiFocusCard({
  last,
}: {
  last: {
    id: string;
    score: number | null;
    moduleId: string;
    module: {
      name: string;
      training: { id: string; title: string };
    };
  } | null;
}) {
  if (!last) {
    return (
      <FocusShell>
        <FocusPill>+ Your AI focus for today</FocusPill>
        <div className="pt-3 flex items-start gap-5">
          <FocusIcon />
          <div className="flex-1 min-w-0 pt-1">
            <h2 className="font-display text-[28px] leading-[1.1] -tracking-[0.01em]">
              Set a baseline —{" "}
              <Highlight>start your first session</Highlight>
            </h2>
            <p className="text-ink-2 text-[13.5px] mt-2 max-w-[480px]">
              Your AI coach starts watching from session one. Run a quick
              roleplay so it can start tuning suggestions to your patterns.
            </p>
            <div className="flex items-center gap-2 mt-4">
              <Link href="/learn/trainings">
                <Button variant="accent" size="md">
                  Browse trainings
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </FocusShell>
    );
  }

  const score = last.score;
  const advice =
    score == null
      ? "Run another round and let the coach score it."
      : score >= 80
        ? "Hold the pace — string a few more of these together to lock it in."
        : score >= 60
          ? "Solid base — one focused module today gets you to par."
          : "Reset the basics — a focused module today rebuilds the foundation.";

  return (
    <FocusShell>
      <FocusPill>+ Your AI focus for today</FocusPill>
      <div className="pt-3 flex items-start gap-5">
        <FocusIcon />
        <div className="flex-1 min-w-0 pt-1">
          <h2 className="font-display text-[28px] leading-[1.1] -tracking-[0.01em]">
            Sharpen{" "}
            <Highlight>{last.module.training.title.toLowerCase()}</Highlight>
            <span className="text-ink-3"> — 15 min</span>
          </h2>
          <p className="text-ink-2 text-[13.5px] mt-2 max-w-[520px] leading-[1.55]">
            {score != null ? (
              <>
                You scored{" "}
                <span
                  className={
                    score >= 70
                      ? "font-semibold text-good"
                      : "font-semibold text-bad"
                  }
                >
                  {score}
                </span>{" "}
                last time on <em className="not-italic">{last.module.name}</em>
                . {advice}
              </>
            ) : (
              <>
                Your last session on{" "}
                <em className="not-italic">{last.module.name}</em> wasn't
                scored. {advice}
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-ink-2 mt-3">
            <MetaItem icon="play" label={last.module.name} />
            <MetaItem icon="chart" label="Target: 70+" />
          </div>
          <div className="flex items-center gap-2 mt-4">
            <Link
              href={`/learn/trainings/${last.module.training.id}/modules/${last.moduleId}/play`}
            >
              <Button variant="accent" size="md">
                Start practice
              </Button>
            </Link>
            <Link href={`/learn/trainings/${last.module.training.id}`}>
              <Button variant="secondary" size="md">
                View training
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </FocusShell>
  );
}

function FocusShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative rounded-[14px] border p-7"
      style={{
        background:
          "linear-gradient(135deg, #fff7f3 0%, var(--accent-pale) 100%)",
        borderColor: "#f5cdb8",
      }}
    >
      {children}
    </div>
  );
}

function FocusPill({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute -top-[14px] left-1/2 -translate-x-1/2">
      <span
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white px-[14px] py-[6px] rounded-full"
        style={{
          background:
            "linear-gradient(135deg, #7c3aed 0%, #b94e8d 60%, #e85d3a 100%)",
          boxShadow: "0 4px 14px rgba(124, 58, 237, 0.25)",
        }}
      >
        <Icon name="ai-sparkle" size={11} />
        {children}
      </span>
    </div>
  );
}

function FocusIcon() {
  return (
    <div
      className="w-[90px] h-[90px] rounded-[14px] grid place-items-center text-white shrink-0"
      style={{
        background: "var(--ai-grad)",
        boxShadow: "0 6px 20px rgba(232,93,58,0.3)",
      }}
    >
      <Icon name="ai-sparkle" size={36} />
    </div>
  );
}

function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-block">
      <span className="relative z-10">{children}</span>
      <span
        className="absolute left-0 right-0 bottom-[2px] h-[10px] -z-0 rounded-[2px]"
        style={{ background: "rgba(232,93,58,0.22)" }}
        aria-hidden
      />
    </span>
  );
}

function MetaItem({ icon, label }: { icon: "play" | "chart"; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon name={icon} size={12} className="text-accent-strong" />
      {label}
    </span>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card pad="md" className="space-y-1">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
        {label}
      </div>
      <div className="font-display text-[32px] leading-[1.05] -tracking-[0.01em] text-ink">
        {value}
      </div>
    </Card>
  );
}

// ─────────────── helpers ───────────────

function pickFirstName(name: string | null | undefined, email: string): string {
  if (name && name.trim()) {
    const first = name.trim().split(/\s+/)[0];
    // Strip generic "Trainee" / "Admin" suffixed seed names so it reads naturally.
    return first;
  }
  // Fallback: email handle, capitalized.
  const handle = email.split("@")[0];
  return handle.charAt(0).toUpperCase() + handle.slice(1);
}

function countDueWithinDays(
  assignments: Array<{
    // dueAt round-trips through unstable_cache, which serializes Date to
    // ISO string. Accept both so a fresh render (Date) and a cache hit
    // (string) both work — new Date(...) is idempotent on Dates.
    dueAt: Date | string | null;
    computedStatus: string;
  }>,
  days: number,
): number {
  const cutoff = Date.now() + days * 24 * 60 * 60 * 1000;
  return assignments.filter(
    (a) =>
      a.computedStatus !== "completed" &&
      a.dueAt != null &&
      new Date(a.dueAt).getTime() <= cutoff,
  ).length;
}
