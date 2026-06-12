// Plan card — view + edit modes. Used on /super/plans.

"use client";

import { useState, useTransition } from "react";
import {
  savePlan,
  togglePlanActive,
} from "@/app/super/plans/actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export type PlanData = {
  id?: string;
  name: string;
  color: string;
  priceCents: number;
  cycle: "monthly" | "annual";
  setupCredits: number;
  seatsMin: number;
  seatsMax: number | null;
  trialDays: number;
  features: string[];
  limits: {
    aiMinutesPerUser?: number;
    voice?: boolean;
    video?: boolean;
    customPersonas?: number;
    integrations?: string[];
  };
  badge: string | null;
  active: boolean;
  sortOrder: number;
};

export type PlanWithStats = PlanData & {
  companies: number;
  mrrCents: number;
};

export function PlanCard({
  plan,
  initiallyEditing = false,
  onCreateDone,
}: {
  plan: PlanWithStats | null;
  initiallyEditing?: boolean;
  onCreateDone?: () => void;
}) {
  const [editing, setEditing] = useState(initiallyEditing);
  if (!plan) {
    return null;
  }
  if (editing) {
    return (
      <PlanEditor
        plan={plan}
        onCancel={() => {
          setEditing(false);
          onCreateDone?.();
        }}
        onSaved={() => {
          setEditing(false);
          onCreateDone?.();
        }}
      />
    );
  }
  return <PlanView plan={plan} onEdit={() => setEditing(true)} />;
}

