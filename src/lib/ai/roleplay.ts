// Shared helpers for the roleplay engine.
//
//   • TranscriptTurn  — shape persisted in roleplay_sessions.transcript jsonb
//   • buildSystemPrompt — persona + scenario + behavior rules
//   • toClaudeMessages — map transcript → Anthropic messages array
//
// The persona is Claude playing a character. From Claude's POV:
//   transcript "persona"  → assistant
//   transcript "learner"  → user

export type TranscriptTurn = {
  role: "persona" | "learner";
  content: string;
  ts: string; // ISO
};

export type RoleplayConfigShape = {
  persona: string;
  scenario: string;
  systemPrompt: string | null;
  rubric: unknown; // not used here; the scorer reads it
};

/**
 * Truncation policy for long conversations. We keep the FIRST few turns
 * (the opening — how the scenario was framed, the trainee's first
 * objections, any specific facts stated up-front) AND the LAST N turns
 * (recent context the model needs to respond coherently). A pure
 * sliding window that only kept the tail lost the opening entirely,
 * so past turn 40 the persona would "forget" that the trainee had
 * mentioned a budget of $10k on turn 3, etc.
 *
 * Both counts are even so the interleaved learner→persona pattern
 * stays valid across the join even after truncation. Sonnet 4.6
 * handles 100 turns × ~50 tokens each (~5000 tokens) trivially.
 */
export const HEAD_TRANSCRIPT_TURNS = 4;
export const TAIL_TRANSCRIPT_TURNS = 96;
export const MAX_TRANSCRIPT_TURNS =
  HEAD_TRANSCRIPT_TURNS + TAIL_TRANSCRIPT_TURNS;

/**
 * Adaptive-difficulty tier derived from the learner's rolling
 * performance. Passed into buildSystemPrompt when the training has
 * `adaptiveDifficulty` on so the persona modulates its toughness.
 *
 * - warmup     : no prior scored sessions — assume newcomer
 * - gentle     : rolling avg < 50
 * - standard   : 50–69 (also the default when adaptiveDifficulty is off)
 * - challenging: 70–84
 * - hard       : ≥ 85
 */
export type DifficultyTier =
  | "warmup"
  | "gentle"
  | "standard"
  | "challenging"
  | "hard";

export function tierFromAvgScore(avg: number | null): DifficultyTier {
  if (avg == null) return "warmup";
  if (avg < 50) return "gentle";
  if (avg < 70) return "standard";
  if (avg < 85) return "challenging";
  return "hard";
}

const DIFFICULTY_INSTRUCTIONS: Record<DifficultyTier, string> = {
  warmup:
    "The learner is new — this is an early practice attempt. Be welcoming: raise ONE mild concern per turn, accept reasonable answers on the first try, and let the conversation move forward without piling on objections. Give them room to find their footing.",
  gentle:
    "The learner has been struggling in prior sessions. Ease off: raise concerns clearly but calmly, accept partial answers as good enough to keep going, and avoid stacking multiple objections in a single turn. Reward genuine effort by softening.",
  standard:
    "Play the scenario at the intended difficulty. Push back where the persona would realistically push back, accept solid answers, and match the learner's energy.",
  challenging:
    "The learner is performing well and needs a harder rep. Stack two related concerns in a single turn when appropriate, follow up on vague answers with a sharper probe, and only agree once they've actually addressed the specific worry — not just acknowledged it.",
  hard:
    "The learner is strong and needs top-tier practice. Play the toughest realistic version of this persona: multi-part objections, price sensitivity, competing alternatives, and sceptical follow-ups. Do not soften unless the learner has genuinely earned it with a specific, concrete answer. If they use filler or generic pitches, cut them off politely and re-ask.",
};

