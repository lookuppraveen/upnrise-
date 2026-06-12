// Shared narration body shape + parser. Lives outside narration-actions.ts
// because that file is "use server" — Next.js Server Action modules can
// only export async functions, so a type and a sync helper need their
// own module.

export type NarrationBody = {
  kind: "narration";
  script: string;
  voiceId: string | null;
  audioUrl: string | null;
  audioPath: string | null;
  renderedAt: string | null;
};

export function readNarrationBody(body: unknown): NarrationBody {
  const safe: NarrationBody = {
    kind: "narration",
    script: "",
    voiceId: null,
    audioUrl: null,
    audioPath: null,
    renderedAt: null,
  };
  if (!body || typeof body !== "object" || Array.isArray(body)) return safe;
  const b = body as Record<string, unknown>;
  return {
    kind: "narration",
    script: typeof b.script === "string" ? b.script : "",
    voiceId: typeof b.voiceId === "string" ? b.voiceId : null,
    audioUrl: typeof b.audioUrl === "string" ? b.audioUrl : null,
    audioPath: typeof b.audioPath === "string" ? b.audioPath : null,
    renderedAt: typeof b.renderedAt === "string" ? b.renderedAt : null,
  };
}
