// Template picker for the "Create New Roleplay Module" page.
//
// Opens from the "Use Template" button on CreateRoleplayPage. Each card
// is a fully-fleshed scenario (Person 1, Person 2, Context) so picking
// one fills the form with a runnable brief the admin can tweak before
// hitting Generate or Create Manually.

"use client";

import { useEffect } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export type RoleplayTemplate = {
  id: string;
  title: string;
  category: string;
  person1: string;
  person2: string;
  context: string;
};

export const ROLEPLAY_TEMPLATES: RoleplayTemplate[] = [
  {
    id: "pharma-price-objection",
    title: "Pharma Sales — Price Objection",
    category: "Sales",
    person1: "Pharmaceutical Sales Rep",
    person2: "Skeptical Doctor",
    context: `Create a roleplay between a Pharmaceutical Sales Rep (Human) and a Skeptical Doctor (AI).

Industry / Domain: Pharmaceutical sales (specialty cardiology drug)

Situation:
The rep is visiting a busy cardiologist to pitch a new statin that costs 3x the generic. The doctor is time-poor, has been burned by over-promised efficacy claims before, and is openly skeptical about cost.

Goals for the learner:
- Open with a relevant clinical hook (not a product pitch)
- Acknowledge the cost concern without conceding value
- Cite outcomes data (LDL reduction, MACE outcomes) when challenged
- Secure a follow-up — sample drop, formulary committee intro, or peer-to-peer call

AI behavior:
- Stay polite but pressed for time. Interrupt if the rep rambles.
- Push back hard on price with at least one specific objection ("my patients can't afford it", "the generic works fine").
- Reward clinical evidence; punish marketing-speak.`,
  },
  {
    id: "support-refund-dispute",
    title: "Customer Support — Refund Dispute",
    category: "Support",
    person1: "Customer Support Agent",
    person2: "Frustrated Customer",
    context: `Create a roleplay between a Customer Support Agent (Human) and a Frustrated Customer (AI).

Industry / Domain: SaaS / consumer subscription

Situation:
The customer was auto-renewed for an annual plan two weeks ago and didn't notice until today. Company policy allows refunds within 7 days. The customer is escalating and threatening to chargeback + post on social media.

Goals for the learner:
- De-escalate the emotional charge before discussing policy
- Acknowledge the frustration explicitly and own the experience
- Offer the policy boundary clearly without being defensive
- Find a creative middle path (partial credit, pro-rated refund, plan downgrade)

AI behavior:
- Start angry. Use short sentences and reference past good experiences with the product.
- Drop the threats only after genuine acknowledgement (not a scripted apology).
- Accept a fair middle-path offer; reject anything that sounds like a deflection.`,
  },
  {
    id: "b2b-discovery",
    title: "B2B Discovery Call",
    category: "Sales",
    person1: "SDR",
    person2: "VP of Engineering",
    context: `Create a roleplay between an SDR (Human) and a VP of Engineering (AI).

Industry / Domain: B2B SaaS (developer tooling — code review automation)

Situation:
The SDR booked a 20-minute discovery call after a cold outreach. The VP took the call out of mild curiosity but has not bought into the problem yet. The SDR has never spoken to them before and has 20 minutes to qualify (BANT or MEDDIC fits).

Goals for the learner:
- Open with context, not a pitch ("Here's why I reached out specifically")
- Ask open-ended discovery questions about current workflow & pain
- Quantify pain (PR review latency, engineer hours, deploy frequency)
- Identify decision process — who else needs to weigh in?
- Land a concrete next step (demo, pilot scope, or stakeholder loop-in)

AI behavior:
- Give terse answers until the SDR earns more depth with a good question
- Volunteer a real but secondary pain point if asked "what's frustrating today?"
- Push back if the SDR pitches before discovering`,
  },
  {
    id: "saas-cold-call",
    title: "Cold Call — SaaS Outbound",
    category: "Sales",
    person1: "Account Executive",
    person2: "Marketing Director",
    context: `Create a roleplay between an Account Executive (Human) and a Marketing Director (AI).

Industry / Domain: B2B SaaS (marketing attribution platform)

Situation:
First-touch cold call. The AE has 30 seconds to earn another 60 seconds. The Marketing Director is between meetings and answered by accident.

Goals for the learner:
- Pattern-interrupt the "I'm not interested" reflex
- State a specific, prospect-relevant reason for the call in under 15 seconds
- Use a permission-based opener ("Mind if I take 30 seconds to explain why I called?")
- Handle the first objection without arguing
- Close to a calendar slot, not "more info via email"

AI behavior:
- Default response is "Not interested, send me an email"
- Soften only if the AE references something specific about the company
- Probe with one real question before agreeing to a meeting`,
  },
  {
    id: "behavioral-interview",
    title: "Job Interview — Behavioral",
    category: "Coaching",
    person1: "Candidate",
    person2: "Hiring Manager",
    context: `Create a roleplay between a Candidate (Human) and a Hiring Manager (AI).

Industry / Domain: Tech / People management

Situation:
Final-round behavioral interview for a Senior Product Manager role. The hiring manager has 45 minutes and is probing for ownership, conflict resolution, and prioritization stories.

Goals for the learner:
- Structure answers using STAR (Situation, Task, Action, Result)
- Quantify outcomes with real metrics
- Show self-awareness when discussing failure or conflict
- Ask thoughtful questions about the role/team at the end

AI behavior:
- Ask 3 behavioral questions: a hard prioritization call, a conflict with engineering, and a failure they own
- Probe with follow-ups ("What would you do differently?", "How did your team react?")
- Stay neutral — don't give cues about whether the answer is landing`,
  },
  {
    id: "manager-feedback",
    title: "Difficult Feedback — Manager Coaching",
    category: "Coaching",
    person1: "Engineering Manager",
    person2: "Underperforming Engineer",
    context: `Create a roleplay between an Engineering Manager (Human) and an Underperforming Engineer (AI).

Industry / Domain: Tech / People management

Situation:
1:1 conversation. The engineer has missed two sprint commitments and the quality of their PRs has dropped. They are well-liked on the team and the manager has avoided the conversation for too long. This is the first explicit performance conversation.

Goals for the learner:
- Open with care but not preamble — name the gap directly
- Use specific examples, not vague characterizations
- Separate behavior from identity ("the work has slipped" not "you're slipping")
- Listen for what's underneath (workload, scope confusion, life events)
- Land a concrete 30-day plan with measurable checkpoints

AI behavior:
- Start defensive — explain the misses with context (unclear specs, blocked on review)
- Soften if the manager listens before prescribing
- Reveal a real underlying cause only after being heard (burnout, family situation, or scope mismatch)`,
  },
];

