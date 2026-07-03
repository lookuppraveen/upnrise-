// One-shot migration: append the standard evaluation criteria
// (transparency, technical_competency, consultative_approach) to every
// existing roleplay_config.rubric that's missing them. Existing criteria
// have their weights proportionally scaled down so the total sums to 1.0.
//
// Run: `npx tsx prisma/backfill_standard_criteria.ts`
// Safe to re-run — modules that already have all three are skipped.

import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const STANDARD_CRITERIA = [
  {
    id: "transparency",
    label: "Transparency",
    weight: 0.1,
    description:
      "Was upfront about pricing, product limits, and trade-offs; did not dodge hard questions or bury caveats.",
  },
  {
    id: "technical_competency",
    label: "Technical Competency",
    weight: 0.1,
    description:
      "Answered product / domain questions accurately with correct terminology; showed genuine command of the offering.",
  },
  {
    id: "consultative_approach",
    label: "Consultative Approach",
    weight: 0.1,
    description:
      "Acted as an advisor — diagnosed the buyer's situation before prescribing; offered options rather than pitching a single answer.",
  },
];

type Criterion = {
  id: string;
  label: string;
  weight: number;
  description: string;
};

type Rubric = {
  pass_score?: number;
  criteria: Criterion[];
};

function isRubric(value: unknown): value is Rubric {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as { criteria?: unknown };
  if (!Array.isArray(v.criteria)) return false;
  return v.criteria.every(
    (c) =>
      c &&
      typeof c === "object" &&
      typeof (c as Criterion).id === "string" &&
      typeof (c as Criterion).label === "string" &&
      typeof (c as Criterion).weight === "number" &&
      typeof (c as Criterion).description === "string",
  );
}

function extend(rubric: Rubric): Rubric | null {
  const existingIds = new Set(rubric.criteria.map((c) => c.id));
  const missing = STANDARD_CRITERIA.filter((c) => !existingIds.has(c.id));
  if (missing.length === 0) return null;

  const addedWeight = missing.reduce((acc, c) => acc + c.weight, 0);
  const oldTotal = rubric.criteria.reduce((acc, c) => acc + c.weight, 0);
  const targetOld = 1 - addedWeight;
  const scale = oldTotal > 0 ? targetOld / oldTotal : 0;

  const rescaled = rubric.criteria.map((c) => ({
    ...c,
    weight: Math.round(c.weight * scale * 100) / 100,
  }));

  // Distribute any rounding residual onto the largest existing criterion
  // so the sum lands exactly at 1.0.
  const sumAfter =
    rescaled.reduce((acc, c) => acc + c.weight, 0) + addedWeight;
  const residual = Math.round((1 - sumAfter) * 100) / 100;
  if (residual !== 0 && rescaled.length > 0) {
    const biggest = rescaled.reduce((a, b) => (a.weight >= b.weight ? a : b));
    biggest.weight = Math.round((biggest.weight + residual) * 100) / 100;
  }

  return { ...rubric, criteria: [...rescaled, ...missing] };
}

async function main() {
  const rows = await prisma.roleplayConfig.findMany({
    select: { id: true, moduleId: true, rubric: true },
  });

  let touched = 0;
  let skipped = 0;
  let invalid = 0;

  for (const row of rows) {
    if (!isRubric(row.rubric)) {
      console.warn(`  ✗ module ${row.moduleId} — rubric shape invalid, skipped`);
      invalid++;
      continue;
    }
    const next = extend(row.rubric);
    if (!next) {
      skipped++;
      continue;
    }
    await prisma.roleplayConfig.update({
      where: { id: row.id },
      data: { rubric: next as unknown as Prisma.InputJsonValue },
    });
    touched++;
    console.log(`  ✓ module ${row.moduleId} — appended standard criteria`);
  }

  console.log("");
  console.log(
    `Done. ${touched} updated · ${skipped} already had them · ${invalid} invalid`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
