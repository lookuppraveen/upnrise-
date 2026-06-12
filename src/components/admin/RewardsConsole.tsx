// Rewards admin console — earning rules editor + redemption catalog CRUD.
//
// Layout matches the established admin design language: ink-black header,
// 3-card KPI strip (Rules active / Catalog size / Top reward), then a
// two-column section grid (Earning rules | Catalog).

"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  deleteRewardItem,
  upsertRewardItem,
  upsertRewardRule,
} from "@/app/admin/rewards/actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type Action =
  | "complete_training"
  | "complete_module"
  | "score_above_80"
  | "score_above_90"
  | "streak_5_days"
  | "first_session";

type Rule = { action: Action; points: number; enabled: boolean };
type Item = {
  id: string;
  name: string;
  description: string | null;
  pointsCost: number;
  available: boolean;
};

const ACTION_LABELS: Record<
  Action,
  { label: string; hint: string; icon: IconName }
> = {
  first_session: {
    label: "First session",
    hint: "Awarded on first ended session.",
    icon: "ai-sparkle",
  },
  complete_module: {
    label: "Complete module",
    hint: "Per module completed.",
    icon: "clipboard",
  },
  complete_training: {
    label: "Complete training",
    hint: "Per training fully completed.",
    icon: "training",
  },
  score_above_80: {
    label: "Score 80+",
    hint: "Per session scored ≥80.",
    icon: "trophy",
  },
  score_above_90: {
    label: "Score 90+",
    hint: "Per session scored ≥90.",
    icon: "rocket",
  },
  streak_5_days: {
    label: "5-day streak",
    hint: "Practice 5 days in a row.",
    icon: "activity",
  },
};

const DEFAULT_RULES: Record<Action, number> = {
  first_session: 100,
  complete_module: 25,
  complete_training: 100,
  score_above_80: 50,
  score_above_90: 100,
  streak_5_days: 250,
};

export function RewardsConsole({
  rules,
  items,
  runtime,
}: {
  rules: Rule[];
  items: Item[];
  runtime: {
    pointsThisWeek: number;
    eventsThisWeek: number;
    lifetimePoints: number;
    earnersThisWeek: number;
  };
}) {
  const enabledCount = useMemo(
    () => rules.filter((r) => r.enabled).length,
    [rules],
  );
  const topReward = useMemo(() => {
    const available = items.filter((i) => i.available);
    if (available.length === 0) return null;
    return [...available].sort((a, b) => b.pointsCost - a.pointsCost)[0];
  }, [items]);

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
          Reward Points
        </h1>
        <p className="text-ink-2 text-[13.5px] max-w-[680px] leading-[1.5]">
          Define how learners earn points and what they redeem. Earnings
          feed the{" "}
          <Link
            href="/admin/leaderboard"
            className="text-accent underline"
          >
            Leaderboard
          </Link>
          ; catalog items unlock at the totals you set here.
        </p>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-[14px]">
        <KpiTile
          label="Rules active"
          value={`${enabledCount} / ${Object.keys(ACTION_LABELS).length}`}
          sub={
            enabledCount === 0
              ? "nothing earns points yet"
              : enabledCount === Object.keys(ACTION_LABELS).length
                ? "every trigger is on"
                : "partially configured"
          }
          icon="gift"
          tone="accent"
        />
        <KpiTile
          label="Awarded · 7d"
          value={runtime.pointsThisWeek.toLocaleString()}
          sub={
            runtime.eventsThisWeek === 0
              ? "no triggers fired yet"
              : `${runtime.eventsThisWeek} event${runtime.eventsThisWeek === 1 ? "" : "s"} · ${runtime.earnersThisWeek} learner${runtime.earnersThisWeek === 1 ? "" : "s"}`
          }
          icon="rocket"
          tone="good"
        />
        <KpiTile
          label="Lifetime points"
          value={runtime.lifetimePoints.toLocaleString()}
          sub={
            runtime.lifetimePoints === 0
              ? "runtime is live, awaiting triggers"
              : "all-time earnings"
          }
          icon="trophy"
          tone="violet"
        />
        <KpiTile
          label="Top reward"
          value={
            topReward
              ? `${topReward.pointsCost.toLocaleString()}`
              : `${items.length}`
          }
          sub={
            topReward
              ? topReward.name
              : items.length === 0
                ? "catalog empty"
                : "items configured"
          }
          icon="layers"
          tone="warn"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-3">
          <SectionHead
            title="Earning rules"
            hint="What learners get points for. Edits take effect on the next session-end trigger."
          />
          <RulesEditor rules={rules} />
        </div>
        <div className="space-y-3">
          <SectionHead
            title="Redemption catalog"
            hint="What they can spend points on — swag, gift cards, time off."
          />
          <CatalogEditor items={items} />
        </div>
      </div>
    </div>
  );
}

