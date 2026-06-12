// Platform AI Copilot — tool registry. ALL READ-ONLY in Phase 4.6.
//
// These tools operate cross-tenant by design. The anti-leakage property is
// enforced primarily by the system prompt (see lib/ai/platform-copilot.ts):
// when discussing a specific tenant, the copilot identifies it by name and
// doesn't blend data points across tenants.

import { prisma } from "@/lib/db/client";
import {
  getAtRiskCompaniesForSuper,
  getCompanyDetailForSuper,
  getPlatformStats,
  listAllCompaniesForSuper,
  listPlansForSuper,
  getRecentPlatformActivity,
} from "@/lib/db/queries";

export type ToolResult =
  | { ok: true; data: unknown; summary: string }
  | { ok: false; error: string };

export type ToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  handler: (input: unknown) => Promise<ToolResult>;
};

function shorten(s: string, max = 80): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ───────────── Read tools ─────────────

const get_platform_stats: ToolDef = {
  name: "get_platform_stats",
  description:
    "Platform-wide KPIs: MRR, ARR, total companies, total users, total sessions, AI spend, count of active plans.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  handler: async () => {
    const s = await getPlatformStats();
    return {
      ok: true,
      data: {
        mrr_usd: Math.round(s.mrrCents / 100),
        arr_usd: Math.round(s.arrCents / 100),
        companies: s.companies,
        users: s.users,
        sessions: s.sessions,
        ai_spend_usd: Math.round(s.aiSpendCents / 100),
        active_plans: s.activePlans,
      },
      summary: `mrr=$${Math.round(s.mrrCents / 100)} companies=${s.companies} users=${s.users}`,
    };
  },
};

const list_at_risk_companies: ToolDef = {
  name: "list_at_risk_companies",
  description:
    "List tenants sorted by churn risk descending. Use this to draft CSM outreach or surface accounts that need attention.",
  input_schema: {
    type: "object",
    properties: {
      limit: { type: "number", minimum: 1, maximum: 20 },
      min_churn_risk: {
        type: "number",
        minimum: 0,
        maximum: 100,
        description: "Only include tenants with churn_risk >= this threshold.",
      },
    },
    additionalProperties: false,
  },
  handler: async (input) => {
    const opts = (input ?? {}) as { limit?: number; min_churn_risk?: number };
    const rows = await getAtRiskCompaniesForSuper(opts.limit ?? 8);
    const filtered = opts.min_churn_risk
      ? rows.filter((r) => (r.churnRisk ?? 0) >= (opts.min_churn_risk ?? 0))
      : rows;
    return {
      ok: true,
      data: filtered.map((c) => ({
        id: c.id,
        name: c.name,
        plan: c.plan,
        csm: c.csm,
        churn_risk: c.churnRisk,
        health: c.health,
        mrr_usd: Math.round(c.mrrCents / 100),
      })),
      summary: `${filtered.length} at-risk tenant(s)`,
    };
  },
};

const list_companies: ToolDef = {
  name: "list_companies",
  description:
    "List all tenants. Optionally filter by health, region, or plan. Returns aggregate cards (no per-user detail).",
  input_schema: {
    type: "object",
    properties: {
      health: { type: "string", enum: ["healthy", "watch", "at_risk"] },
      region: { type: "string", description: "e.g. AMER, EMEA, APAC" },
      plan: { type: "string", description: "Plan name like 'Growth'" },
    },
    additionalProperties: false,
  },
  handler: async (input) => {
    const opts = (input ?? {}) as {
      health?: string;
      region?: string;
      plan?: string;
    };
    const all = await listAllCompaniesForSuper();
    let out = all;
    if (opts.health) out = out.filter((c) => c.health === opts.health);
    if (opts.region) out = out.filter((c) => c.region === opts.region);
    if (opts.plan)
      out = out.filter(
        (c) => (c.plan ?? "").toLowerCase() === opts.plan!.toLowerCase(),
      );
    return {
      ok: true,
      data: out.map((c) => ({
        id: c.id,
        name: c.name,
        industry: c.industry,
        region: c.region,
        plan: c.plan,
        seats: c.seats,
        users: c.userCount,
        mrr_usd: Math.round(c.mrrCents / 100),
        health: c.health,
        churn_risk: c.churnRisk,
        expand_score: c.expandScore,
        growth_pct: c.growthPct,
        csm: c.csm,
        ai_spend_usd: Math.round(c.aiSpendCents / 100),
      })),
      summary: `${out.length} tenant(s)`,
    };
  },
};

