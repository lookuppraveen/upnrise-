// Plans page client — grid + "New plan" button + AI plan-fit suggestions.

"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PlanCard, type PlanWithStats } from "./PlanCard";

const NEW_PLAN_TEMPLATE: PlanWithStats = {
  name: "New plan",
  color: "#1a1a1a",
  priceCents: 4900,
  cycle: "monthly",
  setupCredits: 0,
  seatsMin: 1,
  seatsMax: 50,
  trialDays: 14,
  features: [],
  limits: {
    aiMinutesPerUser: 30,
    voice: false,
    video: false,
    customPersonas: 5,
    integrations: [],
  },
  badge: null,
  active: true,
  sortOrder: 99,
  companies: 0,
  mrrCents: 0,
};

export type PlanFitCandidate = {
  id: string;
  name: string;
  currentPlan: string;
  creditsPct: number;
};

export function PlansClient({
  initial,
  fitCandidates = [],
}: {
  initial: PlanWithStats[];
  fitCandidates?: PlanFitCandidate[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      {/* AI plan-fit suggestions banner */}
      {fitCandidates.length > 0 ? (
        <FitSuggestionsBanner candidates={fitCandidates} />
      ) : null}

      <div className="flex justify-end">
        <Button
          variant="accent"
          size="md"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "Cancel" : "+ New plan"}
        </Button>
      </div>

      {adding ? (
        <PlanCard
          plan={NEW_PLAN_TEMPLATE}
          initiallyEditing
          onCreateDone={() => setAdding(false)}
        />
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {initial.map((p) => (
          <PlanCard key={p.id} plan={p} />
        ))}
      </div>
    </div>
  );
}

function FitSuggestionsBanner({
  candidates,
}: {
  candidates: PlanFitCandidate[];
}) {
  // Group by current plan for a tighter narrative.
  const byPlan = new Map<string, PlanFitCandidate[]>();
  for (const c of candidates) {
    const arr = byPlan.get(c.currentPlan) ?? [];
    arr.push(c);
    byPlan.set(c.currentPlan, arr);
  }
  const groups = Array.from(byPlan.entries()).map(([plan, list]) => ({
    plan,
    names: list.slice(0, 2).map((c) => c.name),
    topPct: list[0].creditsPct,
    count: list.length,
  }));

  return (
    <div
      className="relative rounded-[14px] p-[14px] border flex items-start gap-3"
      style={{
        background:
          "linear-gradient(135deg, #f3eafa 0%, #fce8f0 100%)",
        borderColor: "#e6d2f1",
      }}
    >
      <div
        className="w-7 h-7 rounded-full grid place-items-center text-white shrink-0"
        style={{
          background: "linear-gradient(135deg, #7c3aed, #b94e8d)",
          boxShadow: "0 2px 8px rgba(124,58,237,0.25)",
        }}
        aria-hidden
      >
        <Icon name="ai-sparkle" size={12} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] text-ink leading-snug">
          <span className="font-semibold">AI plan-fit suggestions</span>
          <span className="text-ink-2"> — </span>
          <span className="font-semibold">
            {candidates.length}{" "}
            {candidates.length === 1 ? "customer is" : "customers are"} on the
            wrong tier
          </span>
        </div>
        <p className="text-[12.5px] text-ink-2 mt-1 leading-[1.55]">
          {groups
            .map(
              (g) =>
                `${g.names.join(" & ")}${g.count > g.names.length ? ` +${g.count - g.names.length} more` : ""} ${
                  g.count > 1 ? "are" : "is"
                } using ${g.topPct}% of ${g.plan} limits — an upgrade pays back fast.`,
            )
            .join(" ")}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {candidates.slice(0, 4).map((c) => (
            <Link
              key={c.id}
              href={`/super/companies/${c.id}`}
              className="inline-flex items-center gap-1 text-[11.5px] font-semibold px-[10px] py-[4px] rounded-full bg-surface border border-border hover:border-ink"
            >
              <span className="text-ink-2">{c.name}</span>
              <span className="text-ink-3 font-mono">
                · {c.creditsPct}%
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