function PlanView({
  plan,
  onEdit,
}: {
  plan: PlanWithStats;
  onEdit: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const priceLabel =
    plan.priceCents === 0
      ? "Custom"
      : `$${(plan.priceCents / 100).toFixed(0)}`;
  const tagline = planTagline(plan);

  return (
    <div
      className={cn(
        "relative bg-surface border border-border rounded-[14px] overflow-hidden",
        plan.active ? "" : "opacity-60",
      )}
    >
      {/* Left accent rail */}
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[5px]"
        style={{ background: plan.color }}
      />

      {/* Most-popular gradient badge */}
      {plan.badge ? (
        <span
          className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-[0.1em] px-[10px] py-[4px] rounded-md text-white whitespace-nowrap"
          style={{
            background: "var(--ai-grad)",
            boxShadow: "0 4px 12px rgba(232,93,58,0.25)",
          }}
        >
          {plan.badge}
        </span>
      ) : null}

      <div className="p-6 pl-7 space-y-4">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <span
              className="w-[10px] h-[10px] rounded-full shrink-0"
              style={{ background: plan.color }}
              aria-hidden
            />
            <h3 className="font-display text-[28px] leading-[1.05] -tracking-[0.015em]">
              {plan.name}
            </h3>
          </div>
          {tagline ? (
            <div className="text-[12.5px] text-ink-2">{tagline}</div>
          ) : null}
        </header>

        {/* Price block */}
        <div>
          <div className="flex items-baseline gap-1">
            <span className="font-display text-[44px] leading-none -tracking-[0.02em] text-ink">
              {priceLabel}
            </span>
          </div>
          <div className="text-[12px] text-ink-3 font-mono mt-2">
            {plan.priceCents > 0
              ? `per user / ${plan.cycle === "annual" ? "yr" : "mo"}`
              : `quote / ${plan.cycle}`}
            {plan.setupCredits > 0 ? (
              <>
                {" · "}
                <span>
                  {plan.setupCredits.toLocaleString()} setup credits
                </span>
              </>
            ) : null}
            {plan.trialDays > 0 ? (
              <>
                {" · "}
                <span>{plan.trialDays}d trial</span>
              </>
            ) : null}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border">
          <Stat label="On plan" value={String(plan.companies)} />
          <Stat
            label="MRR"
            value={plan.mrrCents === 0 ? "—" : `$${fmtK(plan.mrrCents / 100)}`}
          />
          <Stat
            label="Seats"
            value={
              plan.seatsMax == null
                ? `${plan.seatsMin}+`
                : `${plan.seatsMin}–${plan.seatsMax}`
            }
          />
        </div>

        {/* Features */}
        {plan.features.length > 0 ? (
          <ul className="text-[12.5px] text-ink-2 space-y-[5px]">
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span
                  className="text-good shrink-0 mt-[3px]"
                  style={{ color: plan.color }}
                >
                  ✓
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <LimitsBlock limits={plan.limits} />

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          {plan.id ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(() => void togglePlanActive(plan.id!))
              }
              className="text-[12px] text-ink-2 hover:text-ink px-2 py-1 rounded-md hover:bg-surface-2"
            >
              {pending ? "…" : plan.active ? "Disable" : "Enable"}
            </button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={onEdit}>
            Edit
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Short positioning line — derived from seat range so it reflects real
 * configuration. Keeps the prototype's "Self-serve · small teams"
 * vibe without hardcoding plan-name → tagline mappings that drift when
 * an operator renames a plan.
 */
function planTagline(plan: PlanWithStats): string {
  const max = plan.seatsMax;
  const isCustomPrice = plan.priceCents === 0;
  if (isCustomPrice) return "Custom · enterprise";
  if (max == null || max >= 1000) return "Enterprise · full features";
  if (max >= 250) return "Mid-market · full features";
  if (max >= 100) return "Growth · most features";
  return "Self-serve · small teams";
}

function LimitsBlock({ limits }: { limits: PlanData["limits"] }) {
  return (
    <div className="bg-surface-2 border border-border rounded-md p-3 space-y-1.5">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
        AI limits
      </div>
      <Row label="AI min / user" value={String(limits.aiMinutesPerUser ?? "—")} />
      <Row label="Voice" value={limits.voice ? "Yes" : "No"} />
      <Row label="Video" value={limits.video ? "Yes" : "No"} />
      <Row
        label="Custom personas"
        value={
          limits.customPersonas === -1
            ? "Unlimited"
            : String(limits.customPersonas ?? "—")
        }
      />
      <Row
        label="Integrations"
        value={(limits.integrations ?? []).join(", ") || "—"}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-ink-3">{label}</span>
      <span className="text-ink font-mono truncate ml-2">{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono font-semibold text-[14px] text-ink">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        {label}
      </div>
    </div>
  );
}

function fmtK(dollars: number): string {
  if (dollars >= 1_000_000) return `${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `${(dollars / 1000).toFixed(1)}k`;
  return dollars.toFixed(0);
}

// ─────────────────────────── Editor ───────────────────────────

function PlanEditor({
  plan,
  onCancel,
  onSaved,
}: {
  plan: PlanWithStats;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(plan.name);
  const [color, setColor] = useState(plan.color);
  const [price, setPrice] = useState(plan.priceCents / 100);
  const [cycle, setCycle] = useState<"monthly" | "annual">(
    plan.cycle as "monthly" | "annual",
  );
  const [setupCredits, setSetupCredits] = useState(plan.setupCredits);
  const [seatsMin, setSeatsMin] = useState(plan.seatsMin);
  const [seatsMax, setSeatsMax] = useState<number | null>(plan.seatsMax);
  const [trialDays, setTrialDays] = useState(plan.trialDays);
  const [features, setFeatures] = useState<string[]>(plan.features);
  const [featureInput, setFeatureInput] = useState("");
  const [badge, setBadge] = useState(plan.badge ?? "");
  const [sortOrder, setSortOrder] = useState(plan.sortOrder);
  const [active, setActive] = useState(plan.active);

  const [aiMinutes, setAiMinutes] = useState(
    plan.limits.aiMinutesPerUser ?? 30,
  );
  const [voice, setVoice] = useState(plan.limits.voice ?? false);
  const [video, setVideo] = useState(plan.limits.video ?? false);
  const [customPersonas, setCustomPersonas] = useState(
    plan.limits.customPersonas ?? 5,
  );
  const [integrations, setIntegrations] = useState<string[]>(
    plan.limits.integrations ?? [],
  );
  const [intInput, setIntInput] = useState("");

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit() {
    setError(null);
    startTransition(async () => {
      try {
        await savePlan({
          id: plan.id,
          name: name.trim(),
          color: color.trim(),
          priceCents: Math.round(price * 100),
          cycle,
          setupCredits,
          seatsMin,
          seatsMax,
          trialDays,
          features,
          limits: {
            aiMinutesPerUser: aiMinutes,
            voice,
            video,
            customPersonas,
            integrations,
          },
          badge: badge.trim() || null,
          active,
          sortOrder,
        });
        onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function addFeature() {
    const v = featureInput.trim();
    if (!v || features.includes(v) || features.length >= 20) return;
    setFeatures([...features, v]);
    setFeatureInput("");
  }
  function addIntegration() {
    const v = intInput.trim().toLowerCase();
    if (!v || integrations.includes(v) || integrations.length >= 20) return;
    setIntegrations([...integrations, v]);
    setIntInput("");
  }

  return (
    <Card pad="lg" className="space-y-3 border-accent/30">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <FieldLabel label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            suppressHydrationWarning
          />
        </FieldLabel>
        <FieldLabel label="Color">
          <input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#e85d3a"
            className={cn(inputCls, "font-mono")}
            suppressHydrationWarning
          />
        </FieldLabel>
        <FieldLabel label="Sort order">
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className={cn(inputCls, "font-mono")}
            suppressHydrationWarning
          />
        </FieldLabel>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <FieldLabel label="Price ($/seat, 0 = custom)">
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className={cn(inputCls, "font-mono")}
            suppressHydrationWarning
          />
        </FieldLabel>
        <FieldLabel label="Cycle">
          <select
            value={cycle}
            onChange={(e) => setCycle(e.target.value as "monthly" | "annual")}
            className={inputCls}
            suppressHydrationWarning
          >
            <option value="monthly">monthly</option>
            <option value="annual">annual</option>
          </select>
        </FieldLabel>
        <FieldLabel label="Trial days">
          <input
            type="number"
            min={0}
            value={trialDays}
            onChange={(e) => setTrialDays(Number(e.target.value))}
            className={cn(inputCls, "font-mono")}
            suppressHydrationWarning
          />
        </FieldLabel>
        <FieldLabel label="Setup credits">
          <input
            type="number"
            min={0}
            value={setupCredits}
            onChange={(e) => setSetupCredits(Number(e.target.value))}
            className={cn(inputCls, "font-mono")}
            suppressHydrationWarning
          />
        </FieldLabel>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <FieldLabel label="Seats min">
          <input
            type="number"
            min={0}
            value={seatsMin}
            onChange={(e) => setSeatsMin(Number(e.target.value))}
            className={cn(inputCls, "font-mono")}
            suppressHydrationWarning
          />
        </FieldLabel>
        <FieldLabel label="Seats max (blank = unlimited)">
          <input
            type="number"
            min={0}
            value={seatsMax ?? ""}
            onChange={(e) =>
              setSeatsMax(e.target.value === "" ? null : Number(e.target.value))
            }
            className={cn(inputCls, "font-mono")}
            suppressHydrationWarning
          />
        </FieldLabel>
        <FieldLabel label="Badge (optional)">
          <input
            value={badge}
            onChange={(e) => setBadge(e.target.value)}
            placeholder="Most popular"
            className={inputCls}
            suppressHydrationWarning
          />
        </FieldLabel>
      </div>

      <FieldLabel label="Features">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {features.map((f) => (
              <span
                key={f}
                className="inline-flex items-center gap-1 text-[11.5px] bg-surface-2 border border-border rounded-sm pl-2 pr-1 py-[2px]"
              >
                {f}
                <button
                  type="button"
                  onClick={() => setFeatures(features.filter((x) => x !== f))}
                  className="text-ink-3 hover:text-ink px-1"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            value={featureInput}
            onChange={(e) => setFeatureInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addFeature();
              }
            }}
            placeholder="Add a feature, press Enter"
            className={inputCls}
            suppressHydrationWarning
          />
        </div>
      </FieldLabel>

      <div className="bg-surface-2 border border-border rounded-md p-3 space-y-3">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
          AI limits
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <FieldLabel label="AI min / user">
            <input
              type="number"
              min={0}
              value={aiMinutes}
              onChange={(e) => setAiMinutes(Number(e.target.value))}
              className={cn(inputCls, "font-mono")}
              suppressHydrationWarning
            />
          </FieldLabel>
          <FieldLabel label="Custom personas (−1 = ∞)">
            <input
              type="number"
              min={-1}
              value={customPersonas}
              onChange={(e) => setCustomPersonas(Number(e.target.value))}
              className={cn(inputCls, "font-mono")}
              suppressHydrationWarning
            />
          </FieldLabel>
          <label className="flex items-end gap-2 mb-1">
            <input
              type="checkbox"
              checked={voice}
              onChange={(e) => setVoice(e.target.checked)}
              className="accent-accent"
            />
            <span className="text-[12.5px] text-ink">Voice</span>
          </label>
          <label className="flex items-end gap-2 mb-1">
            <input
              type="checkbox"
              checked={video}
              onChange={(e) => setVideo(e.target.checked)}
              className="accent-accent"
            />
            <span className="text-[12.5px] text-ink">Video</span>
          </label>
        </div>
        <FieldLabel label="Integrations">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {integrations.map((i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-[11.5px] bg-surface border border-border rounded-sm pl-2 pr-1 py-[2px] font-mono"
                >
                  {i}
                  <button
                    type="button"
                    onClick={() =>
                      setIntegrations(integrations.filter((x) => x !== i))
                    }
                    className="text-ink-3 hover:text-ink px-1"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              value={intInput}
              onChange={(e) => setIntInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addIntegration();
                }
              }}
              placeholder="slack, salesforce, ..."
              className={inputCls}
              suppressHydrationWarning
            />
          </div>
        </FieldLabel>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="accent-accent"
        />
        <span className="text-[12.5px] text-ink">Available for new tenants</span>
      </label>

      <div className="flex items-center justify-end gap-2">
        {error ? (
          <span className="text-[11.5px] text-bad font-mono">{error}</span>
        ) : null}
        <Button
          variant="ghost"
          size="md"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          variant="accent"
          size="md"
          onClick={commit}
          disabled={pending}
        >
          {pending ? "Saving…" : "Save plan"}
        </Button>
      </div>
    </Card>
  );
}

const inputCls =
  "w-full bg-surface border border-border-strong rounded-md px-2 py-1.5 text-[13px] focus:outline-none focus:border-accent";

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        {label}
      </span>
      {children}
    </label>
  );
}
