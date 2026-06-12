// Trainee · Module Detail
//
// Universal type-aware module player. Routes to the right section by
// ModuleType + (for Document storage) body.kind, so every module
// shape an admin can author has a trainee surface that reads it:
//
//   video        → VideoSection
//   roleplay     → redirect to /play (dedicated player)
//   quiz         → QuizSection (real questions[] → QuizPlayer)
//   document     → DocumentSection (body.documents[] list)
//     body.kind=coach → CoachSection (outline + guidance preview)
//     body.kind=scorm → ScormSection (zip launch / download)
//   gamified     → ActivitySection (description + exercises walkthrough)
//   evaluation   → EvaluationSection (settings preview + start button)

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import type { ModuleType } from "@prisma/client";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { QuizPlayer } from "@/components/learn/QuizPlayer";
import { CompleteButton } from "@/components/learn/CompleteButton";

const ICON_BY_TYPE: Record<ModuleType, IconName> = {
  video: "play",
  roleplay: "mic",
  quiz: "clipboard",
  document: "book",
  gamified: "trophy",
  evaluation: "wand",
};

const LABEL_BY_TYPE: Record<ModuleType, string> = {
  video: "Video",
  roleplay: "Roleplay",
  quiz: "Knowledge check",
  document: "Document",
  gamified: "Activity",
  evaluation: "Evaluation",
};

export default async function ModuleDetail({
  params,
}: {
  params: Promise<{ id: string; mid: string }>;
}) {
  const { id, mid } = await params;
  const user = (await getSessionUser())!;
  if (!user.companyId) notFound();

  const mod = await prisma.trainingModule.findFirst({
    where: {
      id: mid,
      trainingId: id,
      published: true,
      training: { companyId: user.companyId, status: "published" },
    },
    include: {
      training: { select: { id: true, title: true } },
      roleplayConfig: { select: { mode: true } },
    },
  });
  if (!mod) notFound();

  // Roleplay modules have their own player; bounce there.
  if (mod.type === "roleplay") {
    redirect(`/learn/trainings/${id}/modules/${mid}/play`);
  }

  const completion = await prisma.moduleCompletion.findUnique({
    where: { userId_moduleId: { userId: user.id, moduleId: mid } },
    select: { completedAt: true, scorePct: true },
  });
  const done = completion != null;

  const body =
    mod.body && typeof mod.body === "object" && !Array.isArray(mod.body)
      ? (mod.body as Record<string, unknown>)
      : null;

  // Document storage type covers three surfaces. Discriminate by
  // body.kind so the trainee sees the right player.
  const bodyKind =
    body && typeof body.kind === "string" ? body.kind : null;

  // Display label uses the body.kind override for document storage.
  const displayLabel =
    mod.type === "document" && bodyKind === "coach"
      ? "Coach"
      : mod.type === "document" && bodyKind === "scorm"
        ? "SCORM"
        : mod.type === "document" && bodyKind === "narration"
          ? "Narration"
          : LABEL_BY_TYPE[mod.type];
  const displayIcon: IconName =
    mod.type === "document" && bodyKind === "coach"
      ? "trophy"
      : mod.type === "document" && bodyKind === "scorm"
        ? "layers"
        : mod.type === "document" && bodyKind === "narration"
          ? "mic"
          : ICON_BY_TYPE[mod.type];

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1100px] space-y-5">
      <Breadcrumb training={mod.training} />

      <Header
        icon={displayIcon}
        label={displayLabel}
        name={mod.name}
        done={done}
        completedAt={completion?.completedAt ?? null}
        scorePct={completion?.scorePct ?? null}
      />

      {mod.type === "video" ? (
        <VideoSection body={body} moduleId={mid} done={done} />
      ) : mod.type === "document" && bodyKind === "scorm" ? (
        <ScormSection body={body} moduleId={mid} done={done} />
      ) : mod.type === "document" && bodyKind === "coach" ? (
        <CoachSection body={body} moduleId={mid} done={done} />
      ) : mod.type === "document" && bodyKind === "narration" ? (
        <NarrationSection body={body} moduleId={mid} done={done} />
      ) : mod.type === "document" ? (
        <DocumentSection body={body} moduleId={mid} done={done} />
      ) : mod.type === "gamified" ? (
        <ActivitySection body={body} moduleId={mid} done={done} />
      ) : mod.type === "evaluation" ? (
        <EvaluationSection body={body} moduleId={mid} done={done} />
      ) : (
        <QuizSection body={body} moduleId={mid} completion={completion} />
      )}
    </div>
  );
}

// ─────────────── Breadcrumb ───────────────

