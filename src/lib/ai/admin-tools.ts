// Admin Copilot — tool registry.
//
// Read tools (safe, no audit):  get_tenant_stats, list_trainings,
//   list_assignments, list_employees.
// Write tools (audit logged):   assign_training.
//
// Each tool has a JSON schema (sent to Claude) and a handler (run by us when
// Claude calls it). Handlers receive a typed user context — they NEVER trust
// IDs from Claude without tenant-scoping them.

import { prisma } from "@/lib/db/client";
import {
  getAdminDashboardStats,
  listAssignmentsForCompany,
  listEmployeesForCompany,
  listTrainingsForAdmin,
} from "@/lib/db/queries";
import type { SessionUser } from "@/lib/auth/session";

export type ToolCtx = { user: SessionUser; companyId: string };

export type ToolResult =
  | { ok: true; data: unknown; summary: string }
  | { ok: false; error: string };

export type ToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  handler: (input: unknown, ctx: ToolCtx) => Promise<ToolResult>;
};

// ───────────── Helpers ─────────────

async function resolveUsersByEmails(
  emails: string[],
  companyId: string,
): Promise<{ found: { id: string; email: string }[]; missing: string[] }> {
  if (emails.length === 0) return { found: [], missing: [] };
  const lower = emails.map((e) => e.toLowerCase().trim());
  const users = await prisma.user.findMany({
    where: {
      companyId,
      email: { in: lower, mode: "insensitive" },
      role: { in: ["trainee", "admin"] },
    },
    select: { id: true, email: true },
  });
  const foundSet = new Set(users.map((u) => u.email.toLowerCase()));
  const missing = lower.filter((e) => !foundSet.has(e));
  return { found: users, missing };
}

function shorten(s: string, max = 80): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ───────────── Read tools ─────────────

const get_tenant_stats: ToolDef = {
  name: "get_tenant_stats",
  description:
    "Get high-level KPIs for the admin's tenant: learner count, active trainings, avg score across all sessions, assignment counts, and completion %.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  handler: async (_input, { companyId }) => {
    const s = await getAdminDashboardStats(companyId);
    return {
      ok: true,
      data: s,
      summary: `learners=${s.learners} trainings=${s.activeTrainings} avg=${s.avgScore ?? "n/a"} completion=${s.completionPct ?? "n/a"}%`,
    };
  },
};

const list_trainings: ToolDef = {
  name: "list_trainings",
  description:
    "List trainings in the admin's tenant. Filter by status if provided. Returns id, title, status, module count, learner count, completion %.",
  input_schema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["draft", "published", "archived"],
        description: "If omitted, returns all statuses.",
      },
    },
    additionalProperties: false,
  },
  handler: async (input, { companyId }) => {
    const all = await listTrainingsForAdmin(companyId);
    const status = (input as { status?: string } | null)?.status;
    const filtered = status ? all.filter((t) => t.status === status) : all;
    return {
      ok: true,
      data: filtered.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        categories: t.categories,
        modules: t._count.modules,
        learners: t.learnerCount,
        completionPct: t.completionPct,
      })),
      summary: `${filtered.length} training(s)${status ? ` (${status})` : ""}`,
    };
  },
};

const list_assignments: ToolDef = {
  name: "list_assignments",
  description:
    "List assignments across the tenant. Filter by status or overdue=true if needed.",
  input_schema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["not_started", "in_progress", "completed"],
      },
      overdue: { type: "boolean" },
    },
    additionalProperties: false,
  },
  handler: async (input, { companyId }) => {
    const all = await listAssignmentsForCompany(companyId);
    const opts = (input ?? {}) as { status?: string; overdue?: boolean };
    let out = all;
    if (opts.status) out = out.filter((a) => a.computedStatus === opts.status);
    if (opts.overdue) out = out.filter((a) => a.overdue);
    return {
      ok: true,
      data: out.map((a) => ({
        id: a.id,
        learner: a.user.email,
        training: a.training.title,
        priority: a.priority,
        status: a.computedStatus,
        progress: a.computedProgress,
        dueAt: a.dueAt?.toISOString().slice(0, 10) ?? null,
        overdue: a.overdue,
      })),
      summary: `${out.length} assignment(s)`,
    };
  },
};

