// Admin · Feedbacks  (01_ADMIN.md §Feedbacks)
//
// Every feedback row for this tenant. Two kinds today: `ai` summaries
// generated when a roleplay session is scored, and `human` notes a
// future phase will write. Rows carry a category tag (Roleplay / Quiz /
// Pronunciation / Platform / Content / Other) so the inbox is scannable.
// Star ratings and AI-clustered themes from the design source still
// aren't modeled — we don't fabricate them.

import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type Tab = "all" | "ai" | "human" | "negative";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "all", label: "All" },
  { key: "ai", label: "AI summaries" },
  { key: "human", label: "Human notes" },
  { key: "negative", label: "Needs work" },
];

type Category =
  | "roleplay"
  | "quiz"
  | "pronunciation"
  | "platform"
  | "content"
  | "other";

type Row = {
  id: string;
  kind: "ai" | "human";
  sentiment: "positive" | "neutral" | "negative" | null;
  category: Category;
  body: string;
  source: string | null;
  createdAt: Date;
  recipient: { email: string; name: string | null };
  training: { id: string; title: string } | null;
  session: {
    id: string;
    score: number | null;
    module: { id: string; training: { id: string } } | null;
  } | null;
};

export default async function FeedbacksPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "all") as Tab;

  const user = (await getSessionUser())!;
  if (!user.companyId) return null;

  const all: Row[] = await prisma.feedback.findMany({
    where: { recipient: { companyId: user.companyId } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      recipient: { select: { email: true, name: true } },
      training: { select: { id: true, title: true } },
      session: {
        select: {
          id: true,
          score: true,
          module: { select: { id: true, training: { select: { id: true } } } },
        },
      },
    },
  });

  const counts = {
    all: all.length,
    ai: all.filter((f) => f.kind === "ai").length,
    human: all.filter((f) => f.kind === "human").length,
    negative: all.filter((f) => f.sentiment === "negative").length,
  };

  const filtered = all.filter((f) => {
    if (tab === "all") return true;
    if (tab === "ai") return f.kind === "ai";
    if (tab === "human") return f.kind === "human";
    return f.sentiment === "negative";
  });

  // KPI roll-ups
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const last7d = all.filter((f) => now - f.createdAt.getTime() < weekMs);
  const sessionScores = all
    .map((f) => f.session?.score)
    .filter((s): s is number => typeof s === "number");
  const avgScore =
    sessionScores.length > 0
      ? Math.round(
          sessionScores.reduce((a, b) => a + b, 0) / sessionScores.length,
        )
      : null;

  const latestNegative = all.find((f) => f.sentiment === "negative") ?? null;

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1280px] space-y-5">
      <Header total={all.length} />
      <KpiStrip
        week={last7d.length}
        ai={counts.ai}
        human={counts.human}
        negative={counts.negative}
        avgScore={avgScore}
      />

      {latestNegative ? (
        <AttentionBanner
          recipient={
            latestNegative.recipient.name ??
            latestNegative.recipient.email.split("@")[0]
          }
          trainingTitle={latestNegative.training?.title ?? null}
          body={latestNegative.body}
          negativeCount={counts.negative}
        />
      ) : null}

      <PillTabs current={tab} counts={counts} />

      {filtered.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="space-y-3">
          {filtered.map((f) => (
            <FeedbackCard key={f.id} row={f} />
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
          Feedbacks
        </h1>
        {total > 0 ? (
          <span className="text-[12px] font-mono text-ink-3 mt-2">
            ({total > 200 ? "200+" : total})
          </span>
        ) : null}
      </div>
      <p className="text-ink-2 text-[13.5px] max-w-[680px] leading-[1.5]">
        What learners are getting back. AI summaries land here when a
        roleplay session is scored; human-authored notes will follow in a
        later phase.
      </p>
    </header>
  );
}

// ─────────────── KPI strip ───────────────

function KpiStrip({
  week,
  ai,
  human,
  negative,
  avgScore,
}: {
  week: number;
  ai: number;
  human: number;
  negative: number;
  avgScore: number | null;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-[14px]">
      <KpiTile
        label="Last 7 days"
        value={String(week)}
        sub={
          week === 0
            ? "no feedback this week"
            : `${week} note${week === 1 ? "" : "s"} delivered`
        }
        icon="message"
        tone="accent"
      />
      <KpiTile
        label="Linked avg score"
        value={avgScore != null ? `${avgScore}` : "—"}
        sub={
          avgScore == null
            ? "no scored sessions yet"
            : avgScore >= 75
              ? "healthy band"
              : avgScore >= 60
                ? "room to grow"
                : "below target"
        }
        icon="chart"
        tone={
          avgScore == null || avgScore >= 75
            ? "good"
            : avgScore >= 60
              ? "warn"
              : "warn"
        }
      />
      <KpiTile
        label="AI vs human"
        value={`${ai} / ${human}`}
        sub={
          ai + human === 0
            ? "nothing yet"
            : human === 0
              ? "all AI-generated"
              : `${Math.round((ai / (ai + human)) * 100)}% AI`
        }
        icon="ai-sparkle"
        tone="violet"
      />
      <KpiTile
        label="Needs work"
        value={String(negative)}
        sub={
          negative === 0
            ? "no negative feedback"
            : negative === 1
              ? "1 learner flagged"
              : `${negative} learners flagged`
        }
        icon="alert"
        tone={negative > 0 ? "warn" : "good"}
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

// ─────────────── Attention banner ───────────────

function AttentionBanner({
  recipient,
  trainingTitle,
  body,
  negativeCount,
}: {
  recipient: string;
  trainingTitle: string | null;
  body: string;
  negativeCount: number;
}) {
  const preview = body.length > 140 ? body.slice(0, 137) + "…" : body;
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
        style={{ background: "linear-gradient(135deg, #a855f7, #ec4899)" }}
      >
        <Icon name="ai-sparkle" size={14} />
      </div>
      <div className="min-w-0 space-y-1 flex-1">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#6d4ad9]">
          UPnRise AI · Most-recent flag
        </div>
        <p className="text-[13px] text-ink leading-[1.55]">
          <span className="font-semibold text-ink">{recipient}</span>
          {trainingTitle ? (
            <>
              {" "}
              on{" "}
              <span className="font-semibold text-ink">{trainingTitle}</span>
            </>
          ) : null}{" "}
          <span className="text-ink-2">— {preview}</span>
        </p>
        {negativeCount > 1 ? (
          <Link
            href="/admin/feedbacks?tab=negative"
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:text-accent-strong"
          >
            See all {negativeCount} flagged
            <Icon name="chevron-right" size={11} />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────── Pill tabs ───────────────

function PillTabs({
  current,
  counts,
}: {
  current: Tab;
  counts: Record<Tab, number>;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {TABS.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.key === "all" ? "/admin/feedbacks" : `/admin/feedbacks?tab=${t.key}`}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-[6px] rounded-full text-[12.5px] font-semibold transition-colors",
              active
                ? "bg-ink text-white"
                : "bg-surface border border-border text-ink-2 hover:text-ink hover:border-border-strong",
            )}
          >
            {t.label}
            <span
              className={cn(
                "text-[10.5px] font-mono px-1.5 py-[1px] rounded-full",
                active
                  ? "bg-white/15 text-white/80"
                  : t.key === "negative" && counts.negative > 0
                    ? "bg-bad-pale text-bad"
                    : "bg-surface-2 text-ink-3",
              )}
            >
              {counts[t.key]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

// ─────────────── Feedback card ───────────────

function FeedbackCard({ row }: { row: Row }) {
  const name = row.recipient.name ?? row.recipient.email.split("@")[0];
  const initials = name
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const score = row.session?.score ?? null;
  const scoreTone =
    score == null
      ? "text-ink-3"
      : score >= 75
        ? "text-good"
        : score >= 60
          ? "text-warn"
          : "text-bad";

  return (
    <article className="bg-surface border border-border rounded-[12px] p-5 flex items-start gap-4">
      {/* Score column */}
      <div className="shrink-0 w-[64px] text-center">
        {score != null ? (
          <>
            <div
              className={cn(
                "font-display text-[28px] leading-none -tracking-[0.01em]",
                scoreTone,
              )}
            >
              {score}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3 mt-1">
              Score
            </div>
          </>
        ) : (
          <div className="font-mono text-[11px] text-ink-3 pt-3">—</div>
        )}
      </div>

      {/* Body column */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Avatar initials={initials} />
          <span className="font-semibold text-[13.5px] text-ink">
            {name}
          </span>
          {row.training ? (
            <>
              <span className="text-ink-3">·</span>
              <Link
                href={`/admin/trainings/${row.training.id}/edit`}
                className="text-[12.5px] text-accent hover:text-accent-strong hover:underline truncate"
              >
                {row.training.title}
              </Link>
            </>
          ) : null}
          <span className="text-[11px] font-mono text-ink-3 ml-auto shrink-0">
            {fmtRelative(row.createdAt)}
          </span>
        </div>

        <p className="text-[13px] text-ink leading-[1.6] whitespace-pre-wrap">
          {row.body}
        </p>

        <div className="flex items-center gap-2 flex-wrap pt-1">
          <KindChip kind={row.kind} />
          <CategoryChip category={row.category} />
          {row.sentiment ? <SentimentPill sentiment={row.sentiment} /> : null}
          {row.source ? (
            <span className="text-[10.5px] font-mono text-ink-3">
              {row.source}
            </span>
          ) : null}
          {row.session ? (
            <Link
              href={`/learn/trainings/${row.session.module?.training.id}/modules/${row.session.module?.id}/results/${row.session.id}`}
              className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent hover:text-accent-strong"
            >
              Open session
              <Icon name="chevron-right" size={11} />
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <div className="w-7 h-7 rounded-full grid place-items-center text-[10.5px] font-bold bg-surface-2 text-ink shrink-0">
      {initials || "?"}
    </div>
  );
}

function CategoryChip({ category }: { category: Category }) {
  const label = {
    roleplay: "Roleplay",
    quiz: "Quiz",
    pronunciation: "Pronunciation",
    platform: "Platform",
    content: "Content",
    other: "Other",
  }[category];
  // Each category gets its own tone-tinted background so the inbox is
  // scannable at a glance.
  const cls = {
    roleplay: "bg-accent-pale text-accent-strong",
    quiz: "bg-[#fef0e7] text-[#c2410c]",
    pronunciation: "bg-[#ede9fe] text-[#6d4ad9]",
    platform: "bg-surface-2 text-ink-2",
    content: "bg-good-pale text-good",
    other: "bg-surface-2 text-ink-3",
  }[category];
  return (
    <span
      className={cn(
        "inline-flex items-center text-[10.5px] font-bold uppercase tracking-[0.08em] px-2 py-1 rounded-[6px]",
        cls,
      )}
    >
      {label}
    </span>
  );
}

function KindChip({ kind }: { kind: "ai" | "human" }) {
  if (kind === "ai") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.08em] px-2 py-1 rounded-[6px] text-[#6d4ad9]"
        style={{ background: "#ede9fe" }}
      >
        <Icon name="ai-sparkle" size={10} />
        AI
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.08em] px-2 py-1 rounded-[6px] bg-surface-2 text-ink-2">
      <Icon name="users" size={10} />
      Human
    </span>
  );
}

function SentimentPill({
  sentiment,
}: {
  sentiment: "positive" | "neutral" | "negative";
}) {
  const palette = {
    positive: { label: "Positive", cls: "bg-good-pale text-good", dot: "bg-good" },
    neutral: { label: "Neutral", cls: "bg-surface-2 text-ink-2", dot: "bg-ink-3" },
    negative: { label: "Needs work", cls: "bg-bad-pale text-bad", dot: "bg-bad" },
  } as const;
  const m = palette[sentiment];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] px-2 py-1 rounded-[6px]",
        m.cls,
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

// ─────────────── Empty state ───────────────

function EmptyState({ tab }: { tab: Tab }) {
  const copy =
    tab === "all"
      ? "No feedback yet. AI coaching summaries are written automatically after each scored roleplay session."
      : tab === "ai"
        ? "No AI summaries yet — they're generated when learners complete a scored roleplay."
        : tab === "human"
          ? "No human notes yet. Manager-written feedback lands here once that flow ships."
          : "Nothing flagged as Needs work. Keep an eye on the strip above.";
  return (
    <div className="bg-surface border border-border rounded-[12px] p-10 text-center">
      <div className="w-12 h-12 rounded-[10px] bg-surface-2 text-ink-3 grid place-items-center mx-auto">
        <Icon name="message" size={18} />
      </div>
      <h3 className="font-display text-[18px] mt-3 text-ink">
        Nothing here yet
      </h3>
      <p className="text-[13px] text-ink-2 mt-1 max-w-[420px] mx-auto leading-[1.55]">
        {copy}
      </p>
    </div>
  );
}

// ─────────────── Helpers ───────────────

function fmtRelative(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
