// Runtime helpers for reading `module.body.additionalSettings` on the
// trainee side. The admin-side modal owns the canonical type +
// defaults; we duplicate them here as a Zod-validated read path so the
// player never crashes on partial / legacy / malformed body data.

import { z } from "zod";

export type AdditionalSettings = {
  modes: {
    video: boolean;
    onlyAiVideo: boolean;
    onlyUserVideo: boolean;
    audio: boolean;
    userChoice: boolean;
  };
  recordAv: "yes" | "no";
  attempts: { kind: "unlimited" | "limited"; limit: number };
  followIdealConversation: boolean;
  minDurationMin: number;
  maxDurationMin: number;
  failBelowMinDuration: boolean;
  showExplanation: boolean;
  autoDisconnectOnLimit: boolean;
  disconnectOnInactivity: boolean;
  hints: { kind: "yes" | "no" | "limited"; limit: number };
  hintType: "complete" | "bullet";
  startRoleplayBy: "ai" | "user" | "either";
  endRoleplayBy: "ai" | "user" | "either";
  scenarioIntroGif: { name: string; dataUrl: string } | null;
  tipsOnReportGif: { name: string; dataUrl: string } | null;
};

export const DEFAULT_ADDITIONAL_SETTINGS: AdditionalSettings = {
  modes: {
    video: true,
    onlyAiVideo: true,
    onlyUserVideo: false,
    audio: false,
    userChoice: false,
  },
  recordAv: "yes",
  attempts: { kind: "unlimited", limit: 1 },
  followIdealConversation: false,
  minDurationMin: 1,
  maxDurationMin: 10,
  failBelowMinDuration: false,
  showExplanation: false,
  autoDisconnectOnLimit: false,
  disconnectOnInactivity: false,
  hints: { kind: "yes", limit: 1 },
  hintType: "complete",
  startRoleplayBy: "ai",
  endRoleplayBy: "ai",
  scenarioIntroGif: null,
  tipsOnReportGif: null,
};

const GifSchema = z
  .object({
    name: z.string().min(1).max(200),
    dataUrl: z.string().max(2000),
  })
  .nullable();

const SettingsSchema = z.object({
  modes: z.object({
    video: z.boolean(),
    onlyAiVideo: z.boolean(),
    onlyUserVideo: z.boolean(),
    audio: z.boolean(),
    userChoice: z.boolean(),
  }),
  recordAv: z.enum(["yes", "no"]),
  attempts: z.object({
    kind: z.enum(["unlimited", "limited"]),
    limit: z.number().int().min(1).max(50),
  }),
  followIdealConversation: z.boolean(),
  minDurationMin: z.number().int().min(1).max(60),
  maxDurationMin: z.number().int().min(1).max(60),
  failBelowMinDuration: z.boolean(),
  showExplanation: z.boolean(),
  autoDisconnectOnLimit: z.boolean(),
  disconnectOnInactivity: z.boolean(),
  hints: z.object({
    kind: z.enum(["yes", "no", "limited"]),
    limit: z.number().int().min(1).max(20),
  }),
  hintType: z.enum(["complete", "bullet"]),
  startRoleplayBy: z.enum(["ai", "user", "either"]),
  endRoleplayBy: z.enum(["ai", "user", "either"]),
  scenarioIntroGif: GifSchema,
  tipsOnReportGif: GifSchema,
});

/**
 * Pull additionalSettings from a module.body JSON blob. Falls back to
 * the safe defaults when the field is missing or malformed — older
 * modules saved before the schema existed must keep loading.
 */
export function parseAdditionalSettings(
  rawBody: unknown,
): AdditionalSettings {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return DEFAULT_ADDITIONAL_SETTINGS;
  }
  const settings = (rawBody as Record<string, unknown>).additionalSettings;
  if (!settings || typeof settings !== "object") {
    return DEFAULT_ADDITIONAL_SETTINGS;
  }
  const parsed = SettingsSchema.safeParse(settings);
  return parsed.success ? parsed.data : DEFAULT_ADDITIONAL_SETTINGS;
}

export type PlayerMode = "video" | "onlyAiVideo" | "onlyUserVideo" | "audio";

/**
 * Translate the admin's modes object into an ordered list of trainee
 * mode options. Order = preference when auto-picking (no user choice).
 * Used both for the mode-picker UI and for resolving the default mode.
 */
export function resolveAvailableModes(
  modes: AdditionalSettings["modes"],
): PlayerMode[] {
  const out: PlayerMode[] = [];
  if (modes.video) out.push("video");
  if (modes.onlyAiVideo) out.push("onlyAiVideo");
  if (modes.onlyUserVideo) out.push("onlyUserVideo");
  if (modes.audio) out.push("audio");
  return out;
}

export const MODE_LABELS: Record<PlayerMode, string> = {
  video: "Video — both sides",
  onlyAiVideo: "AI video only",
  onlyUserVideo: "Your camera only",
  audio: "Audio only",
};

export const MODE_DESCRIPTIONS: Record<PlayerMode, string> = {
  video: "AI avatar streams + your webcam preview. Best for full-fidelity practice.",
  onlyAiVideo: "AI avatar streams; your camera stays off.",
  onlyUserVideo: "Your webcam preview; AI replies are audio only.",
  audio: "Voice-only conversation. No camera, no avatar render.",
};
