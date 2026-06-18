// Tier-1 conversation analytics card on the Roleplay Results page.
//
// Pure presentation — every number comes pre-computed from
// computeConversationStats(). Renders as a responsive grid of small
// metric tiles with a one-line "what this means" caption underneath
// each value, so trainees don't need to guess whether 47% talk-time
// is good (it is, for sales).
//
// Server component — no interactivity.

import { Icon, type IconName } from "@/components/ui/Icon";
import type { ConversationStats } from "@/lib/roleplay/conversation-stats";

type Tone = "good" | "warn" | "neutral";

type Tile = {
  icon: IconName;
  label: string;
  value: string;
  caption: string;
  tone: Tone;
};

function classifyTalkTime(pct: number): Tone {
  // Sales-ish ideal is 40–60% learner talk time. Outside that range the
  // conversation is either dominated by the trainee or under-engaged.
  if (pct >= 40 && pct <= 60) return "good";
  if (pct >= 25 && pct <= 75) return "warn";
  return "neutral";
}

function classifyResponseSec(sec: number | null): Tone {
  if (sec == null) return "neutral";
  if (sec <= 8) return "good";
  if (sec <= 20) return "warn";
  return "neutral";
}

function classifyFillerRatio(fillers: number, words: number): Tone {
  if (words === 0) return "neutral";
  const per100 = (fillers / words) * 100;
  if (per100 <= 1.5) return "good";
  if (per100 <= 4) return "warn";
  return "neutral";
}

function classifyEmpathy(count: number): Tone {
  if (count >= 3) return "good";
  if (count >= 1) return "warn";
  return "neutral";
}

function classifyRichness(pct: number): Tone {
  if (pct >= 55) return "good";
  if (pct >= 35) return "warn";
  return "neutral";
}

function fmtSec(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

export function ConversationStatsCard({
  stats,
}: {
  stats: ConversationStats;
}) {
  if (stats.learnerTurns === 0) {
    return (
      <p className="text-[12px] text-ink-3 italic">
        The trainee didn&apos;t take any turns in this session — no
        conversation stats to show.
      </p>
    );
  }

  const tiles: Tile[] = [
    {
      icon: "mic",
      label: "Talk time",
      value: `${stats.talkTimePct}%`,
      caption: "of total words spoken",
      tone: classifyTalkTime(stats.talkTimePct),
    },
    {
      icon: "history",
      label: "Avg response",
      value: fmtSec(stats.avgResponseSec),
      caption: "to reply after the persona",
      tone: classifyResponseSec(stats.avgResponseSec),
    },
    {
      icon: "message",
      label: "Turns",
      value: String(stats.learnerTurns),
      caption: `${stats.avgLearnerTurnWords} words / turn`,
      tone: "neutral",
    },
    {
      icon: "clipboard",
      label: "Questions asked",
      value: String(stats.questionCount),
      caption: "discovery / clarifying",
      tone: stats.questionCount >= 2 ? "good" : "neutral",
    },
    {
      icon: "alert",
      label: "Filler words",
      value: String(stats.fillerWordCount),
      caption: "um · uh · like · basically",
      tone: classifyFillerRatio(stats.fillerWordCount, stats.learnerWordCount),
    },
    {
      icon: "users",
      label: "Empathy markers",
      value: String(stats.empathyMarkerCount),
      caption: "thank you · I understand · please",
      tone: classifyEmpathy(stats.empathyMarkerCount),
    },
    {
      icon: "book",
      label: "Vocabulary",
      value: `${stats.vocabularyRichnessPct}%`,
      caption: "unique vs total words",
      tone: classifyRichness(stats.vocabularyRichnessPct),
    },
    {
      icon: "chart",
      label: "Words spoken",
      value: String(stats.learnerWordCount),
      caption: "across the session",
      tone: "neutral",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
      {tiles.map((t) => (
        <StatTile key={t.label} tile={t} />
      ))}
    </div>
  );
}

function StatTile({ tile }: { tile: Tile }) {
  const toneStyles =
    tile.tone === "good"
      ? {
          ring: "border-good/25",
          bg: "bg-good-pale",
          text: "text-good",
        }
      : tile.tone === "warn"
        ? {
            ring: "border-warn/25",
            bg: "bg-warn-pale",
            text: "text-warn",
          }
        : {
            ring: "border-border",
            bg: "bg-surface-2",
            text: "text-ink",
          };

  return (
    <div
      className={`rounded-[var(--r-md)] border ${toneStyles.ring} bg-surface p-3.5 flex flex-col gap-1.5`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-3">
        <span
          aria-hidden
          className={`w-5 h-5 grid place-items-center rounded ${toneStyles.bg} ${toneStyles.text}`}
        >
          <Icon name={tile.icon} size={10} />
        </span>
        {tile.label}
      </div>
      <div
        className={`font-display text-[22px] leading-none tabular-nums ${toneStyles.text}`}
      >
        {tile.value}
      </div>
      <div className="text-[10.5px] text-ink-3 leading-snug">
        {tile.caption}
      </div>
    </div>
  );
}