const list_employees: ToolDef = {
  name: "list_employees",
  description:
    "List learners (and admins) in the tenant with email, sessions count, avg score, assignment count.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  handler: async (_input, { companyId }) => {
    const employees = await listEmployeesForCompany(companyId);
    return {
      ok: true,
      data: employees.map((e) => ({
        id: e.id,
        email: e.email,
        name: e.name,
        role: e.role,
        sessions: e.sessions,
        avgScore: e.avgScore,
        assignments: e.assignments,
      })),
      summary: `${employees.length} employee(s)`,
    };
  },
};

// ───────────── Write tools ─────────────

const assign_training: ToolDef = {
  name: "assign_training",
  description:
    "Assign a published training to one or more learners. Pass the training's id (UUID) and learner emails. Optionally set priority (p1/p2/p3) and due date (days from today). Idempotent: existing assignments for these learners are updated, not duplicated. Returns the resulting assignments.",
  input_schema: {
    type: "object",
    properties: {
      training_id: { type: "string", description: "UUID" },
      learner_emails: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 100,
      },
      priority: { type: "string", enum: ["p1", "p2", "p3"] },
      due_in_days: {
        type: "number",
        minimum: 0,
        maximum: 365,
        description:
          "Days from today the assignment is due. Omit for no due date.",
      },
    },
    required: ["training_id", "learner_emails"],
    additionalProperties: false,
  },
  handler: async (input, { user, companyId }) => {
    const args = input as {
      training_id: string;
      learner_emails: string[];
      priority?: "p1" | "p2" | "p3";
      due_in_days?: number;
    };

    const training = await prisma.training.findFirst({
      where: { id: args.training_id, companyId },
      select: { id: true, title: true, status: true },
    });
    if (!training)
      return { ok: false, error: "Training not found in this tenant." };

    const { found, missing } = await resolveUsersByEmails(
      args.learner_emails,
      companyId,
    );
    if (found.length === 0)
      return { ok: false, error: `No matching learners. Missing: ${missing.join(", ")}` };

    const priority = args.priority ?? "p2";
    const dueAt =
      args.due_in_days != null
        ? new Date(Date.now() + args.due_in_days * 24 * 60 * 60 * 1000)
        : null;

    const ids = found.map((f) => f.id);
    const existing = await prisma.assignment.findMany({
      where: { trainingId: training.id, userId: { in: ids } },
      select: { id: true, userId: true },
    });
    const existingByUser = new Map(existing.map((a) => [a.userId, a.id]));
    const toUpdate = ids.filter((i) => existingByUser.has(i));
    const toCreate = ids.filter((i) => !existingByUser.has(i));

    await prisma.$transaction([
      ...toUpdate.map((uid) =>
        prisma.assignment.update({
          where: { id: existingByUser.get(uid)! },
          data: { priority, dueAt },
        }),
      ),
      ...toCreate.map((uid) =>
        prisma.assignment.create({
          data: {
            trainingId: training.id,
            userId: uid,
            priority,
            dueAt,
            status: "not_started",
            progress: 0,
          },
        }),
      ),
      prisma.auditLog.create({
        data: {
          actorId: user.id,
          companyId,
          action: "assignment.bulk_upsert",
          target: `training:${training.id}`,
          metadata: {
            via: "admin_copilot",
            learner_count: ids.length,
            created: toCreate.length,
            updated: toUpdate.length,
            priority,
            due_in_days: args.due_in_days ?? null,
            missing,
          },
        },
      }),
    ]);

    return {
      ok: true,
      data: {
        training: { id: training.id, title: training.title },
        created: toCreate.length,
        updated: toUpdate.length,
        missing,
        priority,
        due_in_days: args.due_in_days ?? null,
      },
      summary: `assigned "${shorten(training.title, 50)}" to ${ids.length} learner(s)${missing.length ? ` (${missing.length} not found)` : ""}`,
    };
  },
};

// ───────────── Registry ─────────────

export const ADMIN_TOOLS: ToolDef[] = [
  get_tenant_stats,
  list_trainings,
  list_assignments,
  list_employees,
  assign_training,
];

export function getTool(name: string): ToolDef | null {
  return ADMIN_TOOLS.find((t) => t.name === name) ?? null;
}
