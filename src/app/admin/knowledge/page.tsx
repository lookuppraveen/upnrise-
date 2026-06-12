// Admin · Knowledge Base
//
// Tenant-scoped library of source material that grounds AI-drafted
// content. Three ingest paths: paste text, fetch URL, upload .txt/.md.
// PDF parsing is deferred. Sources are picked from this list inside
// /admin/generate to feed Claude as system context — no embeddings yet.

import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { Icon, type IconName } from "@/components/ui/Icon";
import { KnowledgeIngest } from "@/components/admin/KnowledgeIngest";
import { DeleteKbButton } from "@/components/admin/DeleteKbButton";
import { cn } from "@/lib/cn";

export default async function AdminKnowledgePage() {
  const user = (await getSessionUser())!;
  if (!user.companyId) return null;

  const sources = await prisma.kbSource.findMany({
    where: { companyId: user.companyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      kind: true,
      name: true,
      size: true,
      status: true,
      sourceUrl: true,
      content: true,
      createdAt: true,
    },
  });

  const totalChars = sources.reduce((a, s) => a + (s.size ?? 0), 0);

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1100px] space-y-5">
      <header className="space-y-2">
        <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
          Knowledge Base
        </h1>
        <p className="text-ink-2 text-[13.5px] max-w-[640px] leading-[1.5]">
          Source material the AI uses when drafting trainings. Paste text,
          fetch a URL, or upload a .txt/.md file. Selected sources at
          generation time become grounding context for Claude.
        </p>
      </header>

      <KpiStrip
        total={sources.length}
        chars={totalChars}
        urls={sources.filter((s) => s.kind === "url").length}
        files={sources.filter((s) => s.kind === "doc").length}
      />

      <KnowledgeIngest />

      <section className="space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
          Library ({sources.length})
        </div>
        {sources.length === 0 ? (
          <div className="bg-surface border border-border rounded-[12px] p-10 text-center">
            <div className="w-12 h-12 rounded-[10px] bg-surface-2 text-ink-3 grid place-items-center mx-auto">
              <Icon name="layers" size={18} />
            </div>
            <h3 className="font-display text-[18px] mt-3 text-ink">
              No sources yet
            </h3>
            <p className="text-[13px] text-ink-2 mt-1 max-w-[420px] mx-auto leading-[1.55]">
              Add your first source above. Trainings drafted with
              Generate-with-AI will be grounded in whatever you select.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {sources.map((s) => (
              <SourceRow
                key={s.id}
                id={s.id}
                kind={s.kind}
                name={s.name}
                size={s.size}
                status={s.status}
                sourceUrl={s.sourceUrl}
                preview={(s.content ?? "").slice(0, 240)}
                createdAt={s.createdAt}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─────────────── KPI ───────────────

function KpiStrip({
  total,
  chars,
  urls,
  files,
}: {
  total: number;
  chars: number;
  urls: number;
  files: number;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-[14px]">
      <KpiTile label="Sources" value={String(total)} icon="layers" tone="accent" />
      <KpiTile
        label="Indexed chars"
        value={chars > 999 ? `${Math.round(chars / 1000)}k` : String(chars)}
        icon="book"
        tone="violet"
      />
      <KpiTile label="URLs" value={String(urls)} icon="globe" tone="good" />
      <KpiTile label="Files" value={String(files)} icon="clipboard" tone="accent" />
    </div>
  );
}

function KpiTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
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

// ─────────────── Row ───────────────

const KIND_ICON: Record<string, IconName> = {
  text: "clipboard",
  url: "globe",
  doc: "book",
  pdf: "book",
};

const KIND_LABEL: Record<string, string> = {
  text: "Text",
  url: "URL",
  doc: "File",
  pdf: "PDF",
};

function SourceRow({
  id,
  kind,
  name,
  size,
  status,
  sourceUrl,
  preview,
  createdAt,
}: {
  id: string;
  kind: string;
  name: string;
  size: number | null;
  status: string;
  sourceUrl: string | null;
  preview: string;
  createdAt: Date;
}) {
  const icon = KIND_ICON[kind] ?? "book";
  const label = KIND_LABEL[kind] ?? kind;
  return (
    <li className="bg-surface border border-border rounded-[12px] p-4 flex items-start gap-3">
      <div className="w-9 h-9 grid place-items-center rounded-md bg-surface-2 text-ink-2 shrink-0">
        <Icon name={icon} size={16} />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-[14px] text-ink truncate">
            {name}
          </span>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
            {label}
          </span>
          {status !== "ready" ? (
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bad">
              {status}
            </span>
          ) : null}
        </div>
        <div className="text-[11.5px] font-mono text-ink-3">
          {size != null ? `${formatChars(size)} chars · ` : ""}
          {createdAt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
          {sourceUrl ? (
            <>
              {" · "}
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-ink"
              >
                source
              </a>
            </>
          ) : null}
        </div>
        {preview ? (
          <p className="text-[12.5px] text-ink-2 line-clamp-2 leading-[1.5]">
            {preview}
            {(size ?? 0) > preview.length ? "…" : ""}
          </p>
        ) : null}
      </div>
      <DeleteKbButton id={id} name={name} />
    </li>
  );
}

function formatChars(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}
