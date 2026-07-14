// Standard evaluation criteria library. The admin editor's multi-select
// dropdown reads from this list so tenants pick from a curated, HR-ready
// vocabulary instead of typing free-text labels that drift across
// modules and hurt cross-training reports.
//
// Extending the library:
//   Append entries below. IDs are stable, human-readable slugs (used as
//   the criterion id in module.body.evaluationCriteria AND in the
//   runtime rubric on RoleplayConfig). Never renumber or reuse an id —
//   saved modules reference it. The description flows into the AI
//   scorer as "how to interpret this criterion".

export type StandardCriterion = {
  id: string;
  label: string;
  description: string;
  // Canonical checklist-item suggestions for this criterion. The admin
  // editor renders these as one-click "add" pills under each selected
  // criterion so admins don't have to type from a blank slate. Keep
  // each item short, observable, and behaviour-anchored ("did they X")
  // — that's what the AI scorer matches against and what the trainee
  // sees as coach cards when the item is marked visible.
  suggestedItems: string[];
};

export const STANDARD_CRITERIA: StandardCriterion[] = [
  {
    id: "communication_skills",
    label: "Communication Skills",
    description:
      "Clear articulation, active listening, and appropriate register for the audience.",
    suggestedItems: [
      "Used clear, jargon-free language appropriate for the audience",
      "Confirmed understanding before moving on",
      "Structured responses with a clear beginning, middle, and end",
      "Adjusted tone and pace to the listener",
      "Listened without interrupting and reflected key points back",
    ],
  },
  {
    id: "technical_knowledge",
    label: "Technical Knowledge",
    description:
      "Depth and accuracy of role-relevant technical concepts and terminology.",
    suggestedItems: [
      "Used correct technical terminology",
      "Explained underlying concepts, not just surface features",
      "Cited concrete examples or prior work",
      "Acknowledged limits of knowledge honestly",
      "Connected technical detail to business impact",
    ],
  },
  {
    id: "problem_solving",
    label: "Problem Solving",
    description:
      "Breaks problems down, evaluates trade-offs, and reaches a workable solution.",
    suggestedItems: [
      "Restated the problem in own words before solving",
      "Broke the problem into smaller sub-problems",
      "Considered at least two approaches before committing",
      "Named trade-offs of the chosen approach",
      "Verified the solution against the original requirement",
    ],
  },
  {
    id: "analytical_thinking",
    label: "Analytical Thinking",
    description:
      "Reasons from evidence, spots patterns, and separates signal from noise.",
    suggestedItems: [
      "Used data or examples to back up claims",
      "Identified the root cause rather than a symptom",
      "Distinguished correlation from causation",
      "Highlighted assumptions and tested them",
      "Summarised findings in a structured way",
    ],
  },
  {
    id: "coding_skills",
    label: "Coding Skills",
    description:
      "Writes correct, readable, well-structured code and explains it clearly.",
    suggestedItems: [
      "Wrote code that compiled/ran without obvious errors",
      "Used meaningful names for variables and functions",
      "Handled edge cases (empty input, nulls, overflow)",
      "Explained time/space complexity of the solution",
      "Refactored or improved code when asked",
    ],
  },
  {
    id: "system_design",
    label: "System Design",
    description:
      "Designs components, data flows, and scaling strategies fit for the requirements.",
    suggestedItems: [
      "Clarified functional and non-functional requirements",
      "Identified the main components and their interactions",
      "Justified data storage and access patterns",
      "Considered scale, latency, and failure modes",
      "Called out trade-offs of the design",
    ],
  },
  {
    id: "leadership",
    label: "Leadership",
    description:
      "Sets direction, delegates, and drives outcomes without over-controlling.",
    suggestedItems: [
      "Framed a clear direction or outcome",
      "Delegated work to appropriate people",
      "Held self and others accountable",
      "Coached rather than dictated",
      "Made a decision under uncertainty and communicated why",
    ],
  },
  {
    id: "teamwork",
    label: "Teamwork",
    description:
      "Contributes to shared goals, listens to peers, and shares credit.",
    suggestedItems: [
      "Acknowledged contributions of others",
      "Built on peers' ideas instead of overriding",
      "Disagreed constructively without personalising",
      "Volunteered to help unblock a teammate",
      "Kept the shared goal in view over personal credit",
    ],
  },
  {
    id: "collaboration",
    label: "Collaboration",
    description:
      "Coordinates across roles and functions to reach a joint outcome.",
    suggestedItems: [
      "Clarified roles and responsibilities upfront",
      "Adapted communication to a non-expert audience",
      "Sought input from the right stakeholders",
      "Summarised agreements and next steps",
      "Followed up on cross-team commitments",
    ],
  },
  {
    id: "confidence",
    label: "Confidence",
    description:
      "Speaks with conviction, holds a position under scrutiny, admits gaps honestly.",
    suggestedItems: [
      "Spoke with steady pace and volume",
      "Held eye contact / stayed engaged under challenge",
      "Defended a position with evidence",
      "Admitted uncertainty instead of bluffing",
      "Recovered composure after a tough question",
    ],
  },
  {
    id: "professionalism",
    label: "Professionalism",
    description:
      "Behaves respectfully, honors commitments, and represents the org well.",
    suggestedItems: [
      "Was on time / ready at the start",
      "Used respectful language throughout",
      "Kept confidential information appropriately private",
      "Followed through on commitments made in the conversation",
      "Represented the organisation's values in behaviour",
    ],
  },
  {
    id: "decision_making",
    label: "Decision Making",
    description:
      "Chooses well under uncertainty, states rationale, revises when new data arrives.",
    suggestedItems: [
      "Weighed multiple options before deciding",
      "Stated the decision clearly and its rationale",
      "Set a timeline or decision point rather than deferring",
      "Revised the decision when new evidence emerged",
      "Communicated impact of the decision to stakeholders",
    ],
  },
  {
    id: "creativity",
    label: "Creativity",
    description:
      "Generates novel, useful ideas beyond the obvious first solution.",
    suggestedItems: [
      "Offered a non-obvious approach",
      "Combined ideas from different domains",
      "Reframed the problem to reveal a new angle",
      "Prototyped or sketched an idea quickly",
      "Balanced novelty with feasibility",
    ],
  },
  {
    id: "learning_ability",
    label: "Learning Ability",
    description:
      "Absorbs new information quickly and applies it in later turns.",
    suggestedItems: [
      "Asked focused clarifying questions",
      "Correctly applied new information later in the conversation",
      "Connected new info to prior knowledge",
      "Adjusted approach after receiving feedback",
      "Summarised what was learned",
    ],
  },
  {
    id: "adaptability",
    label: "Adaptability",
    description: "Adjusts approach when context, priorities, or feedback change.",
    suggestedItems: [
      "Shifted approach when the scenario changed",
      "Accepted feedback without defensiveness",
      "Prioritised differently when new information arrived",
      "Stayed effective under time pressure",
      "Recovered from a mistake and moved forward",
    ],
  },
  {
    id: "time_management",
    label: "Time Management",
    description:
      "Uses available time deliberately; prioritizes high-impact items.",
    suggestedItems: [
      "Set a rough plan for the time available",
      "Prioritised high-impact tasks first",
      "Avoided rabbit-holes on low-value details",
      "Wrapped up sections rather than trailing off",
      "Left time to review or close out",
    ],
  },
  {
    id: "domain_knowledge",
    label: "Domain Knowledge",
    description:
      "Understands the customer, industry, and product context relevant to the scenario.",
    suggestedItems: [
      "Referenced customer / industry-specific realities",
      "Used the domain's own vocabulary correctly",
      "Anticipated common objections in the domain",
      "Connected the scenario to relevant regulations or norms",
      "Cited a comparable case or precedent",
    ],
  },
  {
    id: "customer_focus",
    label: "Customer Focus",
    description:
      "Puts the customer's outcome first; validates needs before proposing.",
    suggestedItems: [
      "Asked open questions to surface the customer's real need",
      "Confirmed the need before proposing a solution",
      "Framed the solution in customer benefit, not features",
      "Handled objections without becoming defensive",
      "Agreed a concrete next step with the customer",
    ],
  },
  {
    id: "presentation_skills",
    label: "Presentation Skills",
    description:
      "Organizes the message, uses appropriate structure, and holds attention.",
    suggestedItems: [
      "Opened with a clear hook or context",
      "Followed a logical structure the listener could follow",
      "Used concrete examples to illustrate points",
      "Managed pace, pauses, and emphasis",
      "Closed with a clear ask or next step",
    ],
  },
  {
    id: "attention_to_detail",
    label: "Attention to Detail",
    description:
      "Catches errors, respects specifics, and follows through on small commitments.",
    suggestedItems: [
      "Referenced specific numbers, names, or dates correctly",
      "Caught an inconsistency in the scenario",
      "Noted a constraint others missed",
      "Followed a stated format or template",
      "Double-checked before committing",
    ],
  },
  {
    id: "critical_thinking",
    label: "Critical Thinking",
    description:
      "Challenges assumptions, evaluates evidence, and identifies weak arguments.",
    suggestedItems: [
      "Surfaced an unstated assumption",
      "Distinguished evidence from opinion",
      "Considered the opposite view fairly",
      "Identified a flaw in a proposed plan",
      "Reached a well-supported conclusion",
    ],
  },
  {
    id: "ownership",
    label: "Ownership",
    description:
      "Takes responsibility end-to-end rather than deflecting or waiting for instruction.",
    suggestedItems: [
      "Took the outcome as personally theirs",
      "Named who owns each next step",
      "Did not deflect blame when something went wrong",
      "Followed up without being asked",
      "Closed the loop with a stakeholder",
    ],
  },
  {
    id: "initiative",
    label: "Initiative",
    description:
      "Acts proactively; identifies opportunities and moves without being told.",
    suggestedItems: [
      "Suggested an improvement beyond what was asked",
      "Started work without waiting for full instruction",
      "Spotted an opportunity to help",
      "Removed an obstacle for someone else",
      "Volunteered for stretch work",
    ],
  },
  {
    id: "cultural_fit",
    label: "Cultural Fit",
    description:
      "Behaviors and values align with the team's operating norms.",
    suggestedItems: [
      "Demonstrated the team's stated values in behaviour",
      "Collaborated in the team's preferred style",
      "Gave and received feedback in the expected way",
      "Respected team norms around communication",
      "Handled disagreement in a culture-consistent way",
    ],
  },
  {
    id: "overall_performance",
    label: "Overall Performance",
    description:
      "Holistic assessment across the criteria above.",
    suggestedItems: [
      "Delivered a coherent overall result",
      "Balanced strengths across multiple criteria",
      "Maintained quality from start to finish",
      "Left the counterpart with a clear sense of progress",
      "Demonstrated readiness for the real scenario",
    ],
  },
];

const STANDARD_INDEX = new Map(
  STANDARD_CRITERIA.map((c) => [c.id, c] as const),
);

export function lookupStandardCriterion(
  id: string,
): StandardCriterion | undefined {
  return STANDARD_INDEX.get(id);
}

export function isStandardCriterionId(id: string): boolean {
  return STANDARD_INDEX.has(id);
}

// Stable slug used when the admin adds a custom (off-library) criterion.
// Prefixed with `custom_` so it can never collide with a library id.
export function makeCustomCriterionId(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  const rand = Math.random().toString(36).slice(2, 6);
  return `custom_${slug || "criterion"}_${rand}`;
}
