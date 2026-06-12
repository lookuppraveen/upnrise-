// GET /api/admin/reports/export?kind=trainings|learners|sessions
//
// Streams a CSV of the requested report, scoped to the caller's tenant.

import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    return new Response("forbidden", { status: 403 });
  }
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "trainings";

  let csv: string;
  if (kind === "trainings") csv = await trainingsCsv(user.companyId);
  else if (kind === "learners") csv = await learnersCsv(user.companyId);
  else if (kind === "sessions") csv = await sessionsCsv(user.companyId);
  else return new Response("unknown kind", { status: 400 });

  const filename = `upnrise-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rows(headers: string[], data: Array<Array<unknown>>): string {
  return [headers.join(","), ...data.map((r) => r.map(csvEscape).join(","))].join(
    "\n",
  );
}

async function trainingsCsv(companyId: string): Promise<string> {
  const trainings = await prisma.training.findMany({
    where: { companyId },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { modules: true, assignments: true } },
    },
  });
  // Compute completion % across assignments for each training.
  const data = await Promise.all(
    trainings.map(async (t) => {
      const assignments = await prisma.assignment.findMany({
        where: { trainingId: t.id },
        select: { userId: true },
      });
      let done = 0;
      for (const a of assignments) {
        const modules = await prisma.trainingModule.findMany({
          where: { trainingId: t.id, published: true },
          select: { id: true },
        });
        if (modules.length === 0) continue;
        const completed = await prisma.roleplaySession.groupBy({
          by: ["moduleId"],
          where: {
            userId: a.userId,
            moduleId: { in: modules.map((m) => m.id) },
            endedAt: { not: null },
          },
          _count: { _all: true },
        });
        if (completed.length === modules.length) done++;
      }
      const avg = await prisma.roleplaySession.aggregate({
        where: {
          score: { not: null },
          module: { trainingId: t.id },
        },
        _avg: { score: true },
      });
      return [
        t.id,
        t.title,
        t.status,
        t.categories.join("|"),
        t._count.modules,
        t._count.assignments,
        assignments.length === 0
          ? ""
          : Math.round((done / assignments.length) * 100),
        avg._avg.score != null ? Math.round(avg._avg.score) : "",
        t.createdAt.toISOString(),
      ];
    }),
  );
  return rows(
    [
      "id",
      "title",
      "status",
      "categories",
      "modules",
      "assigned_learners",
      "completion_pct",
      "avg_score",
      "created_at",
    ],
    data,
  );
}

async function learnersCsv(companyId: string): Promise<string> {
  const users = await prisma.user.findMany({
    where: { companyId, role: { in: ["trainee", "admin"] } },
    orderBy: { createdAt: "asc" },
  });
  const data = await Promise.all(
    users.map(async (u) => {
      const [sessions, scored, durationAgg, assignments] = await Promise.all([
        prisma.roleplaySession.count({
          where: { userId: u.id, endedAt: { not: null } },
        }),
        prisma.roleplaySession.aggregate({
          where: { userId: u.id, score: { not: null } },
          _avg: { score: true },
          _max: { score: true },
        }),
        prisma.roleplaySession.aggregate({
          where: { userId: u.id, durationSec: { not: null } },
          _sum: { durationSec: true },
        }),
        prisma.assignment.count({ where: { userId: u.id } }),
      ]);
      return [
        u.id,
        u.email,
        u.name ?? "",
        u.role,
        u.status,
        sessions,
        scored._avg.score != null ? Math.round(scored._avg.score) : "",
        scored._max.score ?? "",
        Math.round((durationAgg._sum.durationSec ?? 0) / 60),
        assignments,
        u.lastActive ? u.lastActive.toISOString() : "",
        u.createdAt.toISOString(),
      ];
    }),
  );
  return rows(
    [
      "id",
      "email",
      "name",
      "role",
      "status",
      "sessions",
      "avg_score",
      "best_score",
      "minutes_practiced",
      "assignments",
      "last_active",
      "created_at",
    ],
    data,
  );
}

async function sessionsCsv(companyId: string): Promise<string> {
  const sessions = await prisma.roleplaySession.findMany({
    where: { user: { companyId } },
    orderBy: { startedAt: "desc" },
    include: {
      user: { select: { email: true } },
      module: {
        select: {
          name: true,
          training: { select: { title: true } },
        },
      },
    },
  });
  const data = sessions.map((s) => [
    s.id,
    s.startedAt.toISOString(),
    s.endedAt ? s.endedAt.toISOString() : "",
    s.user.email,
    s.module.training.title,
    s.module.name,
    s.score ?? "",
    s.priorScore ?? "",
    s.mode,
    s.durationSec ?? "",
    s.strongSkills.join("|"),
    s.weakSkills.join("|"),
  ]);
  return rows(
    [
      "session_id",
      "started_at",
      "ended_at",
      "learner_email",
      "training",
      "module",
      "score",
      "prior_score",
      "mode",
      "duration_sec",
      "strong_skills",
      "weak_skills",
    ],
    data,
  );
}