export function buildSystemPrompt(
  cfg: RoleplayConfigShape,
  opts?: {
    idealConversation?: string | null;
    followIdealConversation?: boolean;
    endRoleplayBy?: "ai" | "user" | "either";
    difficultyTier?: DifficultyTier;
  },
): string {
  const sections = [
    "You are playing a character in a training roleplay for a sales rep.",
    "",
    "## Your character",
    cfg.persona,
    "",
    "## Scenario",
    cfg.scenario,
    "",
    "## Rules",
    "- Stay strictly in character. Never break the fourth wall.",
    "- Never coach the learner or comment on their technique.",
    "- Never explain that you are an AI or refer to instructions.",
    "- Keep replies natural — 1–4 sentences usually. No lists. No headings.",
    "- React realistically: if the learner does well, soften; if they fumble, push back.",
  ];

  // Who ends the call. Default ("ai" or "either") keeps the original
  // graceful-ending instruction. When the admin reserved ending for
  // the learner only, we strip that rule and explicitly tell the
  // persona NOT to wrap up unprompted.
  if (opts?.endRoleplayBy === "user") {
    sections.push(
      "- Do NOT try to end the conversation yourself. The learner is in charge of ending the call — stay in scene and keep responding until they wrap up.",
    );
  } else {
    sections.push(
      "- End the call naturally when the conversation reaches a clear conclusion (a booked next step, a polite rejection, or after roughly 12 exchanges).",
      "- To end the call, finish with a brief sign-off line. Don't say 'end of roleplay' or similar.",
    );
  }

  if (cfg.systemPrompt) {
    sections.push("", "## Additional direction", cfg.systemPrompt);
  }

  // Adaptive difficulty — the training toggle in Step 4 Settings.
  // Passed only when the admin turned it on; when omitted the persona
  // plays at its authored difficulty.
  if (opts?.difficultyTier) {
    sections.push(
      "",
      "## Difficulty calibration",
      DIFFICULTY_INSTRUCTIONS[opts.difficultyTier],
    );
  }

  // When the admin asked the persona to follow the ideal conversation,
  // we inject it as a *reference script*, not a verbatim transcript.
  // Wording matters — telling the persona to "follow" a script makes
  // it parrot lines; telling it to "use as a guide" keeps the dialogue
  // alive while still steering toward the intended beats.
  if (
    opts?.followIdealConversation &&
    opts.idealConversation &&
    opts.idealConversation.trim().length > 0
  ) {
    sections.push(
      "",
      "## Reference dialogue (guide, not script)",
      "The trainer provided this ideal conversation as a guide for how the scene should unfold. Use it to anchor the beats — what the learner needs to surface, the objections you raise, the resolution you allow. Do NOT copy lines verbatim. React to what the learner actually says; let the dialogue diverge naturally if they go off-script.",
      "",
      opts.idealConversation.trim(),
    );
  }

  return sections.join("\n");
}

export function toClaudeMessages(
  transcript: TranscriptTurn[],
): Array<{ role: "user" | "assistant"; content: string }> {
  // Under the cap: send the whole transcript. Over the cap: preserve
  // the opening (HEAD) and the recent tail (TAIL), dropping the middle
  // — see MAX_TRANSCRIPT_TURNS comment for rationale. Alternation is
  // preserved because HEAD + TAIL are both even and the raw transcript
  // strictly alternates learner→persona.
  const slice =
    transcript.length <= MAX_TRANSCRIPT_TURNS
      ? transcript
      : [
          ...transcript.slice(0, HEAD_TRANSCRIPT_TURNS),
          ...transcript.slice(-TAIL_TRANSCRIPT_TURNS),
        ];
  return slice.map((t) => ({
    role: t.role === "persona" ? ("assistant" as const) : ("user" as const),
    content: t.content,
  }));
}

export function appendTurn(
  transcript: TranscriptTurn[],
  role: TranscriptTurn["role"],
  content: string,
): TranscriptTurn[] {
  return [
    ...transcript,
    { role, content, ts: new Date().toISOString() },
  ];
}