function Breadcrumb({
  training,
}: {
  training: { id: string; title: string };
}) {
  return (
    <Link
      href={`/learn/trainings/${training.id}`}
      className="inline-flex items-center gap-1.5 text-[12px] text-ink-2 hover:text-ink"
    >
      <Icon name="chevron-right" size={11} className="rotate-180" />
      Back to {training.title}
    </Link>
  );
}

// ─────────────── Header ───────────────

function Header({
  icon,
  label,
  name,
  done,
  completedAt,
  scorePct,
}: {
  icon: IconName;
  label: string;
  name: string;
  done: boolean;
  completedAt: Date | null;
  scorePct: number | null;
}) {
  return (
    <header className="space-y-3">
      <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-3">
        <Icon name={icon} size={11} />
        {label}
        {done ? (
          <>
            <span className="text-ink-3">·</span>
            <span className="text-good">
              Completed{" "}
              {completedAt
                ? completedAt.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                : ""}
              {scorePct != null ? ` · ${scorePct}%` : ""}
            </span>
          </>
        ) : null}
      </div>
      <h1 className="font-display text-[32px] leading-[1.1] -tracking-[0.015em] text-ink">
        {name}
      </h1>
    </header>
  );
}

// ─────────────── Video section ───────────────

function VideoSection({
  body,
  moduleId,
  done,
}: {
  body: Record<string, unknown> | null;
  moduleId: string;
  done: boolean;
}) {
  const description =
    typeof body?.description === "string" ? body.description : null;
  const videoUrl = typeof body?.videoUrl === "string" ? body.videoUrl : null;
  const durationMin =
    typeof body?.duration_min === "number" ? body.duration_min : null;
  const renderJob =
    body?.renderJob && typeof body.renderJob === "object"
      ? (body.renderJob as { status?: string; provider?: string })
      : null;
  const isRendering =
    renderJob != null &&
    (renderJob.status === "queued" || renderJob.status === "rendering");

  return (
    <div className="space-y-4">
      {videoUrl ? (
        <div className="aspect-video rounded-[12px] overflow-hidden bg-ink">
          <video
            src={videoUrl}
            controls
            className="w-full h-full"
            preload="metadata"
          />
        </div>
      ) : isRendering ? (
        <Placeholder
          icon="play"
          title="Avatar video rendering…"
          body={`Your admin asked ${renderJob?.provider ?? "the avatar provider"} to render this video. Check back in a minute — refresh the page to see the latest status.`}
        />
      ) : (
        <Placeholder
          icon="play"
          title="Video not uploaded yet"
          body={
            durationMin
              ? `An admin set this module's duration to ${durationMin} min but hasn't attached a video URL. You can still mark it complete once you've watched it elsewhere.`
              : "Ask your admin to attach a video URL to this module. Once it's added, you'll be able to watch it inline."
          }
        />
      )}

      {description ? (
        <RichBlock title="About this video" text={description} />
      ) : null}

      <CompleteButton
        moduleId={moduleId}
        done={done}
        label={done ? "Marked complete" : "Mark as watched"}
      />
    </div>
  );
}

// ─────────────── Document section ───────────────

type Doc = { name: string; kind: string; url: string };

function isDocList(v: unknown): v is Doc[] {
  return (
    Array.isArray(v) &&
    v.every(
      (d) =>
        d &&
        typeof d === "object" &&
        typeof (d as Doc).name === "string" &&
        typeof (d as Doc).url === "string",
    )
  );
}

