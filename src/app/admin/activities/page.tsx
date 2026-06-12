// Admin · Activities  (01_ADMIN.md §Activities)
//
// Day-grouped feed of every audited action against this tenant. We only
// log four action types today (training.publish, assignment.bulk_upsert,
// impersonation.start/stop). The design source shows a richer mix —
// edits, archives, redemption approvals, scheduled-email sends — but
// those write-paths don't exist yet, so we don't fabricate them.

import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type Tone = "good" | "warn" | "ai" | "ink";

const ACTION_META: Record<
  string,
  { label: string; icon: IconName; tone: Tone; category: string }
> = {
  "training.publish": {
    label: "Published training",
    icon: "training",
    tone: "good",
    category: "Training",
  },
  "assignment.bulk_upsert": {
    label: "Assigned training",
    icon: "clipboard",
    tone: "ai",
    category: "Assignment",
  },
  "impersonation.start": {
    label: "Started impersonation",
    icon: "shield",
    tone: "warn",
    category: "Access",
  },
  "impersonation.stop": {
    label: "Stopped impersonation",
    icon: "shield",
    tone: "ink",
    category: "Access",
  },
};

type Entry = {
  id: string;
  action: string;
  target: string | null;
  createdAt: Date;
  metadata: unknown;
  actor: { id: string; email: string; name: string | null } | null;
};