const get_company_detail: ToolDef = {
  name: "get_company_detail",
  description:
    "Get full detail for a specific tenant by UUID. Includes commercial fields and usage stats.",
  input_schema: {
    type: "object",
    properties: {
      company_id: { type: "string", description: "UUID" },
    },
    required: ["company_id"],
    additionalProperties: false,
  },
  handler: async (input) => {
    const args = input as { company_id: string };
    const c = await getCompanyDetailForSuper(args.company_id);
    if (!c) return { ok: false, error: "Company not found." };
    return {
      ok: true,
      data: {
        id: c.id,
        name: c.name,
        industry: c.industry,
        region: c.region,
        seats: c.seats,
        users: c.userCount,
        sessions: c.sessionsCount,
        avg_score: c.avgScore,
        mrr_usd: Math.round(c.mrrCents / 100),
        ai_spend_usd: Math.round(c.aiSpendCents / 100),
        churn_risk: c.churnRisk,
        expand_score: c.expandScore,
        growth_pct: c.growthPct,
        csm: c.csm,
        plan: c.subscription?.plan?.name ?? null,
        plan_status: c.subscription?.status ?? null,
        renewal_at: c.subscription?.renewalAt?.toISOString().slice(0, 10) ?? null,
        health: c.health,
        since: c.since?.toISOString().slice(0, 10) ?? null,
      },
      summary: `${c.name}: mrr=$${Math.round(c.mrrCents / 100)} churn=${c.churnRisk ?? "n/a"}`,
    };
  },
};

const list_plans: ToolDef = {
  name: "list_plans",
  description:
    "List all plans with companies on each plan and MRR contribution. Use this for plan-mix questions.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  handler: async () => {
    const plans = await listPlansForSuper();
    return {
      ok: true,
      data: plans.map((p) => ({
        name: p.name,
        price_usd_per_seat: p.priceCents / 100,
        cycle: p.cycle,
        companies: p.companies,
        mrr_usd: Math.round(p.mrrCents / 100),
        active: p.active,
        limits: p.limits,
      })),
      summary: `${plans.length} plan(s)`,
    };
  },
};

const list_recent_activity: ToolDef = {
  name: "list_recent_activity",
  description:
    "Cross-tenant audit-log entries. Use this to understand what's been happening platform-wide.",
  input_schema: {
    type: "object",
    properties: {
      limit: { type: "number", minimum: 1, maximum: 50 },
    },
    additionalProperties: false,
  },
  handler: async (input) => {
    const args = (input ?? {}) as { limit?: number };
    const rows = await getRecentPlatformActivity(args.limit ?? 12);
    return {
      ok: true,
      data: rows.map((r) => ({
        action: r.action,
        actor: r.actor?.email ?? null,
        company: r.company?.name ?? null,
        target: r.target,
        when: r.createdAt.toISOString(),
        metadata: r.metadata,
      })),
      summary: `${rows.length} entries`,
    };
  },
};

// ───────────── Registry ─────────────

export const PLATFORM_TOOLS: ToolDef[] = [
  get_platform_stats,
  list_at_risk_companies,
  list_companies,
  get_company_detail,
  list_plans,
  list_recent_activity,
];

export function getPlatformTool(name: string): ToolDef | null {
  return PLATFORM_TOOLS.find((t) => t.name === name) ?? null;
}

// helper unused but kept exported for any future write tools.
export { shorten as _shorten };