function DocumentSection({
  body,
  moduleId,
  done,
}: {
  body: Record<string, unknown> | null;
  moduleId: string;
  done: boolean;
}) {
  const description =
    typeof body?.description === "string" ? body.description : null;
  const documents = isDocList(body?.documents) ? body.documents : [];
  // Legacy markdown/text — older modules persisted body.markdown.
  const legacyText =
    typeof body?.markdown === "string"
      ? (body.markdown as string)
      : typeof body?.text === "string"
        ? (body.text as string)
        : null;

  const hasAnything = description || documents.length > 0 || legacyText;

  return (
    <div className="space-y-4">
      {description ? (
        <RichBlock title="Overview" text={description} />
      ) : null}

      {documents.length > 0 ? (
        <div className="bg-surface border border-border rounded-[12px] p-5 space-y-3">
          <div className="text-[13px] font-semibold text-ink">
            Documents ({documents.length})
          </div>
          <ul className="space-y-2">
            {documents.map((d, i) => {
              const kind = String(d.kind ?? "other").toUpperCase();
              return (
                <li
                  key={`${d.name}-${i}`}
                  className="flex items-center gap-3 px-3 py-2 bg-surface-2 border border-border rounded-md"
                >
                  <span
                    className={cn(
                      "inline-flex items-center justify-center w-10 h-10 rounded-md text-[10.5px] font-bold",
                      kind === "PDF" && "bg-[#fde2e2] text-[#b42318]",
                      kind === "DOCX" && "bg-[#e0ecfc] text-[#1849a9]",
                      kind === "PPTX" && "bg-[#feecdb] text-[#b54708]",
                      !["PDF", "DOCX", "PPTX"].includes(kind) &&
                        "bg-surface text-ink-3",
                    )}
                    aria-hidden
                  >
                    {kind}
                  </span>
                  <a
                    href={d.url}
                    download={d.name}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 text-[13px] text-ink truncate hover:text-accent"
                  >
                    {d.name}
                  </a>
                  <span className="text-[11px] text-ink-3 hidden sm:inline">
                    Download / open
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {legacyText ? (
        <article className="bg-surface border border-border rounded-[12px] p-6 text-[14px] leading-[1.65] text-ink whitespace-pre-wrap">
          {legacyText}
        </article>
      ) : null}

      {!hasAnything ? (
        <Placeholder
          icon="book"
          title="Document not authored yet"
          body="Ask your admin to add a description or upload files to this module."
        />
      ) : null}

      <CompleteButton
        moduleId={moduleId}
        done={done}
        label={done ? "Marked read" : "Mark as read"}
      />
    </div>
  );
}

// ─────────────── Coach section (Document with body.kind=coach) ───────────────

type CoachConfig = {
  trainingUsecase?: "sales" | "fundamental";
  typeOfCoach?: "normal" | "ppt";
  objectiveContext?: string;
  outline?: string;
  guidance?: string;
};

function CoachSection({
  body,
  moduleId,
  done,
}: {
  body: Record<string, unknown> | null;
  moduleId: string;
  done: boolean;
}) {
  const cfg =
    body && typeof body.coachConfig === "object" && body.coachConfig
      ? (body.coachConfig as CoachConfig)
      : null;

  const outlineBullets = cfg?.outline
    ? cfg.outline
        .split("\n")
        .map((l) => l.replace(/^[-*•\d.\s]+/, "").trim())
        .filter((l) => l.length > 0)
    : [];

  return (
    <div className="space-y-4">
      {cfg?.objectiveContext ? (
        <RichBlock title="What you'll learn" text={cfg.objectiveContext} />
      ) : null}

      {outlineBullets.length > 0 ? (
        <div className="bg-surface border border-border rounded-[12px] p-5">
          <div className="text-[13px] font-semibold text-ink mb-3">
            {cfg?.typeOfCoach === "ppt" ? "Slide outline" : "What we'll cover"}
          </div>
          <ol className="space-y-2">
            {outlineBullets.map((b, i) => (
              <li
                key={i}
                className="flex items-start gap-3 px-3 py-2 bg-surface-2 border border-border rounded-md"
              >
                <span className="mt-0.5 inline-grid place-items-center w-6 h-6 rounded-full bg-accent text-white text-[11px] font-bold shrink-0">
                  {i + 1}
                </span>
                <span className="text-[13px] text-ink leading-[1.55]">{b}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {!cfg?.objectiveContext && outlineBullets.length === 0 ? (
        <Placeholder
          icon="trophy"
          title="Coach module not authored yet"
          body="Ask your admin to fill in the Coach Objective + Outline. Once they do, your session will start from here."
        />
      ) : null}

      <CompleteButton
        moduleId={moduleId}
        done={done}
        label={done ? "Marked complete" : "Mark as completed"}
      />
    </div>
  );
}

// ─────────────── Scorm section (Document with body.kind=scorm) ───────────────

type ScormPackage = { name: string; url: string; size: number };

function ScormSection({
  body,
  moduleId,
  done,
}: {
  body: Record<string, unknown> | null;
  moduleId: string;
  done: boolean;
}) {
  const description =
    typeof body?.description === "string" ? body.description : null;
  const scorm =
    body?.scorm && typeof body.scorm === "object"
      ? (body.scorm as ScormPackage)
      : null;

  return (
    <div className="space-y-4">
      {description ? (
        <RichBlock title="Overview" text={description} />
      ) : null}

      {scorm ? (
        <div className="bg-surface border border-border rounded-[12px] p-5 space-y-3">
          <div className="text-[13px] font-semibold text-ink">SCORM package</div>
          <div className="flex items-center gap-3 px-3 py-2 bg-surface-2 border border-border rounded-md">
            <span className="inline-grid place-items-center w-10 h-10 rounded-md bg-accent-pale text-accent text-[10.5px] font-bold">
              ZIP
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-ink truncate">
                {scorm.name}
              </div>
              <div className="text-[11px] text-ink-3">
                {formatBytes(scorm.size)} · SCORM package
              </div>
            </div>
            <a
              href={scorm.url}
              download={scorm.name}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-white text-[12px] font-semibold hover:bg-accent-strong"
            >
              Launch
            </a>
          </div>
        </div>
      ) : (
        <Placeholder
          icon="layers"
          title="SCORM package not uploaded yet"
          body="Ask your admin to upload the .zip package for this module."
        />
      )}

      <CompleteButton
        moduleId={moduleId}
        done={done}
        label={done ? "Marked complete" : "Mark as complete"}
      />
    </div>
  );
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ─────────────── Narration section ───────────────
//
// Trainee surface for document/body.kind=narration modules. Plays the
// ElevenLabs-rendered mp3 with the script underneath so trainees can
// follow along (and stay accessible for hard-of-hearing learners).

function NarrationSection({
  body,
  moduleId,
  done,
}: {
  body: Record<string, unknown> | null;
  moduleId: string;
  done: boolean;
}) {
  const audioUrl =
    typeof body?.audioUrl === "string" ? body.audioUrl : null;
  const script = typeof body?.script === "string" ? body.script : "";

  return (
    <div className="space-y-4">
      {audioUrl ? (
        <div className="bg-surface border border-border rounded-[12px] p-5 space-y-3">
          <div className="text-[13px] font-semibold text-ink">Narration</div>
          <audio
            controls
            src={audioUrl}
            preload="metadata"
            className="w-full"
          />
        </div>
      ) : (
        <Placeholder
          icon="mic"
          title="Narration audio not generated yet"
          body="Ask your admin to render this narration before marking it complete."
        />
      )}

      {script ? <RichBlock title="Script" text={script} /> : null}

      <CompleteButton
        moduleId={moduleId}
        done={done}
        label={done ? "Marked complete" : "Mark as complete"}
      />
    </div>
  );
}

// ─────────────── Activity section (gamified) ───────────────

function ActivitySection({
  body,
  moduleId,
  done,
}: {
  body: Record<string, unknown> | null;
  moduleId: string;
  done: boolean;
}) {
  const description =
    typeof body?.description === "string" ? body.description : null;
  const durationMin =
    typeof body?.duration_min === "number" ? body.duration_min : null;
  const exercises = Array.isArray(body?.exercises)
    ? (body.exercises.filter((e) => typeof e === "string") as string[])
    : [];

  return (
    <div className="space-y-4">
      {durationMin ? (
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          <Icon name="history" size={11} />
          ~{durationMin} min
        </div>
      ) : null}

      {description ? (
        <RichBlock title="The activity" text={description} />
      ) : null}

      {exercises.length > 0 ? (
        <div className="bg-surface border border-border rounded-[12px] p-5">
          <div className="text-[13px] font-semibold text-ink mb-3">
            Steps ({exercises.length})
          </div>
          <ol className="space-y-2">
            {exercises.map((ex, i) => (
              <li
                key={i}
                className="flex items-start gap-3 px-3 py-2.5 bg-surface-2 border border-border rounded-md"
              >
                <span className="mt-0.5 inline-grid place-items-center w-6 h-6 rounded-full bg-accent text-white text-[11px] font-bold shrink-0">
                  {i + 1}
                </span>
                <span className="text-[13px] text-ink leading-[1.55]">{ex}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {!description && exercises.length === 0 ? (
        <Placeholder
          icon="trophy"
          title="Activity not authored yet"
          body="Ask your admin to describe this activity and list the steps."
        />
      ) : null}

      <CompleteButton
        moduleId={moduleId}
        done={done}
        label={done ? "Marked complete" : "Mark as complete"}
      />
    </div>
  );
}

// ─────────────── Evaluation section ───────────────

type EvaluationSettings = {
  selectionMode?: "random" | "manual";
  numberOfQuestions?: number | null;
  timeLimit?: "global" | "per_question";
  totalTimeLimitMin?: number;
  perQuestionTimeLimitSec?: number;
  attempts?: { kind: "unlimited" | "limited"; limit: number };
  scoring?: "keyword_weightage" | "ai";
  speechDelivery?: boolean;
  hideAnswerFromUser?: boolean;
  modeOfEvaluation?: "user_choice" | "video" | "audio";
};

function EvaluationSection({
  body,
  moduleId,
  done,
}: {
  body: Record<string, unknown> | null;
  moduleId: string;
  done: boolean;
}) {
  const s =
    body && typeof body.evaluation === "object" && body.evaluation
      ? (body.evaluation as EvaluationSettings)
      : null;

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-[12px] p-5 space-y-3">
        <div className="text-[13px] font-semibold text-ink">
          What to expect
        </div>
        <ul className="space-y-1.5 text-[12.5px] text-ink-2">
          <Row
            label="Questions"
            value={
              s?.numberOfQuestions
                ? `${s.numberOfQuestions} ${s.selectionMode === "random" ? "(random)" : "(manual selection)"}`
                : "Pending admin setup"
            }
          />
          <Row
            label="Time limit"
            value={
              s?.timeLimit === "per_question"
                ? `${s?.perQuestionTimeLimitSec ?? 60}s per question`
                : `${s?.totalTimeLimitMin ?? "—"} min total`
            }
          />
          <Row
            label="Attempts"
            value={
              s?.attempts?.kind === "limited"
                ? `Up to ${s.attempts.limit}`
                : "Unlimited"
            }
          />
          <Row
            label="Mode"
            value={
              s?.modeOfEvaluation === "user_choice"
                ? "Your choice"
                : s?.modeOfEvaluation === "audio"
                  ? "Audio only"
                  : s?.modeOfEvaluation === "video"
                    ? "Video"
                    : "—"
            }
          />
          <Row
            label="Scoring"
            value={
              s?.scoring === "keyword_weightage"
                ? "Keyword weightage"
                : s?.scoring === "ai"
                  ? "AI Scoring"
                  : "—"
            }
          />
        </ul>
      </div>

      <Placeholder
        icon="wand"
        title="Evaluation runtime is in flight"
        body="The video/audio evaluation runner ships next phase. For now, mark this complete once you've covered the material with your manager."
      />

      <CompleteButton
        moduleId={moduleId}
        done={done}
        label={done ? "Marked complete" : "Mark as complete"}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-baseline gap-3">
      <span className="text-[10.5px] uppercase tracking-[0.08em] text-ink-3 w-24 shrink-0">
        {label}
      </span>
      <span className="text-[12.5px] text-ink">{value}</span>
    </li>
  );
}

// ─────────────── Quiz section ───────────────

function QuizSection({
  body,
  moduleId,
  completion,
}: {
  body: Record<string, unknown> | null;
  moduleId: string;
  completion: { completedAt: Date; scorePct: number | null } | null;
}) {
  const questions = Array.isArray(body?.questions)
    ? (body.questions as Array<{
        q?: unknown;
        options?: unknown;
        answer?: unknown;
      }>)
    : [];

  const cleaned = questions
    .map((q) => {
      const text = typeof q.q === "string" ? q.q : null;
      const opts = Array.isArray(q.options)
        ? (q.options.filter((o) => typeof o === "string") as string[])
        : [];
      const answer = typeof q.answer === "number" ? q.answer : null;
      if (!text || opts.length < 2 || answer == null) return null;
      return { q: text, options: opts, answer };
    })
    .filter((q): q is { q: string; options: string[]; answer: number } => q != null);

  if (cleaned.length === 0) {
    return (
      <div className="space-y-4">
        <Placeholder
          icon="clipboard"
          title="Quiz not authored yet"
          body="Ask your admin to add questions to this module."
        />
        <CompleteButton
          moduleId={moduleId}
          done={completion != null}
          label={completion ? "Marked complete" : "Mark as complete"}
        />
      </div>
    );
  }

  return (
    <QuizPlayer
      moduleId={moduleId}
      questions={cleaned}
      lastScorePct={completion?.scorePct ?? null}
      alreadyCompleted={completion != null}
    />
  );
}

// ─────────────── Shared primitives ───────────────

function RichBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="bg-surface border border-border rounded-[12px] p-5 space-y-2">
      <div className="text-[13px] font-semibold text-ink">{title}</div>
      <div className="text-[13px] text-ink-2 leading-[1.6] whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

function Placeholder({
  icon,
  title,
  body,
}: {
  icon: IconName;
  title: string;
  body: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[12px] border border-dashed border-border bg-surface-2/40",
        "p-8 grid place-items-center text-center",
      )}
    >
      <div className="w-12 h-12 rounded-[10px] bg-surface text-ink-3 grid place-items-center">
        <Icon name={icon} size={18} />
      </div>
      <h3 className="font-display text-[18px] mt-3 text-ink">{title}</h3>
      <p className="text-[13px] text-ink-2 mt-2 max-w-[480px] leading-[1.55]">
        {body}
      </p>
    </div>
  );
}
