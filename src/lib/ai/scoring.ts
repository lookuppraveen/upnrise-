// Roleplay scoring — runs after a session ends.
//
// Calls Claude with the transcript + rubric and a forced tool_use schema so
// we get guaranteed-structured JSON back (no regex-parsing of free text).
// On success returns rubric scores + strong/weak skills + coaching summary;
// on failure returns null so /api/roleplay/end can still persist endedAt and
// the results page can render the transcript without scores.

import { z } from "zod";
import { anthropic } from "./client";
import { getAIConfig } from "./config";
import type { TranscriptTurn } from "./roleplay";

// ───────────── Rubric shape (matches what we seed) ─────────────

export type RubricCriterion = {
  id: string;
  label: string;
  /** Sum across criteria should be ~1.0. */
  weight: number;
  description: string;
};

export type RubricShape = {
  pass_score?: number;
  criteria: RubricCriterion[];
};

export function parseRubric(json: unknown): RubricShape | null {
  const parsed = z
    .object({
      pass_score: z.number().min(0).max(100).optional(),
      criteria: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            weight: z.number().min(0).max(1),
            description: z.string(),
          }),
        )
        .min(1),
    })
    .safeParse(json);
  return parsed.success ? parsed.data : null;
}

// ───────────── Score result ─────────────

const ScoreResultSchema = z.object({
  rubric_scores: z.record(z.string(), z.number().min(0).max(100)),
  strong_skills: z.array(z.string()).max(6),
  weak_skills: z.array(z.string()).max(6),
  summary: z.string().min(10).max(1200),
});

export type ScoreResult = z.infer<typeof ScoreResultSchema> & {
  /** Weighted overall (0–100). */
  overall: number;
};

// ───────────── Prompts ─────────────

type FeedbackTone = "soft" | "balanced" | "direct";

const TONE_INSTRUCTIONS: Record<FeedbackTone, string> = {
  soft: "## Feedback tone\nWrite the summary in an encouraging, supportive tone. Lead with genuine strengths before improvements. Keep critiques constructive and solution-focused — never harsh or discouraging.",
  balanced: "## Feedback tone\nWrite the summary in a balanced, professional tone. Acknowledge clear strengths and call out gaps directly but fairly.",
  direct: "## Feedback tone\nWrite the summary in a direct, no-nonsense tone. Lead with the most critical gap immediately. Be specific and blunt — the learner needs unvarnished truth to improve quickly.",
};

function buildScoringSystem(tone: FeedbackTone = "balanced"): string {
  return [
    "You are a senior sales coach reviewing a recorded training roleplay between a learner (the sales rep) and a persona played by an actor.",
    "Your job is to grade the LEARNER honestly so they can improve. Lazy scoring (everything 80+) wastes the learner's time.",
    "",
    "## Scoring scale — calibrate against this anchor",
    "  95–100  Top 5%. Textbook execution; cite a specific move.",
    "  85–94   Strong. A clear example to learn from.",
    "  70–84   Solid average rep. Hit the criterion but with gaps.",
    "  55–69   Attempted, inconsistent. Read about it but didn't internalize.",
    "  35–54   Significant gap. Aware of the concept, executed poorly.",
    "  15–34   Missing or counterproductive. Made things worse on this axis.",
    "   0–14   Absent or actively damaged the relationship.",
    "Most real-world dev sessions land 50–75. Reserve 85+ for genuinely strong performance you'd show another rep as an example.",
    "",
    "## Scoring rules",
    "- Score each rubric criterion against its own description — not against your impression of the call overall. A great opener with a botched close is rapport=90, next_step=25, not both 65.",
    "- Score both COMMISSION (what they did wrong) and OMISSION (what they should have done but didn't). A missed BANT axis = low qualification score, even if they were charming.",
    "- The persona's tone is context, not a grade. A learner who handled a polite buyer well isn't automatically excellent; one who got shut down by a hostile buyer isn't automatically poor.",
    "",
    "## Evidence requirements",
    "- strong_skills and weak_skills must reference a specific move. Use action verbs and concrete objects.",
    "  GOOD:  'Mirrored Priya's time pressure', 'Skipped budget question'",
    "  BAD:   'Good listener', 'Has presence', 'Needs to listen more'",
    "- summary: 2–3 sentences. Open with the single highest-leverage thing to fix. Cite at least one turn by paraphrasing (e.g. 'when you asked about success in 90 days...'). End with one concrete next-call action, not a platitude.",
    "",
    "## Consistency check before you submit",
    "- If your summary is critical, your rubric scores should reflect it (no 80+ averages with a critical summary).",
    "- If your summary is positive, the rubric should support it (no 50s with 'great job').",
    "- weak_skills must map to at least one rubric criterion you scored below 70.",
    "",
    TONE_INSTRUCTIONS[tone],
    "",
    "Always submit via the submit_score tool. Never write prose outside the tool call.",
  ].join("\n");
}

