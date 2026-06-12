// Trainee · Dictionary
//
// Read-only glossary view of the tenant's house vocabulary. The Coach
// uses these same terms to ground its replies; trainees see them here so
// they have one place to look up a term they hit in a module. Editing
// lives on /admin/dictionary.

import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export default async function TraineeDictionaryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const user = (await getSessionUser())!;
  if (!user.companyId) return null;

  const [terms, pronunciations] = await Promise.all([
    prisma.dictionaryTerm.findMany({
      where: { companyId: user.companyId },
      orderBy: { term: "asc" },
      select: { id: true, term: true, definition: true },
    }),
    prisma.pronunciation.findMany({
      where: { companyId: user.companyId },
      select: { word: true, phonetic: true, mnemonic: true },
    }),
  ]);

  const phoneticByWord = new Map(
    pronunciations.map((p) => [p.word.toLowerCase(), p]),
  );

  const filtered = q
    ? terms.filter(
        (t) =>
          t.term.toLowerCase().includes(q.toLowerCase()) ||
          t.definition.toLowerCase().includes(q.toLowerCase()),
      )
    : terms;

  // Group by first letter for the A-Z stepped list.
  const groups = new Map<string, typeof filtered>();
  for (const t of filtered) {
    const letter = (t.term[0] ?? "?").toUpperCase();
    const arr = groups.get(letter) ?? [];
    arr.push(t);
    groups.set(letter, arr);
  }
  const letters = [...groups.keys()].sort();

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1100px] space-y-5">
      <Header total={terms.length} q={q} />
      <KpiStrip
        total={terms.length}
        withPronunciation={
          terms.filter((t) => phoneticByWord.has(t.term.toLowerCase())).length
        }
        pronunciationCount={pronunciations.length}
      />
      <SearchForm q={q} />

      {filtered.length === 0 ? (
        <EmptyState q={q} hasAny={terms.length > 0} />
      ) : (
        <div className="space-y-6">
          {letters.map((letter) => (
            <section key={letter} className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
                {letter}
              </div>
              <div className="space-y-2">
                {(groups.get(letter) ?? []).map((t) => (
                  <TermCard
                    key={t.id}
                    term={t.term}
                    definition={t.definition}
                    phonetic={phoneticByWord.get(t.term.toLowerCase()) ?? null}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────── Header ───────────────

function Header({ total, q }: { total: number; q: string }) {
  return (
    <header className="space-y-2">
      <h1 className="font-display text-[36px] leading-[1.05] -tracking-[0.015em] text-accent">
        Dictionary
      </h1>
      <p className="text-ink-2 text-[13.5px] max-w-[640px] leading-[1.5]">
        The vocabulary your tenant uses, grounded into every Coach reply.
        Look up any term you hit in a module here.
        {q ? (
          <>
            {" "}
            Filtered by{" "}
            <code className="font-mono text-ink">&quot;{q}&quot;</code>.
          </>
        ) : (
          ` ${total} term${total === 1 ? "" : "s"} total.`
        )}
      </p>
    </header>
  );
}

// ─────────────── KPI ───────────────

function KpiStrip({
  total,
  withPronunciation,
  pronunciationCount,
}: {
  total: number;
  withPronunciation: number;
  pronunciationCount: number;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-[14px]">
      <KpiTile
        label="Terms"
        value={String(total)}
        sub={total === 0 ? "nothing yet" : "in your glossary"}
        icon="book"
        tone="accent"
      />
      <KpiTile
        label="With pronunciation"
        value={`${withPronunciation} / ${Math.max(total, 1)}`}
        sub={
          total === 0
            ? "—"
            : withPronunciation === total
              ? "all voice-grounded"
              : `${total - withPronunciation} unmapped`
        }
        icon="mic"
        tone="violet"
      />
      <KpiTile
        label="Voice overrides"
        value={String(pronunciationCount)}
        sub="say-it-like cues for Coach"
        icon="message"
        tone="good"
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
  tone: "accent" | "good" | "violet";
}) {
  const corner =
    tone === "accent"
      ? "bg-accent-pale text-accent-strong"
      : tone === "good"
        ? "bg-good-pale text-good"
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

// ─────────────── Search ───────────────

function SearchForm({ q }: { q: string }) {
  return (
    <form
      action="/learn/dictionary"
      className="relative max-w-[420px]"
    >
      <Icon
        name="search"
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none"
      />
      <input
        name="q"
        defaultValue={q}
        placeholder="Search term or definition"
        className="w-full bg-surface-2 border border-border rounded-full pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:border-accent focus:bg-surface"
        suppressHydrationWarning
      />
    </form>
  );
}

// ─────────────── Term card ───────────────

function TermCard({
  term,
  definition,
  phonetic,
}: {
  term: string;
  definition: string;
  phonetic: { word: string; phonetic: string; mnemonic: string | null } | null;
}) {
  const initial = (term[0] ?? "?").toUpperCase();
  return (
    <article className="bg-surface border border-border rounded-[12px] p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-[8px] bg-accent-pale text-accent-strong grid place-items-center font-display text-[16px] font-semibold shrink-0">
        {initial}
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display text-[18px] -tracking-[0.005em] text-ink">
            {term}
          </span>
          {phonetic ? (
            <span
              className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.08em] px-2 py-0.5 rounded-[5px] text-[#6d4ad9]"
              style={{ background: "#ede9fe" }}
              title={phonetic.mnemonic ?? undefined}
            >
              <Icon name="mic" size={9} />
              {phonetic.phonetic}
            </span>
          ) : null}
        </div>
        <p className="text-[13px] text-ink-2 leading-[1.55]">{definition}</p>
        {phonetic?.mnemonic ? (
          <p className="text-[11.5px] text-ink-3 leading-[1.4]">
            Say it like: {phonetic.mnemonic}
          </p>
        ) : null}
      </div>
    </article>
  );
}

// ─────────────── Empty ───────────────

function EmptyState({ q, hasAny }: { q: string; hasAny: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-[12px] p-10 text-center">
      <div className="w-12 h-12 rounded-[10px] bg-surface-2 text-ink-3 grid place-items-center mx-auto">
        <Icon name="book" size={18} />
      </div>
      <h3 className="font-display text-[18px] mt-3 text-ink">
        {q ? "No terms match" : "Glossary is empty"}
      </h3>
      <p className="text-[13px] text-ink-2 mt-1 max-w-[420px] mx-auto leading-[1.55]">
        {q
          ? `Nothing matches "${q}". `
          : "Once your admin adds terms here, they'll show up. "}
        {q ? (
          <Link href="/learn/dictionary" className="text-accent underline">
            Clear search
          </Link>
        ) : (
          <Link href="/learn/dashboard" className="text-accent underline">
            Back to dashboard
          </Link>
        )}
        {hasAny ? null : "."}
      </p>
    </div>
  );
}
