// Cache-tag taxonomy for unstable_cache + revalidateTag.
//
// Every cache entry gets one or more tags. Server actions that mutate
// data call revalidateTag() with the matching tag(s) so the next read
// re-fetches from the DB instead of returning stale rows.
//
// Naming convention: `<domain>:<scope>` (single string). Scopes:
//   - a tenant id            → `trainings:${companyId}`
//   - a user id              → `learner:${userId}`
//   - the whole platform     → `platform:stats`, `billing:all`, …
//
// Keep this file as the single source of truth so tag strings never
// drift between the read side (unstable_cache) and the write side
// (revalidateTag).

export const cacheTags = {
  // ── Super-admin (cross-tenant reads) ─────────────────────────────
  platformStats: "platform:stats",
  billingAll: "billing:all",
  companiesAll: "companies:all",
  plansAll: "plans:all",
  analyticsAll: "analytics:all",
  activityAll: "activity:all",
  atRiskAll: "at-risk:all",

  // ── Tenant-scoped ────────────────────────────────────────────────
  trainings: (companyId: string) => `trainings:${companyId}`,
  training: (trainingId: string) => `training:${trainingId}`,
  employees: (companyId: string) => `employees:${companyId}`,
  leaderboard: (companyId: string) => `leaderboard:${companyId}`,
  assignments: (companyId: string) => `assignments:${companyId}`,
  feed: (companyId: string) => `feed:${companyId}`,
  dashboard: (companyId: string) => `dashboard:${companyId}`,
  company: (companyId: string) => `company:${companyId}`,

  // ── Learner-scoped ───────────────────────────────────────────────
  learner: (userId: string) => `learner:${userId}`,
  learnerAssignments: (userId: string) => `learner:${userId}:assignments`,
  learnerHistory: (userId: string) => `learner:${userId}:history`,

  // ── Session identity (Supabase auth id → prisma.users row) ───────
  sessionUser: (authId: string) => `session:user:${authId}`,
} as const;