function buildScoringUser(
  transcript: TranscriptTurn[],
  rubric: RubricShape,
  persona: string,
  scenario: string,
): string {
  const rubricLines = rubric.criteria
    .map(
      (c) =>
        `- ${c.id} (weight ${(c.weight * 100).toFixed(0)}%) — ${c.label}\n   Definition: ${c.description}`,
    )
    .join("\n");

  // Number turns so the model can cite "turn 3" etc in the summary.
  const transcriptLines = transcript
    .map((t, i) => {
      const speaker = t.role === "persona" ? "Persona" : "Learner";
      return `[Turn ${i + 1} · ${speaker}] ${t.content}`;
    })
    .join("\n");

  const learnerTurns = transcript.filter((t) => t.role === "learner").length;
  const lengthNote =
    learnerTurns <= 2
      ? "Note: the learner only spoke a couple of times. Don't inflate scores to be 'fair' — short sessions naturally lack evidence on several criteria; score those lower."
      : "";

  return [
    "## Persona (played by the actor)",
    persona,
    "",
    "## Scenario",
    scenario,
    "",
    "## Rubric",
    rubricLines,
    "",
    "## Transcript",
    transcriptLines,
    "",
    lengthNote,
    "Score the learner's performance now. Apply the scoring scale and evidence rules strictly. Use the submit_score tool.",
  ]
    .filter(Boolean)
    .join("\n");
}

// ───────────── Main ─────────────

export async function scoreSession(args: {
  transcript: TranscriptTurn[];
  rubric: RubricShape;
  persona: string;
  scenario: string;
  feedbackTone?: FeedbackTone;
}): Promise<ScoreResult | null> {
  const { transcript, rubric, persona, scenario, feedbackTone = "balanced" } = args;

  if (transcript.length < 2) return null; // Nothing to score.

  // Build a JSON schema for rubric_scores so Claude returns the exact keys.
  const rubricScoreSchema = {
    type: "object" as const,
    description: "Score 0–100 for each rubric criterion, keyed by criterion id.",
    properties: Object.fromEntries(
      rubric.criteria.map((c) => [
        c.id,
        { type: "number", minimum: 0, maximum: 100, description: c.label },
      ]),
    ),
    required: rubric.criteria.map((c) => c.id),
    additionalProperties: false,
  };

  try {
    const ai = await getAIConfig();
    const result = await anthropic.messages.create({
      model: ai.fastModel,
      max_tokens: 1024,
      system: buildScoringSystem(feedbackTone),
      tools: [
        {
          name: "submit_score",
          description:
            "Submit the structured evaluation of the learner's performance.",
          input_schema: {
            type: "object",
            properties: {
              rubric_scores: rubricScoreSchema,
              strong_skills: {
                type: "array",
                items: { type: "string" },
                maxItems: 4,
              },
              weak_skills: {
                type: "array",
                items: { type: "string" },
                maxItems: 4,
              },
              summary: {
                type: "string",
                description: "2–3 sentence coaching summary.",
              },
            },
            required: [
              "rubric_scores",
              "strong_skills",
              "weak_skills",
              "summary",
            ],
          },
        },
      ],
      tool_choice: { type: "tool", name: "submit_score" },
      messages: [
        {
          role: "user",
          content: buildScoringUser(transcript, rubric, persona, scenario),
        },
      ],
    });

    const toolUse = result.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return null;

    const parsed = ScoreResultSchema.safeParse(toolUse.input);
    if (!parsed.success) return null;

    // Weighted overall.
    const overall = Math.round(
      rubric.criteria.reduce((acc, c) => {
        const s = parsed.data.rubric_scores[c.id] ?? 0;
        return acc + s * c.weight;
      }, 0),
    );

    return { ...parsed.data, overall };
  } catch {
    return null;
  }
}
