// Cache-invalidation helpers.
//
// unstable_cache entries in queries.ts are tagged (see cache-tags.ts).
// Server actions that mutate data should call one of these helpers so
// the next read re-fetches from the DB instead of returning the pre-
// mutation snapshot. Falls back to a short TTL (30–60s) if a caller
// forgets to invalidate, so worst case data is stale for a minute.

import { revalidateTag } from "next/cache";
import { cacheTags } from "./cache-tags";

/**
 * Invalidate every tenant-scoped cache entry for `companyId`.
 * Use after mutations whose blast radius is unclear (bulk edits,
 * publish/unpublish flows, wizard steps that touch many tables).
 */
export function invalidateTenant(companyId: string) {
  // "max" = stale-while-revalidate on Next 16 — the current entry stays
  // in place until the next request touches it, then re-fetches. Better
  // than the deprecated single-arg call, which was a hard blocking miss.
  revalidateTag(cacheTags.trainings(companyId), "max");
  revalidateTag(cacheTags.employees(companyId), "max");
  revalidateTag(cacheTags.leaderboard(companyId), "max");
  revalidateTag(cacheTags.assignments(companyId), "max");
  revalidateTag(cacheTags.feed(companyId), "max");
  revalidateTag(cacheTags.dashboard(companyId), "max");
  revalidateTag(cacheTags.company(companyId), "max");
}

/** Trainings + assignments + dashboard (any training CRUD hits all three). */
export function invalidateTrainings(companyId: string) {
  revalidateTag(cacheTags.trainings(companyId), "max");
  revalidateTag(cacheTags.assignments(companyId), "max");
  revalidateTag(cacheTags.dashboard(companyId), "max");
}

/** Employees + leaderboard + dashboard (roster or role change). */
export function invalidateEmployees(companyId: string) {
  revalidateTag(cacheTags.employees(companyId), "max");
  revalidateTag(cacheTags.leaderboard(companyId), "max");
  revalidateTag(cacheTags.dashboard(companyId), "max");
}

/** Feed posts. */
export function invalidateFeed(companyId: string) {
  revalidateTag(cacheTags.feed(companyId), "max");
}

/** Learner-scoped reads (after roleplay session ends, assignment updates). */
export function invalidateLearner(userId: string) {
  revalidateTag(cacheTags.learner(userId), "max");
  revalidateTag(cacheTags.learnerAssignments(userId), "max");
  revalidateTag(cacheTags.learnerHistory(userId), "max");
}

/** Every cross-tenant super-admin aggregate. Use sparingly. */
export function invalidatePlatform() {
  revalidateTag(cacheTags.platformStats, "max");
  revalidateTag(cacheTags.billingAll, "max");
  revalidateTag(cacheTags.companiesAll, "max");
  revalidateTag(cacheTags.plansAll, "max");
  revalidateTag(cacheTags.analyticsAll, "max");
  revalidateTag(cacheTags.activityAll, "max");
  revalidateTag(cacheTags.atRiskAll, "max");
}

/** Just the platform activity stream (fires on almost every audit_log write). */
export function invalidatePlatformActivity() {
  revalidateTag(cacheTags.activityAll, "max");
}
