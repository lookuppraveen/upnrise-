// Admin · Leaderboard  (01_ADMIN.md §Leaderboard)
//
// Pixel-perfect pass matches prototype.css §Leaderboard podium:
//   - .podium 3-column grid (2nd / 1st / 3rd visually, with 1st elevated
//     + ink-fill .podium-block.first treatment)
//   - .lb-list / .lb-row with circular avatars + display-font scores
//   - Optional KPI strip surfacing top scorer + most active + biggest gainer
//     when there's enough data
//
// Trainees ranked by avg score; ties go to more-sessions (preserved from
// existing query).

import { getSessionUser } from "@/lib/auth/session";
import { getLeaderboardForCompany } from "@/lib/db/queries";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type Row = Awaited<ReturnType<typeof getLeaderboardForCompany>>[number];

export default async function LeaderboardPage() {
  const user = (await getSessionUser())!;
  if (!user.companyId) return null;

  const rows = await getLeaderboardForCompany(user.companyId);
  // Now ranked by reward points (with avgScore as a tie-breaker). A user
  // is "in the ranking" if they have earned any points OR completed at
  // least one scored session.
  const ranked = rows.filter((r) => r.points > 0 || r.avgScore != null);

  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const unranked = rows.filter(
    (r) => r.points === 0 && r.avgScore == null,
  );

  const topEarner = top3[0];
  const mostActive =
    rows.length === 0
      ? null
      : [...rows].sort((a, b) => b.sessions - a.sessions)[0];
  const biggestWeek =
    rows.length === 0
      ? null
      : [...rows].sort((a, b) => b.last7d - a.last7d)[0];

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1100px] space-y-5">
      <header className="space-y-2">
        <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
          Leaderboard
        </h1>
        <p className="text-ink-2 text-[13.5px] max-w-[640px] leading-[1.5]">
          Top performers across your tenant. Ranked by reward points (config
          on{" "}
          <a href="/admin/rewards" className="text-accent underline">
            Rewards
          </a>
          ); avg roleplay score breaks ties.
        </p>
      </header>

      {rows.length === 0 ? (
        <Card pad="lg" className="rounded-[12px]">
          <p className="text-[13px] text-ink-2">
            No trainees in this tenant yet. Invite your team from{" "}
            <a href="/admin/employees" className="text-accent underline">
              Employees
            </a>
            .
          </p>
        </Card>
      ) : (
        <>
          {/* KPI strip — top scorer, most active, biggest week */}
          {ranked.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-[14px]">
              <Highlight
                label="Top earner"
                tone="accent"
                icon="trophy"
                row={topEarner}
                stat={
                  topEarner && topEarner.points > 0
                    ? `${topEarner.points.toLocaleString()} pts${topEarner.avgScore != null ? ` · ${topEarner.avgScore} avg` : ""}`
                    : topEarner?.avgScore != null
                      ? `${topEarner.avgScore} avg · no points yet`
                      : "—"
                }
              />
              <Highlight
                label="Most active"
                tone="good"
                icon="activity"
                row={mostActive}
                stat={
                  mostActive
                    ? `${mostActive.sessions} sessions`
                    : "—"
                }
              />
              <Highlight
                label="Biggest week"
                tone="violet"
                icon="chart"
                row={biggestWeek}
                stat={
                  biggestWeek && biggestWeek.last7d > 0
                    ? `+${biggestWeek.last7d} this week`
                    : "no activity"
                }
              />
            </div>
          ) : null}

          {/* Podium (only when we have ≥ 3 scored trainees) */}
          {top3.length >= 3 ? <Podium top3={top3} /> : null}

          {/* List of remaining ranked + unranked */}
          {top3.length < 3 ? (
            <FullList rows={ranked} unranked={unranked} startRank={1} />
          ) : (
            <FullList rows={rest} unranked={unranked} startRank={4} />
          )}
        </>
      )}
    </div>
  );
}

// ─────────────── Highlight tile ───────────────