export default async function ActivitiesPage() {
  const user = (await getSessionUser())!;
  if (!user.companyId) return null;

  const entries: Entry[] = await prisma.auditLog.findMany({
    where: { companyId: user.companyId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      actor: { select: { id: true, email: true, name: true } },
    },
  });

  // Batch-resolve target labels so the rows read like prose, not IDs.
  const trainingIds = new Set<string>();
  const userIds = new Set<string>();
  for (const e of entries) {
    if (!e.target) continue;
    const [kind, id] = e.target.split(":");
    if (kind === "training") trainingIds.add(id);
    else if (kind === "user") userIds.add(id);
  }
  const [trainings, users] = await Promise.all([
    trainingIds.size > 0
      ? prisma.training.findMany({
          where: { id: { in: [...trainingIds] } },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
    userIds.size > 0
      ? prisma.user.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, email: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const trainingMap = new Map(trainings.map((t) => [t.id, t.title]));
  const userMap = new Map(
    users.map((u) => [u.id, u.name ?? u.email.split("@")[0]]),
  );

  // KPI roll-ups
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const last24h = entries.filter(
    (e) => now - e.createdAt.getTime() < dayMs,
  );
  const last7d = entries.filter(
    (e) => now - e.createdAt.getTime() < 7 * dayMs,
  );
  const copilotCount = last7d.filter((e) => isCopilot(e)).length;
  const activeActors = new Set(
    last7d.map((e) => e.actor?.id).filter(Boolean),
  ).size;

  // Group by local day
  const days = groupByDay(entries);

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1280px] space-y-5">
      <Header total={entries.length} />
      <KpiStrip
        today={last24h.length}
        week={last7d.length}
        copilot={copilotCount}
        actors={activeActors}
      />

      {entries.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <DayBlock
              key={day.key}
              label={day.label}
              entries={day.entries}
              trainingMap={trainingMap}
              userMap={userMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────── Header ───────────────

function Header({ total }: { total: number }) {
  return (
    <header className="space-y-2">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
          Activities
        </h1>
        {total > 0 ? (
          <span className="text-[12px] font-mono text-ink-3 mt-2">
            ({total > 200 ? "200+" : total})
          </span>
        ) : null}
      </div>
      <p className="text-ink-2 text-[13.5px] max-w-[680px] leading-[1.5]">
        Audit log of every meaningful action — humans and Copilot. Today
        we record training publishes, Copilot-driven assignments, and
        super-admin impersonation. New write-paths get logged via{" "}
        <code className="font-mono text-[12.5px] text-ink">lib/audit</code>.
      </p>
    </header>
  );
}

// ─────────────── KPI strip ───────────────

function KpiStrip({
  today,
  week,
  copilot,
  actors,
}: {
  today: number;
  week: number;
  copilot: number;
  actors: number;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-[14px]">
      <KpiTile
        label="Last 24h"
        value={String(today)}
        sub={
          today === 0
            ? "no activity today"
            : today === 1
              ? "1 event"
              : `${today} events`
        }
        icon="activity"
        tone="accent"
      />
      <KpiTile
        label="Last 7 days"
        value={String(week)}
        sub={
          week === 0
            ? "quiet week"
            : `${actors} actor${actors === 1 ? "" : "s"} contributed`
        }
        icon="history"
        tone="good"
      />
      <KpiTile
        label="Copilot actions"
        value={String(copilot)}
        sub={
          week === 0
            ? "—"
            : copilot === 0
              ? "all human-driven"
              : `${Math.round((copilot / week) * 100)}% of the week`
        }
        icon="ai-sparkle"
        tone="violet"
      />
      <KpiTile
        label="Active actors"
        value={String(actors)}
        sub={
          actors === 0
            ? "no-one logged in"
            : actors === 1
              ? "one admin · solo"
              : "across the tenant"
        }
        icon="users"
        tone="warn"
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

// ─────────────── Day block ───────────────

function DayBlock({
  label,
  entries,
  trainingMap,
  userMap,
}: {
  label: string;
  entries: Entry[];
  trainingMap: Map<string, string>;
  userMap: Map<string, string>;
}) {
  return (
    <section>
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3 mb-2 px-1">
        {label}
      </div>
      <div className="bg-surface border border-border rounded-[12px] overflow-hidden">
        {entries.map((e, i) => (
          <ActivityRow
            key={e.id}
            entry={e}
            first={i === 0}
            trainingMap={trainingMap}
            userMap={userMap}
          />
        ))}
      </div>
    </section>
  );
}

// ─────────────── Row ───────────────

function ActivityRow({
  entry,
  first,
  trainingMap,
  userMap,
}: {
  entry: Entry;
  first: boolean;
  trainingMap: Map<string, string>;
  userMap: Map<string, string>;
}) {
  const meta = ACTION_META[entry.action];
  const tone: Tone = meta?.tone ?? "ink";
  const category = meta?.category ?? "System";
  const copilot = isCopilot(entry);

  const actorName = entry.actor
    ? (entry.actor.name ?? entry.actor.email.split("@")[0])
    : "System";
  const verbPhrase = phraseFor(entry, trainingMap, userMap);
  const time = formatTime(entry.createdAt);

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-[18px] py-3 hover:bg-surface-2",
        !first && "border-t border-border",
      )}
    >
      <span className="font-mono text-[11px] text-ink-3 w-[54px] shrink-0">
        {time}
      </span>
      <ActorAvatar
        copilot={copilot}
        name={actorName}
        tone={tone}
      />
      <div className="flex-1 min-w-0 text-[13px] leading-[1.5]">
        <span className="font-semibold text-ink">{actorName}</span>
        {copilot ? (
          <span className="text-ink-3"> · via Copilot</span>
        ) : null}{" "}
        <span className="text-ink-2">{verbPhrase}</span>
      </div>
      <CategoryTag label={category} tone={tone} copilot={copilot} />
    </div>
  );
}

function ActorAvatar({
  copilot,
  name,
  tone,
}: {
  copilot: boolean;
  name: string;
  tone: Tone;
}) {
  if (copilot) {
    return (
      <div
        className="w-7 h-7 rounded-full grid place-items-center text-white shrink-0"
        style={{
          background: "linear-gradient(135deg, #7c3aed 0%, #b94e8d 100%)",
          boxShadow: "0 2px 6px rgba(124,58,237,0.25)",
        }}
        aria-hidden
      >
        <Icon name="ai-sparkle" size={11} />
      </div>
    );
  }
  const initials = name
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const bg =
    tone === "warn"
      ? "bg-warn-pale text-warn"
      : tone === "good"
        ? "bg-good-pale text-good"
        : "bg-surface-2 text-ink";
  return (
    <div
      className={cn(
        "w-7 h-7 rounded-full grid place-items-center text-[10.5px] font-bold shrink-0",
        bg,
      )}
      aria-hidden
    >
      {initials || "?"}
    </div>
  );
}

function CategoryTag({
  label,
  tone,
  copilot,
}: {
  label: string;
  tone: Tone;
  copilot: boolean;
}) {
  if (copilot) {
    return (
      <span
        className="text-[10.5px] font-bold uppercase tracking-[0.08em] px-2 py-1 rounded-[6px] text-[#6d4ad9] shrink-0"
        style={{ background: "#ede9fe" }}
      >
        Copilot
      </span>
    );
  }
  const palette =
    tone === "good"
      ? "bg-good-pale text-good"
      : tone === "warn"
        ? "bg-warn-pale text-warn"
        : "bg-surface-2 text-ink-2";
  return (
    <span
      className={cn(
        "text-[10.5px] font-bold uppercase tracking-[0.08em] px-2 py-1 rounded-[6px] shrink-0",
        palette,
      )}
    >
      {label}
    </span>
  );
}

// ─────────────── Empty ───────────────

function EmptyState() {
  return (
    <div className="bg-surface border border-border rounded-[12px] p-10 text-center">
      <div className="w-12 h-12 rounded-[10px] bg-surface-2 text-ink-3 grid place-items-center mx-auto">
        <Icon name="activity" size={18} />
      </div>
      <h3 className="font-display text-[18px] mt-3 text-ink">
        Nothing logged yet
      </h3>
      <p className="text-[13px] text-ink-2 mt-1 max-w-[420px] mx-auto leading-[1.55]">
        Activity is recorded when admins publish a training, the Copilot
        assigns work, or a super-admin impersonates.
      </p>
    </div>
  );
}

// ─────────────── Helpers ───────────────

function isCopilot(e: Entry): boolean {
  if (e.action === "assignment.bulk_upsert") return true;
  const md = e.metadata;
  if (md && typeof md === "object" && md !== null && "via" in md) {
    const via = (md as Record<string, unknown>).via;
    if (typeof via === "string" && via.includes("copilot")) return true;
  }
  return false;
}

function phraseFor(
  entry: Entry,
  trainingMap: Map<string, string>,
  userMap: Map<string, string>,
): string {
  const md =
    entry.metadata && typeof entry.metadata === "object" && entry.metadata
      ? (entry.metadata as Record<string, unknown>)
      : {};
  const [kind, id] = entry.target ? entry.target.split(":") : [null, null];
  const trainingTitle = kind === "training" && id ? trainingMap.get(id) : null;
  const userName = kind === "user" && id ? userMap.get(id) : null;

  switch (entry.action) {
    case "training.publish":
      return trainingTitle
        ? `published "${trainingTitle}"`
        : "published a training";
    case "assignment.bulk_upsert": {
      const count =
        typeof md.learner_count === "number" ? md.learner_count : null;
      const created =
        typeof md.created === "number" ? md.created : null;
      const updated =
        typeof md.updated === "number" ? md.updated : null;
      const base = trainingTitle
        ? `assigned "${trainingTitle}"`
        : "assigned a training";
      if (count != null) {
        const detail =
          created != null && updated != null && updated > 0
            ? ` to ${count} learner${count === 1 ? "" : "s"} (${created} new, ${updated} updated)`
            : ` to ${count} learner${count === 1 ? "" : "s"}`;
        return base + detail;
      }
      return base;
    }
    case "impersonation.start": {
      const role =
        typeof md.as_role === "string" ? md.as_role : null;
      const who = userName ?? "a tenant user";
      return role
        ? `started impersonating ${who} (as ${role})`
        : `started impersonating ${who}`;
    }
    case "impersonation.stop":
      return "stopped impersonation";
    default:
      return entry.action;
  }
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function groupByDay(
  entries: Entry[],
): Array<{ key: string; label: string; entries: Entry[] }> {
  const buckets = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = e.createdAt.toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const list = buckets.get(key) ?? [];
    list.push(e);
    buckets.set(key, list);
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  return [...buckets.entries()].map(([key, list]) => {
    const sample = list[0].createdAt;
    const sampleDay = new Date(sample);
    sampleDay.setHours(0, 0, 0, 0);
    let label: string;
    if (sampleDay.getTime() === today.getTime()) {
      label = `Today · ${sample.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      })}`;
    } else if (sampleDay.getTime() === yesterday.getTime()) {
      label = `Yesterday · ${sample.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      })}`;
    } else {
      label = sample.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        year:
          sample.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
      });
    }
    return { key, label, entries: list };
  });
}
