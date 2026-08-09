// Runtime helpers for reading `module.body.evaluationCriteria` on the
// trainee side. The admin editor persists the full, structured criteria
// (with per-item checklist and visibility flags) into module.body; the
// runtime rubric written to RoleplayConfig collapses each criterion's
// checklist into a single description string for the AI scorer. This
// helper gives the results page a safe read path back to the original
// structured form so we can render the checklist the admin authored,
// respecting per-item visibility.

import { z } from "zod";

export type EvaluationChecklistItem = {
  id: string;
  label: string;
  /** false → admin-only, hide from trainee-facing surfaces. */
  visible: boolean;
};

export type EvaluationCriterion = {
  id: string;
  label: string;
  /** Persisted as 0-100 percentage in module.body (contrast with the
   *  runtime rubric which stores 0-1 fractions). */
  weight: number;
  items: EvaluationChecklistItem[];
};

const ChecklistItemSchema = z.object({
  id: z.string().max(60),
  label: z.string().min(1).max(300),
  visible: z.boolean(),
});

const EvalCriterionSchema = z.object({
  id: z.string().max(60),
  label: z.string().min(1).max(200),
  weight: z.number().int().min(0).max(100).optional().default(0),
  items: z.array(ChecklistItemSchema).max(20).default([]),
});

const EvaluationCriteriaSchema = z.array(EvalCriterionSchema).max(20);

/**
 * Parse `module.body.evaluationCriteria` into the structured admin
 * form. Returns `[]` when the field is missing or malformed — the
 * results page treats that as "no criteria configured" and falls back
 * to the runtime rubric's description text.
 */
export function parseEvaluationCriteria(
  body: unknown,
): EvaluationCriterion[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const raw = (body as Record<string, unknown>).evaluationCriteria;
  if (!raw) return [];
  const parsed = EvaluationCriteriaSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/**
 * Lookup helper for the results page: for a given rubric criterion id
 * (as scored by the LLM), return the admin-authored checklist items
 * that are visible to trainees. Empty array when the criterion has no
 * items or all items are marked hidden.
 */
export function visibleChecklistItemsFor(
  criteria: EvaluationCriterion[],
  criterionId: string,
): EvaluationChecklistItem[] {
  const match = criteria.find((c) => c.id === criterionId);
  if (!match) return [];
  return match.items.filter((it) => it.visible);
}
