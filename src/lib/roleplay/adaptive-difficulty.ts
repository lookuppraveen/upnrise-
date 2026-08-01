// Adaptive-difficulty signal for the roleplay persona.
//
// When Training.adaptiveDifficulty is on, the /start and /turn routes
// call getDifficultyTierForUser to derive a tier from the learner's
// rolling performance. That tier is passed to buildSystemPrompt, which
// injects a "Difficulty calibration" section into the persona prompt.
//
// Signal (in priority order):
//   1. Avg score of learner's last N scored sessions IN THIS TRAINING
//   2. If none exist yet, avg across last N scored sessions overall
//   3. If still none, null → warmup tier
//
// N is small (10) so the tier reacts within a handful of sessions
// rather than being anchored by ancient history.

import { prisma } from "@/lib/db/client";
import { tierFromAvgScore, type DifficultyTier } from "@/lib/ai/roleplay";

const SAMPLE_SIZE = 10;

export async function getDifficultyTierForUser(input: {
  userId: string;
  trainingId: string;
}): Promise<DifficultyTier> {
  const inTraining = await prisma.roleplaySession.findMany({
    where: {
      userId: input.userId,
      score: { not: null },
      module: { trainingId: input.trainingId },
    },
    orderBy: { startedAt: "desc" },
    take: SAMPLE_SIZE,
    select: { score: true },
  });
  if (inTraining.length > 0) {
    return tierFromAvgScore(average(inTraining));
  }

  const anyRecent = await prisma.roleplaySession.findMany({
    where: { userId: input.userId, score: { not: null } },
    orderBy: { startedAt: "desc" },
    take: SAMPLE_SIZE,
    select: { score: true },
  });
  return tierFromAvgScore(average(anyRecent));
}

function average(rows: Array<{ score: number | null }>): number | null {
  const scores = rows
    .map((r) => r.score)
    .filter((s): s is number => s != null);
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}
