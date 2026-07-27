// Trainee · Assignments  (03_TRAINEE.md §Assignments)
//
// Pixel-perfect pass matches learn-04-assignments.png:
//   - Accent display title with (N) count
//   - AI nudge banner — picks the highest-impact pending assignment and
//     composes a one-sentence reason from real fields (priority, dueAt,
//     aiReason)
//   - Pill-style tabs: All / Pending / In progress / Completed / Overdue
//   - Card rebuild: priority pill (with "AI" sub-tag when ai-driven),
//     module-type-style icon tile, accent AI reason chip, big progress
//     ring on the right
//
// Tabs use URL params (kept consistent with the rest of the trainee
// surface). Search/sort isn't requested in the prototype.

import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getAssignmentsWithProgressForUser } from "@/lib/db/queries";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { cn } from "@/lib/cn";

type TabKey = "all" | "pending" | "in_progress" | "completed" | "overdue";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "overdue", label: "Overdue" },
];

type AssignmentItem = Awaited<
  ReturnType<typeof getAssignmentsWithProgressForUser>
>[number];

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "all") as TabKey;

  const user = (await getSessionUser())!;
  const all = await getAssignmentsWithProgressForUser(user.id);

  const filtered = all.filter((a) => matchesTab(a, tab));

  const counts = {
    all: all.length,
    pending: all.filter((a) => a.computedStatus === "not_started").length,
    in_progress: all.filter((a) => a.computedStatus === "in_progress").length,
    completed: all.filter((a) => a.computedStatus === "completed").length,
    overdue: all.filter((a) => a.overdue).length,
  };

  const topPriority = pickTopAssignment(all);

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1100px] space-y-5">
      <header className="space-y-2">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="font-display text-[36px] leading-[1.05] -tracking-[0.015em] text-accent">
            Assignments
          </h1>
          <span className="font-display text-[26px] leading-none text-ink-3">
            ({all.length})
          </span>
        </div>
        <p className="text-ink-2 text-[13.5px]">
          What your team needs you to practice. Sorted by what&apos;s due
          first.
        </p>
      </header>

      {topPriority ? <TopPriorityBanner a={topPriority} /> : null}

      {/* Pill tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {TABS.map((t) => {
          const active = t.key === tab;
          const count = counts[t.key];
          return (
            <Link
              key={t.key}
              href={
                t.key === "all"
                  ? "/learn/assignments"
                  : `/learn/assignments?tab=${t.key}`
              }
              className={cn(
                "inline-flex items-center gap-1.5 px-[14px] py-[6px] rounded-full text-[12.5px] font-medium whitespace-nowrap transition-colors",
                active
                  ? "bg-ink text-white border border-ink"
                  : "bg-surface text-ink-2 border border-border hover:bg-surface-2",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "text-[11px] font-mono",
                  active ? "text-white/80" : "text-ink-3",
                )}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card pad="lg">
          <h2 className="font-display text-[20px]">
            Nothing under &quot;{TABS.find((t) => t.key === tab)?.label}&quot;
          </h2>
          <p className="text-ink-2 text-[13px] mt-2">
            {tab === "completed"
              ? "Complete a training to see it here."
              : tab === "pending"
                ? "You've started everything that's been assigned. Nice."
                : tab === "overdue"
                  ? "Nothing overdue — keep it up."
                  : "Try the All tab."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <AssignmentRow key={a.id} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────── Top priority AI nudge banner ───────────────

function TopPriorityBanner({ a }: { a: AssignmentItem }) {
  const dueLabel = formatDueShort(a.dueAt);
  const trailing = a.aiReason
    ? `— ${a.aiReason}`
    : a.overdue
      ? "— it's already overdue."
      : a.priority === "p1"
        ? "— it's your highest-priority push."
        : "— pick it up while it's fresh.";
  return (
    <Link
      href={`/learn/trainings/${a.training.id}`}
      className="block group focus:outline-none"
    >
      <div
        className="relative rounded-[14px] p-[14px] border flex items-start gap-3 transition-colors group-hover:border-[#7c3aed]/60"
        style={{
          background: "linear-gradient(135deg, #f3eafa 0%, #fce8f0 100%)",
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
          <div className="text-[13.5px] text-ink leading-snug">
            <span className="text-ink-2">Start with </span>
            <span className="font-semibold">
              &ldquo;{a.training.title}&rdquo;
            </span>{" "}
            <span className="text-ink-2">{dueLabel} {trailing}</span>
          </div>
        </div>
        <Icon
          name="chevron-right"
          size={14}
          className="text-ink-3 mt-1 shrink-0"
        />
      </div>
    </Link>
  );
}

/**
 * Picks the assignment to highlight in the top banner. Priority order:
 *   1. Overdue P1
 *   2. Due-today/tomorrow P1
 *   3. Any P1 not completed
 *   4. Earliest-due not completed
 */
function pickTopAssignment(
  all: AssignmentItem[],
): AssignmentItem | null {
  const incomplete = all.filter((a) => a.computedStatus !== "completed");
  if (incomplete.length === 0) return null;

  const overdueP1 = incomplete.find((a) => a.overdue && a.priority === "p1");
  if (overdueP1) return overdueP1;

  const dueSoonP1 = incomplete.find(
    (a) => a.priority === "p1" && a.dueAt && daysFromNow(a.dueAt) <= 2,
  );
  if (dueSoonP1) return dueSoonP1;

  const anyP1 = incomplete.find((a) => a.priority === "p1");
  if (anyP1) return anyP1;

  return incomplete[0];
}

// ─────────────── Assignment row ───────────────

function AssignmentRow({ a }: { a: AssignmentItem }) {
  const dueLabel = formatDue(a.dueAt);
  const status = a.computedStatus;

  return (
    <Link href={`/learn/trainings/${a.training.id}`} className="block group">
      <Card
        pad="md"
        className="group-hover:border-ink transition-colors rounded-[12px]"
      >
        <div className="flex items-start gap-3">
          <PriorityPill p={a.priority} ai={!!a.aiReason} />

          {/* Training icon tile */}
          <div
            className="w-10 h-10 rounded-[10px] grid place-items-center shrink-0 bg-surface-2 text-ink-2"
            aria-hidden
          >
            <Icon name="training" size={16} />
          </div>

          {/* Main */}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[13.5px] text-ink truncate">
              {a.training.title}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[11.5px] text-ink-3 font-mono">
              <span>
                {a.training._count.modules}{" "}
                {a.training._count.modules === 1 ? "module" : "modules"}
              </span>
              <span>·</span>
              <span className={cn(a.overdue ? "text-bad font-semibold" : "")}>
                {dueLabel}
              </span>
              {a.training.categories[0] ? (
                <>
                  <span>·</span>
                  <span className="uppercase tracking-[0.06em]">
                    {a.training.categories[0]}
                  </span>
                </>
              ) : null}
            </div>

            {a.aiReason ? (
              <div className="mt-2 inline-flex items-center gap-1.5 max-w-full">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-[10px] py-[3px] rounded-full",
                    "bg-accent-pale text-accent-strong border border-accent/15",
                    "text-[11.5px] font-medium",
                  )}
                >
                  <Icon name="ai-sparkle" size={10} />
                  <span className="truncate">{a.aiReason}</span>
                </span>
              </div>
            ) : null}
          </div>

          {/* Progress ring on the right */}
          <div className="shrink-0 flex flex-col items-center gap-1">
            <ProgressRing value={a.computedProgress} size={56} />
            <StatusLabel status={status} overdue={a.overdue} />
          </div>
        </div>
      </Card>
    </Link>
  );
}

