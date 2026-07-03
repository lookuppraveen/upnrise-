// Speech Delivery card on the Roleplay Results page.
//
// Pure presentation — every value comes pre-computed from
// computeSpeechDelivery(). Three tiles: pace (WPM), filler words,
// sentence length.

import { Icon, type IconName } from "@/components/ui/Icon";
import type { SpeechDeliveryStats } from "@/lib/roleplay/speech-delivery";

type Tone = "good" | "warn" | "neutral";

type Tile = {
  icon: IconName;
  label: string;
  value: string;
  caption: string;
  tone: Tone;
};

function paceTone(label: SpeechDeliveryStats["paceLabel"]): Tone {
  if (label === "comfortable") return "good";
  if (label === "fast" || label === "slow") return "warn";
  return "neutral";
}

function paceCaption(label: SpeechDeliveryStats["paceLabel"]): string {
  switch (label) {
    case "slow":
      return "under 110 wpm · sounds hesitant";
    case "comfortable":
      return "110–160 wpm · easy to follow";
    case "fast":
      return "160–190 wpm · edging into rushed";
    case "rushed":
      return "over 190 wpm · buyers can't keep up";
    default:
      return "session too short to measure";
  }
}

function fillerTone(ratioPer100: number, totalFillers: number): Tone {
  if (totalFillers === 0) return "good";
  if (ratioPer100 <= 1.5) return "good";
  if (ratioPer100 <= 4) return "warn";
  return "neutral";
}

function sentenceTone(avgWords: number): Tone {
  if (avgWords === 0) return "neutral";
  if (avgWords >= 8 && avgWords <= 20) return "good";
  if (avgWords >= 5 && avgWords <= 28) return "warn";
  return "neutral";
}

function sentenceCaption(avgWords: number): string {
  if (avgWords === 0) return "no complete sentences detected";
  if (avgWords < 5) return "very short — sounds clipped";
  if (avgWords <= 20) return "healthy range for spoken sales";
  if (avgWords <= 28) return "getting long — trim for clarity";
  return "too long — buyer will lose the thread";
}

export function SpeechDeliveryCard({ stats }: { stats: SpeechDeliveryStats }) {
  const tiles: Tile[] = [
    {
      icon: "mic",
      label: "Pace",
      value: stats.paceWpm == null ? "—" : `${stats.paceWpm} wpm`,
      caption: paceCaption(stats.paceLabel),
      tone: paceTone(stats.paceLabel),
    },
    {
      icon: "alert",
      label: "Filler words",
      value: String(stats.fillerWordCount),
      caption:
        stats.fillerWordCount === 0
          ? "clean delivery"
          : `${stats.fillerRatioPer100} per 100 words`,
      tone: fillerTone(stats.fillerRatioPer100, stats.fillerWordCount),
    },
    {
      icon: "message",
      label: "Sentence length",
      value:
        stats.avgSentenceWords === 0
          ? "—"
          : `${stats.avgSentenceWords} words`,
      caption: sentenceCaption(stats.avgSentenceWords),
      tone: sentenceTone(stats.avgSentenceWords),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
      {tiles.map((t) => (
        <StatTile key={t.label} tile={t} />
      ))}
    </div>
  );
}

function StatTile({ tile }: { tile: Tile }) {
  const toneStyles =
    tile.tone === "good"
      ? { ring: "border-good/25", bg: "bg-good-pale", text: "text-good" }
      : tile.tone === "warn"
        ? { ring: "border-warn/25", bg: "bg-warn-pale", text: "text-warn" }
        : { ring: "border-border", bg: "bg-surface-2", text: "text-ink" };

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
