// Provider registry. Resolve a driver from a stored video_providers row
// and call its createVideo/fetchStatus methods. New providers slot in
// by adding a case + an import; the rest of the codebase stays generic
// behind the VideoDriver interface.

import type { VideoProviderKind } from "@prisma/client";
import type { VideoDriver } from "./types";
import type { StreamingAvatarDriver } from "./streaming-types";
import { heygenDriver } from "./providers/heygen";
import { synthesiaDriver } from "./providers/synthesia";
import { didDriver } from "./providers/did";
import { inertDriver } from "./providers/inert";
import { heygenStreamingDriver } from "./providers/heygen-streaming";
import { didStreamingDriver } from "./providers/did-streaming";

export function getDriver(kind: VideoProviderKind): VideoDriver {
  switch (kind) {
    case "heygen":
      return heygenDriver;
    case "synthesia":
      return synthesiaDriver;
    case "did":
      return didDriver;
    case "elevenlabs":
      return inertDriver("elevenlabs", "TTS-only — needs slide+narration pipeline");
  }
}

// Returns the streaming-avatar driver for a provider kind, or null if
// that provider doesn't offer a streaming product (Synthesia, ElevenLabs
// today). Callers should also check PROVIDER_SUPPORTS_STREAMING before
// inviting the admin to mark a row as the live-roleplay provider.
export function getStreamingDriver(
  kind: VideoProviderKind,
): StreamingAvatarDriver | null {
  switch (kind) {
    case "heygen":
      return heygenStreamingDriver;
    case "did":
      return didStreamingDriver;
    case "synthesia":
    case "elevenlabs":
      return null;
  }
}

export type { VideoDriver, RenderJob, RenderJobStatus } from "./types";
export type {
  StreamingAvatarDriver,
  StreamingSessionCredentials,
} from "./streaming-types";

export const PROVIDER_LABEL: Record<VideoProviderKind, string> = {
  heygen: "HeyGen",
  synthesia: "Synthesia",
  did: "D-ID",
  elevenlabs: "ElevenLabs (TTS)",
};

export const PROVIDER_DESCRIPTION: Record<VideoProviderKind, string> = {
  heygen: "Avatar-led video render with custom voice. Recommended default.",
  synthesia:
    "Enterprise avatar studio. 230+ stock avatars and custom-avatar support.",
  did: "Talking-portrait video. Pass any source image URL as the Avatar ID.",
  elevenlabs:
    "Voice-only TTS. Needs a slide-narration pipeline before producing video.",
};

export const PROVIDER_KINDS: VideoProviderKind[] = [
  "heygen",
  "synthesia",
  "did",
  "elevenlabs",
];

export const PROVIDER_IMPLEMENTED: Record<VideoProviderKind, boolean> = {
  heygen: true,
  synthesia: true,
  did: true,
  elevenlabs: false,
};

// Per-kind hint text shown next to the Avatar ID input so the admin
// knows what value the provider expects.
export const PROVIDER_AVATAR_HINT: Record<VideoProviderKind, string> = {
  heygen: "uuid from app.liveavatar.com",
  synthesia: "e.g. anna_costume1_cameraA",
  did: "https URL of a source image (.jpg/.png)",
  elevenlabs: "not used — ElevenLabs is voice-only",
};

export const PROVIDER_VOICE_HINT: Record<VideoProviderKind, string> = {
  heygen: "voice id from app.liveavatar.com",
  synthesia: "Synthesia voice id (optional)",
  did: "Microsoft voice id, e.g. en-US-JennyNeural",
  elevenlabs: "ElevenLabs voice id",
};

// Which providers can drive the live roleplay player. Render-only
// providers can still be the tenant's render default; the session
// route refuses to mint a streaming session if the default doesn't
// support streaming.
export const PROVIDER_SUPPORTS_STREAMING: Record<VideoProviderKind, boolean> = {
  heygen: true,
  did: true,
  synthesia: false,
  elevenlabs: false,
};

export { DID_SOURCE_URL_ERROR, isValidDidSourceUrl } from "./did-validation";
export {
  HEYGEN_AVATAR_ID_ERROR,
  isValidHeygenAvatarId,
} from "./heygen-validation";
