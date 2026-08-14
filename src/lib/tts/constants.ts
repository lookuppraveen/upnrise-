// Client-safe constants for the TTS provider UI. Kept out of index.ts
// because that file imports server-only modules (prisma, elevenlabs
// stream helpers).

import type { TtsProviderKind } from "@prisma/client";

export const TTS_PROVIDER_LABEL: Record<TtsProviderKind, string> = {
  elevenlabs: "ElevenLabs",
  sarvam: "Sarvam AI (Bulbul)",
};

export const TTS_PROVIDER_DESCRIPTION: Record<TtsProviderKind, string> = {
  elevenlabs:
    "Default. Low-latency conversational voices used by the live roleplay TTS route.",
  sarvam:
    "Indic-first TTS (Bulbul). Streams as WAV; use for personas in Hindi, Tamil, and other Indic languages.",
};

export const TTS_PROVIDER_KINDS: TtsProviderKind[] = ["elevenlabs", "sarvam"];

export const TTS_VOICE_HINT: Record<TtsProviderKind, string> = {
  elevenlabs: "ElevenLabs voice_id (uuid)",
  sarvam: "Sarvam speaker (e.g. meera, arjun, pavithra)",
};
