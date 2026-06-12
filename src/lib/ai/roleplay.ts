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

/** Hard cap on transcript turns to keep prompts cheap + sessions sane. */
export const MAX_TRANSCRIPT_TURNS = 40;

export function buildSystemPrompt(
  cfg: RoleplayConfigShape,
  opts?: {
    idealConversation?: string | null;
    followIdealConversation?: boolean;
    endRoleplayBy?: "ai" | "user" | "either";
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
  return transcript
    .slice(-MAX_TRANSCRIPT_TURNS)
    .map((t) => ({
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
