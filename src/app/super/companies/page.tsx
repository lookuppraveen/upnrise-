// Super Admin · Companies  (02_SUPER_ADMIN.md §Companies)
//
// Server fetches the full company roster + billing, computes per-company
// derived signals (health score from churn risk, credits-used %), and
// hands off to the client CompaniesTable.
//
// Filtering / sorting / bulk-select live client-side — the dataset is
// small (~14 companies in seed; ~hundreds at worst) and instant filter
// beats a URL roundtrip per keystroke.

import { getSessionUser } from "@/lib/auth/session";
import {
  listAllCompaniesForSuper,
  listBillingForSuper,
} from "@/lib/db/queries";
import {
  CompaniesTable,
  type CompanyRow,
  type Signals,
} from "@/components/super/CompaniesTable";

const EXPANSION_THRESHOLD = 70;
const CHURN_THRESHOLD = 60;
const CREDITS_AT_RISK_PCT = 85;

export default async function CompaniesPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") return null;

  const [companies, billing] = await Promise.all([
    listAllCompaniesForSuper(),
    listBillingForSuper(),
  ]);

  // Merge credits-used % per company by id (billing keyed by company id).
  const creditsByCompany = new Map<string, number | null>();
  for (const b of billing) {
    const pct =
      b.creditsTotal > 0
        ? Math.round((b.creditsUsed / b.creditsTotal) * 100)
        : null;
    creditsByCompany.set(b.id, pct);
  }

  const rows: CompanyRow[] = companies.map((c) => ({
    id: c.id,
    name: c.name,
    logoInitials: c.logoInitials,
    brandColor: c.brandColor,
    industry: c.industry,
    region: c.region,
    seats: c.seats,
    userCount: c.userCount,
    health: c.health,
    healthScore: computeHealthScore(c.churnRisk, c.expandScore),
    churnRisk: c.churnRisk,
    expandScore: c.expandScore,
    plan: c.plan,
    planColor: c.planColor,
    subscriptionStatus: c.subscriptionStatus,
    mrrCents: c.mrrCents,
    csm: c.csm,
    creditsUsedPct: creditsByCompany.get(c.id) ?? null,
  }));

  const signals = computeSignals(rows);

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1280px]">
      <CompaniesTable rows={rows} signals={signals} />
    </div>
  );
}

/**
 * Derived health score (0–100). Anchored to churn risk (the strongest
 * signal we model), nudged up by expand score when present.
 */
function computeHealthScore(
  churnRisk: number | null,
  expandScore: number | null,
): number {
  const base = churnRisk != null ? 100 - churnRisk : 60;
  const lift =
    expandScore != null ? Math.round((expandScore - 50) / 8) : 0;
  return Math.max(0, Math.min(100, base + lift));
}

function computeSignals(rows: CompanyRow[]): Signals {
  const expansion = rows
    .filter((r) => r.expandScore != null && r.expandScore >= EXPANSION_THRESHOLD)
    .sort((a, b) => (b.expandScore ?? 0) - (a.expandScore ?? 0));
  const churn = rows
    .filter((r) => r.churnRisk != null && r.churnRisk >= CHURN_THRESHOLD)
    .sort((a, b) => (b.churnRisk ?? 0) - (a.churnRisk ?? 0));
  const creditExhaustion = rows
    .filter(
      (r) =>
        r.creditsUsedPct != null && r.creditsUsedPct >= CREDITS_AT_RISK_PCT,
    )
    .sort((a, b) => (b.creditsUsedPct ?? 0) - (a.creditsUsedPct ?? 0));

  const planNames = Array.from(
    new Set(rows.map((r) => r.plan).filter((p): p is string => !!p)),
  );

  return {
    expansion: { count: expansion.length, names: expansion.map((r) => r.name) },
    churn: { count: churn.length, names: churn.map((r) => r.name) },
    creditExhaustion: {
      count: creditExhaustion.length,
      names: creditExhaustion.map((r) => r.name),
    },
    planNames,
  };
}