// ─────────────── KPI ───────────────

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

// ─────────────── Section head ───────────────

function SectionHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
        {title}
      </div>
      <p className="text-[12.5px] text-ink-2 leading-[1.5]">{hint}</p>
    </div>
  );
}

// ─────────────── Rules editor ───────────────

function RulesEditor({ rules }: { rules: Rule[] }) {
  const byAction = new Map(rules.map((r) => [r.action, r]));
  return (
    <Card pad="sm" className="overflow-hidden p-0 rounded-[12px]">
      <table className="w-full text-[13px]">
        <thead className="bg-surface-2 border-b border-border">
          <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
            <th className="px-4 py-[10px]">Trigger</th>
            <th className="px-3 py-[10px] w-[120px]">Points</th>
            <th className="px-3 py-[10px] w-[80px] text-center">On</th>
            <th className="px-4 py-[10px] w-[70px] text-right"></th>
          </tr>
        </thead>
        <tbody>
          {(Object.entries(ACTION_LABELS) as [Action, (typeof ACTION_LABELS)[Action]][]).map(
            ([key, meta]) => (
              <RuleRow
                key={key}
                action={key}
                meta={meta}
                rule={byAction.get(key)}
              />
            ),
          )}
        </tbody>
      </table>
    </Card>
  );
}

function RuleRow({
  action,
  meta,
  rule,
}: {
  action: Action;
  meta: { label: string; hint: string; icon: IconName };
  rule: Rule | undefined;
}) {
  const [points, setPoints] = useState(rule?.points ?? DEFAULT_RULES[action]);
  const [enabled, setEnabled] = useState(rule?.enabled ?? false);
  const [pending, startTransition] = useTransition();

  const dirty =
    !rule || points !== rule.points || enabled !== rule.enabled;

  function save() {
    startTransition(async () => {
      await upsertRewardRule({ action, points, enabled });
    });
  }

  return (
    <tr className="border-b border-border last:border-b-0 align-middle">
      <td className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "w-[30px] h-[30px] rounded-[8px] grid place-items-center shrink-0",
              enabled
                ? "bg-accent-pale text-accent-strong"
                : "bg-surface-2 text-ink-3",
            )}
            aria-hidden
          >
            <Icon name={meta.icon} size={13} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-[13px] text-ink">
              {meta.label}
            </div>
            <div className="text-[11.5px] text-ink-3 leading-snug">
              {meta.hint}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="inline-flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            max={100000}
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
            className="w-[72px] bg-surface border border-border-strong rounded-md px-2 py-1 text-[12.5px] font-mono text-right focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
          <span className="text-[10.5px] uppercase tracking-[0.08em] text-ink-3 font-semibold">
            pts
          </span>
        </div>
      </td>
      <td className="px-3 py-3 text-center">
        <Toggle on={enabled} onChange={setEnabled} />
      </td>
      <td className="px-4 py-3 text-right">
        {dirty ? (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="text-[11.5px] font-semibold text-accent hover:text-accent-strong"
          >
            {pending ? "…" : "Save"}
          </button>
        ) : (
          <span className="text-[11.5px] text-ink-3 font-mono">saved</span>
        )}
      </td>
    </tr>
  );
}

// ─────────────── Catalog editor ───────────────

function CatalogEditor({ items }: { items: Item[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "Cancel" : "+ Add item"}
        </Button>
      </div>
      {adding ? (
        <ItemForm onDone={() => setAdding(false)} initial={null} />
      ) : null}
      {items.length === 0 && !adding ? (
        <Card pad="lg" className="rounded-[12px]">
          <p className="text-[13px] text-ink-2">
            No catalog items. Add what learners can redeem points for —
            company swag, gift cards, time off.
          </p>
        </Card>
      ) : null}
      <div className="space-y-2">
        {items.map((i) => (
          <ItemRow key={i.id} item={i} />
        ))}
      </div>
    </div>
  );
}