function Highlight({
  label,
  tone,
  icon,
  row,
  stat,
}: {
  label: string;
  tone: "accent" | "good" | "violet";
  icon: "trophy" | "activity" | "chart";
  row: Row | null | undefined;
  stat: string;
}) {
  const corner =
    tone === "accent"
      ? "bg-accent-pale text-accent-strong"
      : tone === "good"
        ? "bg-good-pale text-good"
        : "bg-[#ede9fe] text-[#6d4ad9]";
  if (!row) {
    return (
      <div className="relative bg-surface border border-border rounded-[12px] px-[18px] py-4">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
          {label}
        </div>
        <div className="text-ink-3 text-[14px] mt-1">No data yet.</div>
      </div>
    );
  }
  return (
    <div className="relative bg-surface border border-border rounded-[12px] px-[18px] py-4">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {label}
      </div>
      <div className="flex items-center gap-3 mt-2">
        <Avatar name={row.name ?? row.email} size={36} />
        <div className="min-w-0">
          <div className="font-semibold text-[13.5px] text-ink truncate">
            {row.name ?? row.email.split("@")[0]}
          </div>
          <div className="text-[11.5px] text-ink-3 font-mono">{stat}</div>
        </div>
      </div>
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

// ─────────────── Podium ───────────────

function Podium({ top3 }: { top3: Row[] }) {
  // Visual order: 2nd · 1st · 3rd
  const second = top3[1];
  const first = top3[0];
  const third = top3[2];
  return (
    <section className="space-y-2 mt-2">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
        Podium
      </div>
      <div
        className="grid grid-cols-3 gap-4 items-end mx-auto"
        style={{ maxWidth: 540 }}
      >
        <PodiumColumn row={second} place={2} />
        <PodiumColumn row={first} place={1} />
        <PodiumColumn row={third} place={3} />
      </div>
    </section>
  );
}

function PodiumColumn({ row, place }: { row: Row; place: 1 | 2 | 3 }) {
  const isFirst = place === 1;
  // Heights tier so 1st is tallest visually.
  const padTop = isFirst ? 22 : place === 2 ? 14 : 10;
  const padBottom = isFirst ? 26 : place === 2 ? 18 : 14;
  return (
    <div className="flex flex-col items-center">
      <Avatar name={row.name ?? row.email} size={isFirst ? 56 : 44} />
      <div className="mt-2 text-[13px] text-ink-2 font-semibold truncate max-w-full text-center">
        {row.name ?? row.email.split("@")[0]}
      </div>
      <div
        className={cn(
          "w-full mt-3 rounded-t-[10px] border border-b-0 text-center",
          isFirst
            ? "bg-ink text-white border-ink"
            : "bg-surface text-ink border-border",
        )}
        style={{ paddingTop: padTop, paddingBottom: padBottom }}
      >
        <div
          className={cn(
            "font-display leading-none",
            isFirst ? "text-[40px]" : "text-[34px]",
          )}
        >
          {String(place).padStart(2, "0")}
        </div>
        <div
          className={cn(
            "font-mono text-[11px] mt-1",
            isFirst ? "text-white/70" : "text-ink-3",
          )}
        >
          {row.points > 0
            ? `${row.points.toLocaleString()} pts`
            : row.avgScore != null
              ? `${row.avgScore} avg`
              : "—"}
        </div>
      </div>
    </div>
  );
}

// ─────────────── List ───────────────

function FullList({
  rows,
  unranked,
  startRank,
}: {
  rows: Row[];
  unranked: Row[];
  startRank: number;
}) {
  if (rows.length === 0 && unranked.length === 0) return null;
  return (
    <section className="space-y-2">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
        Rankings
      </div>
      <div className="bg-surface border border-border rounded-[12px] overflow-hidden">
        {rows.map((r, i) => (
          <LbRow key={r.id} row={r} rank={startRank + i} />
        ))}
        {rows.length > 0 && unranked.length > 0 ? (
          <div className="px-[18px] py-2 bg-surface-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3 border-t border-border">
            Not yet ranked
          </div>
        ) : null}
        {unranked.map((r) => (
          <LbRow key={r.id} row={r} rank={null} />
        ))}
      </div>
    </section>
  );
}

function LbRow({ row, rank }: { row: Row; rank: number | null }) {
  return (
    <div className="flex items-center gap-[14px] px-[18px] py-3 border-b border-border last:border-b-0">
      <span className="w-6 text-ink-3 font-semibold text-[13px] font-mono">
        {rank != null ? rank : "—"}
      </span>
      <Avatar name={row.name ?? row.email} size={32} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-ink text-[13.5px] truncate">
          {row.name ?? row.email.split("@")[0]}
        </div>
        <div className="text-[11px] text-ink-3 font-mono truncate">
          {row.email}
        </div>
      </div>
      <span className="text-[11.5px] text-ink-3 font-mono shrink-0 hidden md:inline">
        {row.sessions} {row.sessions === 1 ? "session" : "sessions"}
      </span>
      <span
        className={cn(
          "text-[11.5px] font-mono shrink-0 hidden md:inline",
          row.last7d > 0 ? "text-good" : "text-ink-3",
        )}
      >
        {row.last7d > 0 ? `+${row.last7d}` : "0"} / 7d
      </span>
      <div className="text-right shrink-0 w-[78px]">
        <div className="font-display text-[20px] leading-none -tracking-[0.01em] text-ink">
          {row.points > 0 ? row.points.toLocaleString() : "—"}
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3 mt-0.5">
          {row.avgScore != null ? `${row.avgScore} avg` : "pts"}
        </div>
      </div>
    </div>
  );
}

// ─────────────── Avatar ───────────────
// Deterministic gradient circle (same primitive as Companies / Employees /
// FeedPostRow). Initial inside.

function Avatar({ name, size }: { name: string; size: number }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  return (
    <div
      className="rounded-full grid place-items-center text-white font-semibold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size <= 32 ? 12 : size <= 44 ? 14 : 18,
        background: avatarGradient(name),
      }}
    >
      {initial}
    </div>
  );
}

const AVATAR_PALETTES = [
  ["#e85d3a", "#c64a2b"],
  ["#7c5cd6", "#5b2eea"],
  ["#2a7d4f", "#1a5a36"],
  ["#2f80f5", "#1b56c2"],
  ["#c97a1b", "#a45c0b"],
  ["#b94e8d", "#7c2e5e"],
];

function avatarGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const [from, to] = AVATAR_PALETTES[Math.abs(h) % AVATAR_PALETTES.length];
  return `linear-gradient(135deg, ${from}, ${to})`;
}
