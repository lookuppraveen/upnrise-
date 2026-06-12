// Template picker for the "What would you like to create today?" modal.
//
// Opens from the "Use Template" button on AddModuleModal. Each card is a
// pre-baked training kit (prompt + per-type counts) so the admin can
// drop a sensible set of modules into a training in one click and then
// hit Generate.

"use client";

import { useEffect } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export type TrainingTemplateCounts = {
  roleplay: number;
  quiz: number;
  gamified: number;
  evaluation_module: number;
  evaluation: number;
  whatsapp_mcq: number;
};

export type TrainingTemplate = {
  id: string;
  title: string;
  category: string;
  summary: string;
  prompt: string;
  counts: TrainingTemplateCounts;
};

const ZERO: TrainingTemplateCounts = {
  roleplay: 0,
  quiz: 0,
  gamified: 0,
  evaluation_module: 0,
  evaluation: 0,
  whatsapp_mcq: 0,
};

export const TRAINING_TEMPLATES: TrainingTemplate[] = [
  {
    id: "sales-onboarding",
    title: "Sales Onboarding Kit",
    category: "Sales",
    summary: "2 roleplays + 10-question assessment + 1 gamified drill",
    prompt:
      "A 30-day sales onboarding for new account executives. Cover ICP, discovery questions, objection handling on price and timing, and a closing motion. Use our product knowledge base for context.",
    counts: { ...ZERO, roleplay: 2, quiz: 10, gamified: 1 },
  },
  {
    id: "support-bootcamp",
    title: "Customer Support Bootcamp",
    category: "Support",
    summary: "2 roleplays + 8-question assessment + 5 WhatsApp MCQs",
    prompt:
      "A customer support bootcamp for new agents. Cover de-escalation, refund policy edges, escalation paths, and tone. Pull from the support runbook and refund policy in the knowledge base.",
    counts: { ...ZERO, roleplay: 2, quiz: 8, whatsapp_mcq: 5 },
  },
  {
    id: "product-refresh",
    title: "Product Knowledge Refresh",
    category: "Enablement",
    summary: "1 roleplay + 15-question assessment",
    prompt:
      "A quarterly product knowledge refresher. Cover the latest release notes, top FAQs, and competitor positioning. Test recall and applied judgement, not just memorization.",
    counts: { ...ZERO, roleplay: 1, quiz: 15 },
  },
  {
    id: "manager-coaching",
    title: "Manager Coaching Track",
    category: "Leadership",
    summary: "3 roleplays + 5-question assessment",
    prompt:
      "A coaching track for first-time managers. Cover giving difficult feedback, 1:1 structure, prioritization conversations with skip-levels, and conflict mediation between reports.",
    counts: { ...ZERO, roleplay: 3, quiz: 5 },
  },
  {
    id: "compliance-refresher",
    title: "Compliance Refresher",
    category: "Compliance",
    summary: "20-question assessment + 1 evaluation module",
    prompt:
      "Annual compliance refresher covering data handling, harassment policy, and incident reporting. Questions should test applied judgement on edge cases, not just policy recall.",
    counts: { ...ZERO, quiz: 20, evaluation_module: 1 },
  },
  {
    id: "cold-call-drills",
    title: "Cold Call Drill Pack",
    category: "Sales",
    summary: "3 roleplays + 5-question assessment",
    prompt:
      "Repetitive cold-call practice for outbound SDRs. Vary the prospect persona — busy VP, gatekeeper, warm-but-skeptical director. Drill the 15-second opener and first-objection handling.",
    counts: { ...ZERO, roleplay: 3, quiz: 5 },
  },
];

export function TrainingTemplatePickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (template: TrainingTemplate) => void;
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
      className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Choose a training template"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-bg border border-border rounded-[14px] w-full max-w-[920px] my-4 shadow-xl flex flex-col max-h-[92vh]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border gap-3">
          <div>
            <h2 className="text-[18px] font-semibold text-ink">
              Choose a training template
            </h2>
            <p className="text-[11.5px] text-ink-3 mt-0.5">
              Picks set the prompt and module counts. You can adjust both
              before generating.
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
          {TRAINING_TEMPLATES.map((t) => (
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
              <div className="text-[12px] text-ink-2 mb-2 font-semibold">
                {t.summary}
              </div>
              <div className="text-[11.5px] text-ink-3 leading-relaxed line-clamp-3">
                {t.prompt}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