function ItemRow({ item }: { item: Item }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);

  if (editing) {
    return <ItemForm onDone={() => setEditing(false)} initial={item} />;
  }
  return (
    <Card
      pad="md"
      className={cn(
        "group flex items-start gap-3 rounded-[12px] hover:border-border-strong transition-colors",
        !item.available && "opacity-70",
      )}
    >
      <div
        className={cn(
          "w-[36px] h-[36px] rounded-[10px] grid place-items-center shrink-0",
          item.available
            ? "bg-accent-pale text-accent-strong"
            : "bg-surface-2 text-ink-3",
        )}
        aria-hidden
      >
        <Icon name="gift" size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-[13.5px] text-ink truncate">
            {item.name}
          </h3>
          {!item.available ? (
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] px-[6px] py-[1px] rounded-sm border bg-surface-2 text-ink-3 border-border">
              Disabled
            </span>
          ) : null}
        </div>
        {item.description ? (
          <p className="text-[12.5px] text-ink-2 mt-0.5 leading-[1.5]">
            {item.description}
          </p>
        ) : null}
      </div>
      <div className="text-right shrink-0">
        <div className="font-display text-[22px] leading-none -tracking-[0.005em] text-ink">
          {item.pointsCost.toLocaleString()}
        </div>
        <div className="text-[10.5px] uppercase tracking-[0.08em] text-ink-3 font-semibold mt-0.5">
          pts
        </div>
      </div>
      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[11.5px] text-ink-2 hover:text-ink px-2 py-1 rounded-md hover:bg-surface-2"
        >
          Edit
        </button>
        {confirm ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(() => void deleteRewardItem(item.id))
            }
            className="text-[11.5px] font-semibold text-white px-2 py-1 rounded-md bg-bad hover:bg-bad/90"
          >
            {pending ? "…" : "Confirm"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="text-[11.5px] text-ink-3 hover:text-bad px-2 py-1 rounded-md hover:bg-bad-pale"
          >
            Delete
          </button>
        )}
      </div>
    </Card>
  );
}

function ItemForm({
  initial,
  onDone,
}: {
  initial: Item | null;
  onDone: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [pointsCost, setPointsCost] = useState(initial?.pointsCost ?? 500);
  const [available, setAvailable] = useState(initial?.available ?? true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!name.trim() || pointsCost < 0) return;
    setError(null);
    startTransition(async () => {
      try {
        await upsertRewardItem({
          id: initial?.id,
          name,
          description: description || null,
          pointsCost,
          available,
        });
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <Card pad="md" className="space-y-3 rounded-[12px] border-accent/30">
      <Field label="Item name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Cyberdyne hoodie"
          className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[14px] font-semibold focus:outline-none focus:border-accent"
          suppressHydrationWarning
        />
      </Field>
      <Field label="Description (optional)">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="What learners get + any fulfilment notes."
          className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[12.5px] focus:outline-none focus:border-accent resize-none"
          suppressHydrationWarning
        />
      </Field>
      <div className="flex items-end gap-4 flex-wrap">
        <Field label="Cost (pts)">
          <input
            type="number"
            min={0}
            value={pointsCost}
            onChange={(e) => setPointsCost(Number(e.target.value))}
            className="w-[120px] bg-surface border border-border-strong rounded-md px-2 py-[7px] text-[12.5px] font-mono text-right focus:outline-none focus:border-accent"
            suppressHydrationWarning
          />
        </Field>
        <label className="inline-flex items-center gap-2 cursor-pointer pb-[7px]">
          <Toggle on={available} onChange={setAvailable} />
          <span className="text-[12.5px] text-ink-2">Available</span>
        </label>
        <div className="ml-auto flex items-center gap-2">
          {error ? (
            <span className="text-[11.5px] text-bad font-mono">{error}</span>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={onDone}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant="accent"
            size="sm"
            onClick={save}
            disabled={pending || !name.trim()}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ─────────────── Toggle switch ───────────────

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex items-center w-[34px] h-[20px] rounded-full transition-colors",
        on ? "bg-accent" : "bg-border-strong",
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] w-[16px] h-[16px] rounded-full bg-white transition-transform",
          on ? "left-[16px]" : "left-[2px]",
        )}
        style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.12)" }}
      />
    </button>
  );
}

// ─────────────── Field ───────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {label}
      </span>
      {children}
    </label>
  );
}