function PriorityPill({
  p,
  ai,
}: {
  p: "p1" | "p2" | "p3";
  ai: boolean;
}) {
  const tone =
    p === "p1"
      ? "bg-accent-pale text-accent-strong border-accent/25"
      : p === "p2"
        ? "bg-warn-pale text-warn border-warn/25"
        : "bg-surface-2 text-ink-2 border-border";
  return (
    <span
      className={cn(
        "shrink-0 inline-flex flex-col items-center justify-center w-[44px] h-[44px] rounded-[10px] border",
        "font-mono font-bold text-[13px] uppercase leading-none gap-[3px]",
        tone,
      )}
    >
      <span>{p.toUpperCase()}</span>
      {ai ? (
        <span className="text-[8.5px] font-bold tracking-[0.08em] opacity-80">
          AI
        </span>
      ) : null}
    </span>
  );
}

function StatusLabel({
  status,
  overdue,
}: {
  status: "not_started" | "in_progress" | "completed";
  overdue: boolean;
}) {
  if (overdue) {
    return (
      <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-bad">
        Overdue
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-good">
        Done
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-2">
        In progress
      </span>
    );
  }
  return (
    <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
      Pending
    </span>
  );
}

// ─────────────── helpers ───────────────

function matchesTab(a: AssignmentItem, tab: TabKey): boolean {
  switch (tab) {
    case "all":
      return true;
    case "pending":
      return a.computedStatus === "not_started";
    case "in_progress":
      return a.computedStatus === "in_progress";
    case "completed":
      return a.computedStatus === "completed";
    case "overdue":
      return a.overdue;
  }
}

// dueAt round-trips through unstable_cache and comes back as an ISO
// string on cache hits. Accept `Date | string | null` everywhere and
// normalize via new Date(...) inside the helper — idempotent on Date.
function formatDue(due: Date | string | null): string {
  if (!due) return "No due date";
  const days = daysFromNow(due);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days <= 7) return `Due in ${days}d`;
  return `Due ${new Date(due).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function formatDueShort(due: Date | string | null): string {
  if (!due) return "";
  const days = daysFromNow(due);
  if (days < 0) return `is ${Math.abs(days)}d overdue`;
  if (days === 0) return "is due today";
  if (days === 1) return "is due tomorrow";
  if (days <= 7) return `is due in ${days}d`;
  return `is due ${new Date(due).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function daysFromNow(d: Date | string): number {
  return Math.round(
    (new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
}
