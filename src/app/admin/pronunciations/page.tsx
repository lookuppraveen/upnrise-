// Admin · AI Pronunciations  (01_ADMIN.md §AI Pronunciations)
//
// Per-tenant phonetic overrides + AI-suggested "say it like" hints for
// brand names, acronyms, and jargon the Coach reads aloud in voice mode.
// Pairs with /admin/dictionary — Dictionary terms surface here as
// "needs pronunciation" when there's no row keyed on the same word.

import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PronunciationEditor } from "@/components/admin/PronunciationEditor";
import { cn } from "@/lib/cn";

export default async function PronunciationsPage() {
  const user = (await getSessionUser())!;
  if (!user.companyId) return null;

  const [rows, dictTerms] = await Promise.all([
    prisma.pronunciation.findMany({
      where: { companyId: user.companyId },
      orderBy: { word: "asc" },
      select: {
        id: true,
        word: true,
        phonetic: true,
        mnemonic: true,
        notes: true,
        generatedByAi: true,
        updatedAt: true,
      },
    }),
    prisma.dictionaryTerm.findMany({
      where: { companyId: user.companyId },
      select: { term: true },
    }),
  ]);

  // KPI roll-ups
  const aiCount = rows.filter((r) => r.generatedByAi).length;
  const humanCount = rows.length - aiCount;
  const weekCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const updatedThisWeek = rows.filter(
    (r) => +new Date(r.updatedAt) >= weekCutoff,
  ).length;

  // Cross-tenant gap surfacing
  const pronWords = new Set(rows.map((r) => r.word.toLowerCase()));
  const unmappedTerms = dictTerms.filter(
    (t) => !pronWords.has(t.term.toLowerCase()),
  );

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1280px] space-y-5">
      <Header total={rows.length} />
      <KpiStrip
        total={rows.length}
        ai={aiCount}
        human={humanCount}
        thisWeek={updatedThisWeek}
      />
      {unmappedTerms.length > 0 ? (
        <UnmappedBanner
          count={unmappedTerms.length}
          sample={unmappedTerms.slice(0, 3).map((t) => t.term)}
        />
      ) : null}
      <PronunciationEditor initial={rows} />
    </div>
  );
}

// ─────────────── Header ───────────────

function Header({ total }: { total: number }) {
  return (
    <header className="space-y-2">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
          AI Pronunciations
        </h1>
        {total > 0 ? (
          <span className="text-[12px] font-mono text-ink-3 mt-2">
            ({total})
          </span>
        ) : null}
      </div>
      <p className="text-ink-2 text-[13.5px] max-w-[680px] leading-[1.5]">
        How your team says brand names, acronyms, and jargon. AI suggests a
        phonetic spelling and a memorable hint — you can edit anything. Pairs
        with{" "}
        <Link
          href="/admin/dictionary"
          className="text-accent underline"
        >
          Dictionary
        </Link>
        : every term there can be voice-grounded here.
      </p>
    </header>
  );
}

// ─────────────── KPI strip ───────────────

function KpiStrip({
  total,
  ai,
  human,
  thisWeek,
}: {
  total: number;
  ai: number;
  human: number;
  thisWeek: number;
}) {
  const aiPct = total > 0 ? Math.round((ai / total) * 100) : 0;
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-[14px]">
      <KpiTile
        label="Total entries"
        value={String(total)}
        sub={
          total === 0
            ? "voice Coach has no overrides"
            : total === 1
              ? "one override active"
              : "voice-grounded vocabulary"
        }
        icon="mic"
        tone="accent"
      />
      <KpiTile
        label="AI-generated"
        value={String(ai)}
        sub={
          total === 0
            ? "—"
            : ai === 0
              ? "all hand-written"
              : `${aiPct}% of entries`
        }
        icon="ai-sparkle"
        tone="violet"
      />
      <KpiTile
        label="Human-edited"
        value={String(human)}
        sub={
          total === 0
            ? "—"
            : human === 0
              ? "every entry AI-only"
              : "verified by admin"
        }
        icon="users"
        tone="good"
      />
      <KpiTile
        label="Updated this week"
        value={String(thisWeek)}
        sub={
          thisWeek === 0
            ? "no recent edits"
            : thisWeek === 1
              ? "one recent edit"
              : "fresh changes"
        }
        icon="activity"
        tone={thisWeek > 0 ? "good" : "warn"}
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

// ─────────────── Unmapped-dictionary banner ───────────────

function UnmappedBanner({
  count,
  sample,
}: {
  count: number;
  sample: string[];
}) {
  const preview =
    sample.length === count
      ? sample.join(", ")
      : `${sample.join(", ")} + ${count - sample.length} more`;
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
          UPnRise AI · Dictionary gap
        </div>
        <p className="text-[13px] text-ink leading-[1.55]">
          <span className="font-semibold">
            {count} term{count === 1 ? "" : "s"}
          </span>{" "}
          in your dictionary {count === 1 ? "has" : "have"} no pronunciation
          row yet — voice Coach will guess. Add one for{" "}
          <span className="font-semibold">{preview}</span> so it says them right.
        </p>
        <Link
          href="/admin/dictionary"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:text-accent-strong"
        >
          Review dictionary
          <Icon name="chevron-right" size={11} />
        </Link>
      </div>
    </div>
  );
}
