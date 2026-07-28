// Curated ElevenLabs voice catalog used by the roleplay TTS pipeline.
//
// These are ElevenLabs's default "shared library" voices — freely
// available with any ElevenLabs account, no cloning consent needed.
// IDs are stable and documented at:
//   https://elevenlabs.io/docs/api-reference/voices/find-similar-voices
//
// Kept small on purpose in Phase 1. Phase 3 will let admins pick from a
// larger set inside the roleplay module editor.
//
// Language notes:
//   • Flash v2.5 (our default model) is English-only tuned but accepts
//     multilingual v2 voices — quality is best on English.
//   • For non-English personas we route through Multilingual v2 when
//     the module explicitly picks a non-English language.

export type CatalogGender = "female" | "male";

export type CatalogVoice = {
  id: string;
  name: string;
  gender: CatalogGender;
  /** Human-readable tone hint for admin UI ("warm", "assertive", …). */
  tone?: string;
  /** BCP-47 language tags this voice is a good match for. */
  languages: string[];
};

export const CATALOG_VOICES: CatalogVoice[] = [
  {
    id: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel",
    gender: "female",
    tone: "warm, professional",
    languages: ["en-US", "en-GB"],
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Bella",
    gender: "female",
    tone: "friendly, conversational",
    languages: ["en-US"],
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam",
    gender: "male",
    tone: "deep, authoritative",
    languages: ["en-US"],
  },
  {
    id: "TxGEqnHWrfWFTfGW9XjX",
    name: "Josh",
    gender: "male",
    tone: "casual, approachable",
    languages: ["en-US"],
  },
];

/**
 * Default persona voice pick for Phase 1 (no admin UI yet).
 * Falls back to Rachel if the requested gender isn't in the catalog.
 */
export function pickDefaultVoice(gender: CatalogGender | null): CatalogVoice {
  const target: CatalogGender = gender ?? "female";
  return (
    CATALOG_VOICES.find((v) => v.gender === target) ?? CATALOG_VOICES[0]
  );
}

export function findVoice(voiceId: string): CatalogVoice | null {
  return CATALOG_VOICES.find((v) => v.id === voiceId) ?? null;
}

/**
 * All catalog voices matching a gender. Used by the persona editor's
 * voice-picker grid to show relevant options first while still letting
 * the admin cross-gender if the persona calls for it.
 */
export function voicesByGender(gender: CatalogGender): CatalogVoice[] {
  return CATALOG_VOICES.filter((v) => v.gender === gender);
}
