// Super Admin · Plans  (02_SUPER_ADMIN.md §Plans)
//
// Pixel-perfect pass matches super-04-plans.png:
//   - Accent title "Subscription Plans" + roster-stats subtitle
//   - AI plan-fit suggestions banner — derived from real tenant credit
//     usage (companies on a lower tier approaching their credit cap)
//   - Plan cards with colored left accent rail, big display title +
//     plan dot, tagline derived from seat range, big $price typography,
//     "Most popular" gradient badge (rendered from plan.badge field)

import { getSessionUser } from "@/lib/auth/session";
import {
  listPlansForSuper,
  listBillingForSuper,
} from "@/lib/db/queries";
import { PlansClient } from "@/components/super/PlansClient";

const PLAN_FIT_THRESHOLD = 80;

export default async function PlansPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") return null;

  const [plans, billing] = await Promise.all([
    listPlansForSuper(),
    listBillingForSuper(),
  ]);

  const totalMrr = plans.reduce((acc, p) => acc + p.mrrCents, 0);
  const totalCompanies = plans.reduce((acc, p) => acc + p.companies, 0);

  // Plan-fit candidates: companies whose credit usage is ≥ 80% and they're
  // NOT on the top-tier plan. That's a real "wrong tier" signal — they're
  // saturating their current plan and would pay back an upgrade.
  const topPlanName = plans.length > 0 ? plans[plans.length - 1].name : null;
  const fitCandidates = billing
    .filter((b) => {
      if (!b.planName || b.planName === topPlanName) return false;
      if (b.creditsTotal <= 0) return false;
      return (b.creditsUsed / b.creditsTotal) * 100 >= PLAN_FIT_THRESHOLD;
    })
    .map((b) => ({
      id: b.id,
      name: b.name,
      currentPlan: b.planName!,
      creditsPct: Math.round((b.creditsUsed / b.creditsTotal) * 100),
    }))
    .sort((a, b) => b.creditsPct - a.creditsPct);

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1280px] space-y-5">
      <header className="space-y-2">
        <h1 className="font-display text-[36px] leading-[1.05] -tracking-[0.015em] text-accent">
          Subscription Plans
        </h1>
        <p className="text-ink-2 text-[13.5px]">
          {plans.length} active {plans.length === 1 ? "tier" : "tiers"} ·{" "}
          {totalCompanies} {totalCompanies === 1 ? "company" : "companies"}{" "}
          enrolled · <span className="font-mono">${fmtK(totalMrr / 100)} MRR</span>
        </p>
      </header>

      <PlansClient initial={plans} fitCandidates={fitCandidates} />
    </div>
  );
}

function fmtK(dollars: number): string {
  if (dollars >= 1_000_000) return `${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `${(dollars / 1000).toFixed(1)}k`;
  return dollars.toFixed(0);
}
