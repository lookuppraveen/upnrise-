// Per-module edit page router.
//
// Routes one of the type-specific editors based on m.type + (for
// Document storage) body.kind. Every ModuleType has a dedicated
// editor now — Roleplay, Video, Document, Coach (kind=coach),
// Scorm (kind=scorm), Quiz/Assessment, Gamified/Activity, Evaluation.
// `hasDefaultVideoProvider` is accepted for the route's existing
// query shape but isn't read here anymore — VideoModuleEditor owns
// its own provider logic.

"use client";

import type { ModuleType } from "@prisma/client";
import type { SavedPortrait } from "@/components/admin/DidPortraitPickerModal";
import { RoleplayModuleEditor } from "@/components/admin/RoleplayModuleEditor";
import { VideoModuleEditor } from "@/components/admin/VideoModuleEditor";
import { DocumentModuleEditor } from "@/components/admin/DocumentModuleEditor";
import { EvaluationModuleEditor } from "@/components/admin/EvaluationModuleEditor";
import { ScormModuleEditor } from "@/components/admin/ScormModuleEditor";
import { CoachModuleEditor } from "@/components/admin/CoachModuleEditor";
import { GamifiedModuleEditor } from "@/components/admin/GamifiedModuleEditor";
import { AssessmentModuleEditor } from "@/components/admin/AssessmentModuleEditor";
import { NarrationModuleEditor } from "@/components/admin/NarrationModuleEditor";

export type EditableModuleForPage = {
  id: string;
  name: string;
  type: ModuleType;
  published: boolean;
  aiScore: number | null;
  updatedAt: Date;
  body: Record<string, unknown> | null;
  roleplayConfig: { persona: string; scenario: string } | null;
};

export function ModuleEditPage({
  trainingId,
  trainingTitle,
  module: m,
  hasDefaultVideoProvider: _hasDefaultVideoProvider,
  tenantStreamingProvider = null,
  savedPortraits = [],
}: {
  trainingId: string;
  trainingTitle: string;
  module: EditableModuleForPage;
  hasDefaultVideoProvider: boolean;
  tenantStreamingProvider?: {
    kind: string;
    supportsStreaming: boolean;
  } | null;
  savedPortraits?: SavedPortrait[];
}) {
  if (m.type === "roleplay") {
    return (
      <div className="max-w-[960px] mx-auto px-6 py-8">
        <RoleplayModuleEditor
          trainingId={trainingId}
          trainingTitle={trainingTitle}
          moduleId={m.id}
          initialName={m.name}
          initialPublished={m.published}
          body={m.body}
          roleplayConfig={m.roleplayConfig}
          savedPortraits={savedPortraits}
          tenantStreamingProvider={tenantStreamingProvider}
        />
      </div>
    );
  }
  if (m.type === "video") {
    return (
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        <VideoModuleEditor
          trainingId={trainingId}
          trainingTitle={trainingTitle}
          moduleId={m.id}
          initialName={m.name}
          initialPublished={m.published}
          body={m.body}
        />
      </div>
    );
  }
  // Document is the storage type for four distinct surfaces — real
  // Document modules, Coach (body.kind=coach), Scorm
  // (body.kind=scorm), and Narration (body.kind=narration). Branch by
  // the marker before falling through to the standard Document editor.
  if (m.type === "document") {
    const kind =
      m.body && typeof m.body === "object" && !Array.isArray(m.body)
        ? (m.body as Record<string, unknown>).kind
        : null;
    if (kind === "narration") {
      return (
        <div className="max-w-[1100px] mx-auto px-6 py-8">
          <NarrationModuleEditor
            trainingId={trainingId}
            trainingTitle={trainingTitle}
            moduleId={m.id}
            initialName={m.name}
            initialPublished={m.published}
            body={m.body}
          />
        </div>
      );
    }
    if (kind === "scorm") {
      return (
        <div className="max-w-[1100px] mx-auto px-6 py-8">
          <ScormModuleEditor
            trainingId={trainingId}
            trainingTitle={trainingTitle}
            moduleId={m.id}
            initialName={m.name}
            initialPublished={m.published}
            body={m.body}
          />
        </div>
      );
    }
    if (kind === "coach") {
      return (
        <div className="max-w-[1100px] mx-auto px-6 py-8">
          <CoachModuleEditor
            trainingId={trainingId}
            trainingTitle={trainingTitle}
            moduleId={m.id}
            initialName={m.name}
            initialPublished={m.published}
            body={m.body}
          />
        </div>
      );
    }
    return (
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        <DocumentModuleEditor
          trainingId={trainingId}
          trainingTitle={trainingTitle}
          moduleId={m.id}
          initialName={m.name}
          initialPublished={m.published}
          body={m.body}
        />
      </div>
    );
  }
  if (m.type === "evaluation") {
    return (
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        <EvaluationModuleEditor
          trainingId={trainingId}
          trainingTitle={trainingTitle}
          moduleId={m.id}
          initialName={m.name}
          initialPublished={m.published}
          body={m.body}
        />
      </div>
    );
  }
  if (m.type === "quiz") {
    return (
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        <AssessmentModuleEditor
          trainingId={trainingId}
          trainingTitle={trainingTitle}
          moduleId={m.id}
          initialName={m.name}
          initialPublished={m.published}
          body={m.body}
        />
      </div>
    );
  }
  if (m.type === "gamified") {
    return (
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        <GamifiedModuleEditor
          trainingId={trainingId}
          trainingTitle={trainingTitle}
          moduleId={m.id}
          initialName={m.name}
          initialPublished={m.published}
          body={m.body}
        />
      </div>
    );
  }
  // Unreachable — every ModuleType variant is handled above. Surfaced
  // as a friendly fallback in case the enum gains a new value before
  // the editor lands.
  const _exhaustive: never = m.type;
  return (
    <div className="max-w-[640px] mx-auto px-6 py-12 text-center">
      <p className="text-[13px] text-ink-3">
        No editor wired for module type{" "}
        <code className="font-mono text-ink">{String(_exhaustive)}</code>.
      </p>
    </div>
  );
}