export function RoleplayTemplatePickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (template: RoleplayTemplate) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Choose a roleplay template"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-bg border border-border rounded-[14px] w-full max-w-[920px] my-4 shadow-xl flex flex-col max-h-[92vh]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border gap-3">
          <div>
            <h2 className="text-[18px] font-semibold text-ink">
              Choose a template
            </h2>
            <p className="text-[11.5px] text-ink-3 mt-0.5">
              Picks fill Person 1, Person 2, and the brief. You can edit
              everything afterwards.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-3 hover:text-ink text-[20px] leading-none px-1"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 grid gap-3 md:grid-cols-2">
          {ROLEPLAY_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t)}
              className={cn(
                "text-left bg-surface border border-border rounded-[12px] p-4 transition-colors",
                "hover:border-accent hover:bg-accent-pale/20 focus:outline-none focus:border-accent",
              )}
            >
              <div className="flex items-start gap-3 mb-2">
                <div
                  className="w-9 h-9 grid place-items-center rounded-md text-white shrink-0"
                  style={{ background: "var(--ai-grad, #7c5cd6)" }}
                  aria-hidden
                >
                  <Icon name="layers" size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold text-ink truncate">
                    {t.title}
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-3 font-semibold">
                    {t.category}
                  </div>
                </div>
              </div>
              <div className="text-[12px] text-ink-2 mb-2">
                <span className="font-semibold text-ink">{t.person1}</span>
                <span className="text-ink-3"> × </span>
                <span className="font-semibold text-ink">{t.person2}</span>
              </div>
              <div className="text-[11.5px] text-ink-3 leading-relaxed line-clamp-3 whitespace-pre-wrap">
                {firstParagraph(t.context)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function firstParagraph(text: string): string {
  const lines = text.split("\n");
  const situationIdx = lines.findIndex((l) => /^Situation:/i.test(l.trim()));
  if (situationIdx >= 0) {
    const after = lines.slice(situationIdx + 1);
    return after.find((l) => l.trim().length > 0) ?? "";
  }
  return lines.find((l) => l.trim().length > 0) ?? "";
}
