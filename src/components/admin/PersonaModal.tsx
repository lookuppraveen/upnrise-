// Persona editor modal (opens from the Persona thumbnail on the
// Roleplay Module editor's Characters card).
//
// Captures everything the AI needs to "be" Person 2: a title, a
// behavior preset, background detail bullets, an additional system
// prompt, an avatar (gender × animated/custom + thumbnail grid), a
// background image, language(s), and a voice.
//
// State stays local until the admin presses Save — then we hand the
// final shape back to the parent via `onSave(persona)`. The parent is
// responsible for persisting (the Roleplay editor folds it into
// module.body via saveRoleplayModule).

"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { AvatarPickerModal, type PickerAvatar } from "@/components/admin/AvatarPickerModal";
import {
  DidPortraitPickerModal,
  type SavedPortrait,
} from "@/components/admin/DidPortraitPickerModal";
import { voicesByGender, type CatalogVoice } from "@/lib/voice/voice-catalog";
import { VoiceLibraryModal } from "@/components/admin/VoiceLibraryModal";

export type PersonaData = {
  title: string;
  behavior: BehaviorKey;
  backgroundDetails: string[];
  additionalPrompt: string;
  avatarGender: "male" | "female" | "neutral";
  avatarStyle: "animated" | "custom";
  avatarId: string | null;
  backgroundId: string | null;
  languages: string[];
  voiceId: string | null;
  /** ElevenLabs voice id used by the roleplay player for the persona's
   *  spoken lines. Independent from `voiceId` (which is an internal
   *  label mapped to the D-ID / Microsoft Neural streaming avatar
   *  voice). Null means "auto-pick from `avatarGender`" — see
   *  `pickDefaultVoice` in `lib/voice/voice-catalog.ts`. */
  elevenLabsVoiceId: string | null;
  // Optional override of the tenant's default LiveAvatar (set on the
  // VideoProvider row). When present, the trainee streaming session will
  // mint a token against this avatar instead — letting one tenant ship
  // different characters per persona without provisioning separate
  // provider rows. `null` means "fall back to the provider default".
  liveAvatarId: string | null;
  liveAvatarName: string | null;
  liveVoiceId: string | null;
  liveVoiceName: string | null;
  // Public https URL of the portrait (Supabase-hosted mirror of the
  // D-ID s3:// image). Used by the audio-only roleplay surface to
  // render the actual portrait. Null for HeyGen overrides or pre-
  // Supabase-mirror saved portraits — surface falls back to initials.
  liveDisplayUrl: string | null;
};

type BehaviorKey =
  | "friendly"
  | "skeptical"
  | "formal"
  | "impatient"
  | "supportive"
  | "neutral"
  | "critical"
  | "emotional"
  | "authoritative"
  | "casual";

const BEHAVIORS: { key: BehaviorKey; label: string }[] = [
  { key: "friendly", label: "FRIENDLY" },
  { key: "skeptical", label: "SKEPTICAL" },
  { key: "formal", label: "FORMAL" },
  { key: "impatient", label: "IMPATIENT" },
  { key: "supportive", label: "SUPPORTIVE" },
  { key: "neutral", label: "NEUTRAL" },
  { key: "critical", label: "CRITICAL" },
  { key: "emotional", label: "EMOTIONAL" },
  { key: "authoritative", label: "AUTHORITATIVE" },
  { key: "casual", label: "CASUAL" },
];

// Inline placeholder avatar grid. Each entry is a colored gradient
// strip with a glyph standing in for the real 3D render. Easy to swap
// for real asset URLs later — just replace `swatch` with an <img>.
// `label` shows a short role caption so admins can pick a contextually
// relevant silhouette ("Doctor", "Manager", etc.) at a glance.
type Avatar = { id: string; swatch: string; outfit: string; label: string };
const MALE_AVATARS: Avatar[] = [
  { id: "m1", swatch: "linear-gradient(180deg,#dde6f2 0%,#c4d2e6 100%)", outfit: "👔", label: "Executive" },
  { id: "m2", swatch: "linear-gradient(180deg,#dde6f2 0%,#c4d2e6 100%)", outfit: "🤵", label: "Formal" },
  { id: "m3", swatch: "linear-gradient(180deg,#dde6f2 0%,#b8c8df 100%)", outfit: "🥼", label: "Scientist" },
  { id: "m4", swatch: "linear-gradient(180deg,#dde6f2 0%,#b8c8df 100%)", outfit: "👨‍⚕️", label: "Doctor" },
  { id: "m5", swatch: "linear-gradient(180deg,#dde6f2 0%,#c4d2e6 100%)", outfit: "🩺", label: "Clinician" },
  { id: "m6", swatch: "linear-gradient(180deg,#dde6f2 0%,#c4d2e6 100%)", outfit: "🧥", label: "Manager" },
  { id: "m7", swatch: "linear-gradient(180deg,#e2eef7 0%,#c8d8e8 100%)", outfit: "👨‍💼", label: "Sales Rep" },
  { id: "m8", swatch: "linear-gradient(180deg,#e2eef7 0%,#c8d8e8 100%)", outfit: "🕴", label: "Director" },
  { id: "m9", swatch: "linear-gradient(180deg,#e2eef7 0%,#c8d8e8 100%)", outfit: "👨", label: "Customer" },
  { id: "m10", swatch: "linear-gradient(180deg,#e2eef7 0%,#c8d8e8 100%)", outfit: "👕", label: "Casual" },
  { id: "m11", swatch: "linear-gradient(180deg,#e2eef7 0%,#c8d8e8 100%)", outfit: "🧢", label: "Field staff" },
  { id: "m12", swatch: "linear-gradient(180deg,#e2eef7 0%,#c8d8e8 100%)", outfit: "👨‍🔬", label: "Researcher" },
  { id: "m13", swatch: "linear-gradient(180deg,#dde6f2 0%,#b8c8df 100%)", outfit: "👨‍⚕️", label: "Specialist" },
  { id: "m14", swatch: "linear-gradient(180deg,#dde6f2 0%,#b8c8df 100%)", outfit: "🧓", label: "Senior" },
  { id: "m15", swatch: "linear-gradient(180deg,#e2eef7 0%,#c8d8e8 100%)", outfit: "🧔", label: "Buyer" },
  { id: "m16", swatch: "linear-gradient(180deg,#e2eef7 0%,#c8d8e8 100%)", outfit: "👨‍💼", label: "Account exec" },
  { id: "m17", swatch: "linear-gradient(180deg,#e2eef7 0%,#c8d8e8 100%)", outfit: "🧑‍💼", label: "Consultant" },
];
const FEMALE_AVATARS: Avatar[] = [
  { id: "f1", swatch: "linear-gradient(180deg,#f7e6e6 0%,#e6c4c4 100%)", outfit: "👩‍💼", label: "Sales Rep" },
  { id: "f2", swatch: "linear-gradient(180deg,#f7e6e6 0%,#e6c4c4 100%)", outfit: "👩‍⚕️", label: "Doctor" },
  { id: "f3", swatch: "linear-gradient(180deg,#f7e6e6 0%,#e6c4c4 100%)", outfit: "👩‍🏫", label: "Trainer" },
  { id: "f4", swatch: "linear-gradient(180deg,#f7e6e6 0%,#e6c4c4 100%)", outfit: "👩", label: "Customer" },
  { id: "f5", swatch: "linear-gradient(180deg,#f7e6e6 0%,#e6c4c4 100%)", outfit: "👩‍🔬", label: "Researcher" },
  { id: "f6", swatch: "linear-gradient(180deg,#f7e6e6 0%,#e6c4c4 100%)", outfit: "👱‍♀️", label: "Buyer" },
];

// Gender-neutral avatars. The first entry — "Generic Human" — is the
// default safe pick for any scenario where Person 2's gender isn't
// specified. The remaining entries map to common L&D roles so admins
// can pick a relevant silhouette without choosing male/female.
const NEUTRAL_AVATARS: Avatar[] = [
  { id: "n1", swatch: "linear-gradient(180deg,#e9eef5 0%,#cdd6e3 100%)", outfit: "🧑", label: "Generic Human" },
  { id: "n2", swatch: "linear-gradient(180deg,#e9eef5 0%,#cdd6e3 100%)", outfit: "🧑‍💼", label: "Business" },
  { id: "n3", swatch: "linear-gradient(180deg,#e9eef5 0%,#cdd6e3 100%)", outfit: "🧑‍⚕️", label: "Clinician" },
  { id: "n4", swatch: "linear-gradient(180deg,#e9eef5 0%,#cdd6e3 100%)", outfit: "🧑‍🏫", label: "Educator" },
  { id: "n5", swatch: "linear-gradient(180deg,#e9eef5 0%,#cdd6e3 100%)", outfit: "🧑‍🔬", label: "Scientist" },
  { id: "n6", swatch: "linear-gradient(180deg,#e9eef5 0%,#cdd6e3 100%)", outfit: "🧑‍💻", label: "Engineer" },
  { id: "n7", swatch: "linear-gradient(180deg,#e9eef5 0%,#cdd6e3 100%)", outfit: "🧑‍🏭", label: "Operator" },
  { id: "n8", swatch: "linear-gradient(180deg,#e9eef5 0%,#cdd6e3 100%)", outfit: "🧑‍⚖️", label: "Compliance" },
  { id: "n9", swatch: "linear-gradient(180deg,#e9eef5 0%,#cdd6e3 100%)", outfit: "🧑‍🌾", label: "Field rep" },
];

// Lookup of which avatar list belongs to which gender. Keeps the gender
// switch + avatar grid + auto-generate flow in sync.
const AVATARS_BY_GENDER: Record<"male" | "female" | "neutral", Avatar[]> = {
  male: MALE_AVATARS,
  female: FEMALE_AVATARS,
  neutral: NEUTRAL_AVATARS,
};

type Background = { id: string; swatch: string; label: string };
const BACKGROUNDS: Background[] = [
  { id: "office", swatch: "linear-gradient(140deg,#eaf2fa,#cfdfee 70%,#a8c0db)", label: "Office" },
  { id: "lounge", swatch: "linear-gradient(140deg,#e6e8e0,#cdd2c4 70%,#b8bca9)", label: "Lounge" },
  { id: "hospital", swatch: "linear-gradient(140deg,#f0f6fa,#dee7ec 70%,#c2cfd6)", label: "Hospital" },
  { id: "studio", swatch: "linear-gradient(140deg,#bee7f0,#86d6e2 70%,#54bcca)", label: "Studio" },
  { id: "factory", swatch: "linear-gradient(140deg,#a4adb6,#4f5762 60%,#2c2f36)", label: "Factory" },
  { id: "blank", swatch: "linear-gradient(140deg,#f5f9fc,#e2ecf3)", label: "Blank" },
  { id: "clinic", swatch: "linear-gradient(140deg,#7ebcd1,#3a82a0)", label: "Clinic" },
  { id: "pharmacy", swatch: "linear-gradient(140deg,#3a3a3a,#1a1a1a)", label: "Pharmacy" },
  { id: "retail", swatch: "linear-gradient(140deg,#dfe6eb,#aab8c0 70%,#8693a1)", label: "Retail" },
];

const LANGUAGES = [
  "English",
  "Hindi",
  "Tamil",
  "Telugu",
  "Kannada",
  "Malayalam",
  "Bengali",
  "Marathi",
  "Gujarati",
  "Punjabi",
  "Urdu",
];

// Maps the persona picker's internal voice id to a real D-ID / Microsoft
// Neural voice that the streaming session route will pass upstream. This
// is what turns the accordion from a cosmetic label into a load-bearing
// pick — clicking "Priya" now also seeds liveVoiceId with Neerja so the
// trainee actually hears her (on D-ID). On HeyGen the shape check drops
// the Microsoft-format id and falls back to the tenant provider voice.
const INTERNAL_TO_DID_VOICE: Record<string, { id: string; name: string }> = {
  "f-warm": { id: "en-IN-NeerjaNeural", name: "Neerja · Female (en-IN)" },
  "f-bright": { id: "en-IN-AnanyaNeural", name: "Ananya · Female (en-IN)" },
  "f-formal": { id: "en-IN-KavyaNeural", name: "Kavya · Female (en-IN)" },
  "f-calm": { id: "hi-IN-SwaraNeural", name: "Swara · Female (hi-IN)" },
  "m-warm": { id: "en-IN-PrabhatNeural", name: "Prabhat · Male (en-IN)" },
  "m-deep": { id: "en-IN-AaravNeural", name: "Aarav · Male (en-IN)" },
  "m-young": { id: "en-IN-KunalNeural", name: "Kunal · Male (en-IN)" },
  "m-calm": { id: "en-IN-RehaanNeural", name: "Rehaan · Male (en-IN)" },
  // Neutral fallbacks — Microsoft Neural doesn't ship a true neutral, so
  // we bias to Neerja / Prabhat which read as the closest cultural match.
  "n-clear": { id: "en-IN-NeerjaNeural", name: "Neerja · Female (en-IN)" },
  "n-warm": { id: "en-IN-PrabhatNeural", name: "Prabhat · Male (en-IN)" },
};

// Voice options for the persona picker. All entries are Indian-accented
// (en-IN) — the L&D scenarios in this deployment target Indian trainees,
// and localised voices land better than the previous US/UK generics.
// Tone hints reflect the accent explicitly so admins can see it at a
// glance in the picker.
const VOICES_BY_GENDER: Record<
  "male" | "female" | "neutral",
  { id: string; label: string; tone: string }[]
> = {
  male: [
    { id: "m-warm", label: "Arjun", tone: "Warm · Indian, mid-pitch" },
    { id: "m-deep", label: "Vikram", tone: "Deep · Indian, authoritative" },
    { id: "m-young", label: "Rohan", tone: "Energetic · Indian, younger" },
    { id: "m-calm", label: "Aakash", tone: "Calm · Indian, clinical" },
  ],
  female: [
    { id: "f-warm", label: "Priya", tone: "Warm · Indian, empathetic" },
    { id: "f-bright", label: "Ananya", tone: "Bright · Indian, energetic" },
    { id: "f-formal", label: "Meera", tone: "Formal · Indian, measured" },
    { id: "f-calm", label: "Riya", tone: "Calm · Indian, low-pitch" },
  ],
  neutral: [
    { id: "n-clear", label: "Kiran", tone: "Clear · Indian, neutral pitch" },
    { id: "n-warm", label: "Deep", tone: "Warm · Indian, approachable" },
  ],
};

// Default persona ships with an Indian female voice (Priya) since the
// primary trainee audience is India-based. Admins can flip gender/voice
// at any time — this is only the starting state for a fresh persona.
//
// liveVoiceId is preseeded to en-IN-NeerjaNeural (D-ID / Microsoft
// Neural). If the tenant runs on D-ID this is used directly; if the
// tenant is on HeyGen, the session route detects the shape mismatch and
// falls back to the tenant's provider-default voice — see
// isVoiceOverrideCompatible in src/app/api/roleplay/streaming/session.
export const DEFAULT_PERSONA: PersonaData = {
  title: "",
  behavior: "friendly",
  backgroundDetails: [],
  additionalPrompt: "",
  avatarGender: "female",
  avatarStyle: "animated",
  avatarId: "f1",
  backgroundId: "office",
  languages: ["English"],
  voiceId: "f-warm",
  liveAvatarId: null,
  liveAvatarName: null,
  liveVoiceId: "en-IN-NeerjaNeural",
  liveVoiceName: "Neerja · Female (en-IN)",
  liveDisplayUrl: null,
  // null → the trainee player picks a female voice from the ElevenLabs
  // catalog based on avatarGender. Admins override this via the
  // "Roleplay voice (ElevenLabs)" section in the persona editor.
  elevenLabsVoiceId: null,
};

export function PersonaModal({
  initial,
  trainingId,
  person1,
  person2,
  scenario,
  savedPortraits = [],
  tenantStreamingProvider = null,
  onClose,
  onSave,
}: {
  initial: PersonaData;
  trainingId?: string;
  person1?: string;
  person2?: string;
  scenario?: string;
  savedPortraits?: SavedPortrait[];
  tenantStreamingProvider?: {
    kind: string;
    supportsStreaming: boolean;
  } | null;
  onClose: () => void;
  onSave: (p: PersonaData) => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [behavior, setBehavior] = useState<BehaviorKey>(initial.behavior);
  const [details, setDetails] = useState<string[]>(initial.backgroundDetails);
  const [detailDraft, setDetailDraft] = useState("");
  const [additionalPrompt, setAdditionalPrompt] = useState(
    initial.additionalPrompt,
  );
  const [gender, setGender] = useState<"male" | "female" | "neutral">(
    initial.avatarGender,
  );
  const [style, setStyle] = useState<"animated" | "custom">(initial.avatarStyle);
  const [avatarId, setAvatarId] = useState<string | null>(initial.avatarId);
  const [backgroundId, setBackgroundId] = useState<string | null>(
    initial.backgroundId,
  );
  const [languages, setLanguages] = useState<string[]>(initial.languages);
  const [voiceId, setVoiceId] = useState<string | null>(initial.voiceId);
  const [voicesOpen, setVoicesOpen] = useState(false);
  // ElevenLabs voice — drives the trainee-side roleplay audio. Kept
  // separate from voiceId (which maps to the D-ID streaming avatar)
  // because the two providers use different id spaces.
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState<string | null>(
    initial.elevenLabsVoiceId ?? null,
  );
  // Display-only name shown next to the voice id when the admin picks
  // from the library. Not persisted (the id is what round-trips
  // through save); reset on next open. Used to answer "which voice did
  // I pick?" without a follow-up API call.
  const [libraryVoiceName, setLibraryVoiceName] = useState<string | null>(
    null,
  );
  const [elevenVoicesOpen, setElevenVoicesOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(
    null,
  );
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [liveAvatarId, setLiveAvatarId] = useState<string | null>(
    initial.liveAvatarId,
  );
  const [liveAvatarName, setLiveAvatarName] = useState<string | null>(
    initial.liveAvatarName,
  );
  const [liveVoiceId, setLiveVoiceId] = useState<string | null>(
    initial.liveVoiceId,
  );
  const [liveVoiceName, setLiveVoiceName] = useState<string | null>(
    initial.liveVoiceName,
  );
  const [liveDisplayUrl, setLiveDisplayUrl] = useState<string | null>(
    initial.liveDisplayUrl ?? null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [didPickerOpen, setDidPickerOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // ESC closes; click on backdrop closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // When gender flips, reset the avatar+voice to the first of that
  // gender so the selected state stays coherent (a male voice paired
  // with a female avatar is jarring).
  function switchGender(g: "male" | "female" | "neutral") {
    if (g === gender) return;
    setGender(g);
    const list = AVATARS_BY_GENDER[g];
    setAvatarId(list[0]?.id ?? null);
    const nextVoiceId = VOICES_BY_GENDER[g][0]?.id ?? null;
    setVoiceId(nextVoiceId);
    // Keep liveVoiceId in sync with the new gender's default voice card
    // so the runtime voice matches what the accordion shows. Skip when
    // a HeyGen avatar is picked — that carries its own voice pairing.
    if (!liveAvatarId && nextVoiceId) {
      const mapped = INTERNAL_TO_DID_VOICE[nextVoiceId];
      if (mapped) {
        setLiveVoiceId(mapped.id);
        setLiveVoiceName(mapped.name);
      }
    }
  }

  function addDetail() {
    const v = detailDraft.trim();
    if (!v) return;
    if (details.length >= 10) return;
    setDetails([...details, v]);
    setDetailDraft("");
  }

  function removeDetail(i: number) {
    setDetails(details.filter((_, idx) => idx !== i));
  }

  function toggleLanguage(lang: string) {
    setLanguages(
      languages.includes(lang)
        ? languages.filter((l) => l !== lang)
        : [...languages, lang],
    );
  }

  // ElevenLabs voice preview — POSTs a short sample sentence to the
  // existing /api/roleplay/tts route (admins are allowed) and plays
  // the returned audio via a shared Audio element. Clicking a
  // different voice while one is playing cancels + replays. Errors
  // (missing key, 402 from provider, network) fall silently — the
  // preview button just doesn't play.
  async function previewVoice(voice: CatalogVoice) {
    setPreviewingVoiceId(voice.id);
    try {
      // Stop any prior preview so the two don't overlap.
      previewAudioRef.current?.pause();
      const sample =
        `Hi, I'm ${voice.name}. This is a sample of how I'd sound as your persona.`;
      const res = await fetch("/api/roleplay/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sample, voiceId: voice.id }),
      });
      if (!res.ok) throw new Error(`tts_${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = previewAudioRef.current ?? new Audio();
      previewAudioRef.current = audio;
      audio.src = url;
      const cleanup = () => {
        URL.revokeObjectURL(url);
        setPreviewingVoiceId((cur) => (cur === voice.id ? null : cur));
      };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      await audio.play();
    } catch (err) {
      console.warn(
        "[persona-editor] voice preview failed",
        err instanceof Error ? err.message : err,
      );
      setPreviewingVoiceId(null);
    }
  }

  function save() {
    onSave({
      title: title.trim(),
      behavior,
      backgroundDetails: details,
      additionalPrompt: additionalPrompt.trim(),
      avatarGender: gender,
      avatarStyle: style,
      avatarId,
      backgroundId,
      languages,
      voiceId,
      liveAvatarId,
      liveAvatarName,
      liveVoiceId,
      liveVoiceName,
      liveDisplayUrl,
      elevenLabsVoiceId,
    });
  }

  const avatars = style === "animated" ? AVATARS_BY_GENDER[gender] : [];

  async function generateWithAi() {
    if (!trainingId) {
      setGenError("AI generation needs a saved module — open from a roleplay editor.");
      return;
    }
    setGenError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/persona/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainingId,
          person1: person1 ?? "",
          person2: person2 ?? "",
          scenario: scenario ?? "",
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          issues?: { fieldErrors?: Record<string, string[]> };
        };
        const fields = data.issues?.fieldErrors;
        const detail = fields
          ? Object.entries(fields)
              .flatMap(([k, vs]) => (vs ?? []).map((v) => `${k}: ${v}`))
              .join("; ")
          : "";
        throw new Error(
          [data.error, detail].filter(Boolean).join(" — ") ||
            `generate failed: ${res.status}`,
        );
      }
      const draft = (await res.json()) as PersonaData & { backgroundId: string };
      setTitle(draft.title);
      setBehavior(draft.behavior);
      setDetails(draft.backgroundDetails);
      setAdditionalPrompt(draft.additionalPrompt);
      setGender(draft.avatarGender);
      // Pick the first avatar of the chosen gender so the grid shows a
      // selected card. The admin can still re-pick a specific avatar.
      const avList = AVATARS_BY_GENDER[draft.avatarGender];
      setAvatarId(avList[0]?.id ?? null);
      setBackgroundId(draft.backgroundId);
      setLanguages(draft.languages);
      setVoiceId(draft.voiceId);
      // Mirror the AI-picked voice into liveVoiceId so the runtime voice
      // matches what the accordion shows. Same skip-on-HeyGen guard as
      // the manual click handler.
      if (!liveAvatarId && draft.voiceId) {
        const mapped = INTERNAL_TO_DID_VOICE[draft.voiceId];
        if (mapped) {
          setLiveVoiceId(mapped.id);
          setLiveVoiceName(mapped.name);
        }
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Persona editor"
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="bg-bg border border-border rounded-[12px] w-full max-w-[920px] my-4 shadow-xl flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border gap-3">
          <h2 className="text-[18px] font-semibold text-ink">Persona</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={generateWithAi}
              disabled={generating}
              suppressHydrationWarning
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12.5px] font-semibold text-white disabled:opacity-60 hover:opacity-90"
              style={{ background: "var(--ai-grad, #7c5cd6)" }}
              title="Auto-fill all persona fields from the training context"
            >
              <Icon name="ai-sparkle" size={11} />
              {generating ? "Generating…" : "AI Generate"}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-ink-3 hover:text-ink text-[20px] leading-none px-1"
            >
              ×
            </button>
          </div>
        </div>

        {genError ? (
          <div className="px-6 py-2 border-b border-border bg-bad-pale/50">
            <p className="text-[11.5px] text-bad font-mono break-words">
              {genError}
            </p>
          </div>
        ) : null}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Title */}
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Term Plan offers a range of features…"
              className="w-full bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent"
              suppressHydrationWarning
            />
          </Field>

          {/* Behavior */}
          <Field label="Behavior">
            <div className="relative">
              <select
                value={behavior}
                onChange={(e) => setBehavior(e.target.value as BehaviorKey)}
                className="w-full appearance-none bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] font-semibold uppercase tracking-[0.05em] focus:outline-none focus:border-accent pr-9"
                suppressHydrationWarning
              >
                {BEHAVIORS.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
              </select>
              <Icon
                name="chevron-down"
                size={14}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3"
              />
            </div>
          </Field>

          {/* Background Details */}
          <div className="space-y-1.5">
            <div className="text-[13px] font-semibold text-ink">
              Background Details
            </div>
            <p className="text-[11.5px] text-ink-3">
              Add up to 10 characteristics and background details of the
              persona.
            </p>
            <div className="flex items-center gap-2">
              <input
                value={detailDraft}
                onChange={(e) => setDetailDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDetail();
                  }
                }}
                placeholder="Ex: 10 years experience"
                disabled={details.length >= 10}
                className="flex-1 bg-surface border border-border-strong rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent disabled:opacity-60"
                suppressHydrationWarning
              />
              <button
                type="button"
                onClick={addDetail}
                disabled={!detailDraft.trim() || details.length >= 10}
                className="px-5 py-2.5 rounded-md bg-accent-pale text-accent text-[13px] font-semibold hover:bg-accent hover:text-white transition-colors disabled:opacity-50 disabled:hover:bg-accent-pale disabled:hover:text-accent"
                suppressHydrationWarning
              >
                Add
              </button>
            </div>
            <div className="text-[11.5px] font-semibold text-ink-2">
              {details.length}/10 Details
            </div>
            {details.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {details.map((d, i) => (
                  <li
                    key={`${d}-${i}`}
                    className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-border rounded-md"
                  >
                    <span className="flex-1 text-[12.5px] text-ink-2 leading-snug">
                      {d}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeDetail(i)}
                      aria-label="Remove detail"
                      className="text-ink-3 hover:text-bad text-[14px]"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* Additional Prompt */}
          <div className="bg-surface border border-border rounded-[10px] p-4 space-y-1.5">
            <div className="text-[13px] font-semibold text-ink">
              Additional Prompt
            </div>
            <p className="text-[11.5px] text-ink-3">
              Additional prompt provide..
            </p>
            <textarea
              value={additionalPrompt}
              onChange={(e) => setAdditionalPrompt(e.target.value)}
              rows={3}
              placeholder="Ex: Term Plan offers a range of features including flexible policy."
              className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[12.5px] focus:outline-none focus:border-accent resize-y"
              suppressHydrationWarning
            />
          </div>

          {/* Avatar */}
          <div className="bg-surface border border-border rounded-[10px] p-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-[13px] font-semibold text-ink">Avatar</div>
              <PillGroup
                value={gender}
                onChange={(v) => switchGender(v)}
                options={[
                  { key: "neutral", label: "Generic" },
                  { key: "male", label: "Male" },
                  { key: "female", label: "Female" },
                ]}
              />
              <PillGroup
                value={style}
                onChange={(v) => setStyle(v)}
                options={[
                  { key: "animated", label: "Animated" },
                  { key: "custom", label: "Custom" },
                ]}
              />
            </div>

            {style === "animated" ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                {avatars.map((a) => {
                  const selected = avatarId === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAvatarId(a.id)}
                      className={cn(
                        "relative aspect-[3/4] rounded-[10px] border-2 overflow-hidden transition-all",
                        selected
                          ? "border-accent shadow-[0_0_0_3px_rgba(255,124,82,0.15)]"
                          : "border-border hover:border-accent-pale",
                      )}
                      aria-label={`Avatar ${a.label}`}
                      title={a.label}
                    >
                      <div
                        className="absolute inset-0 grid place-items-center justify-center"
                        style={{ background: a.swatch }}
                        aria-hidden
                      >
                        <span className="text-[40px] leading-none -mt-3">
                          {a.outfit}
                        </span>
                      </div>
                      <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 bg-black/35 text-white text-[10.5px] font-semibold text-center truncate">
                        {a.label}
                      </div>
                      {selected ? (
                        <div className="absolute top-1 right-1 w-5 h-5 grid place-items-center rounded-full bg-accent text-white text-[10px]">
                          ✓
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="border-2 border-dashed border-border rounded-[10px] p-6 text-center text-[12.5px] text-ink-3">
                Custom avatar upload (PNG, transparent) — coming soon.
              </div>
            )}
          </div>

          {/* LiveAvatar override (streaming) */}
          <div className="bg-surface border border-border rounded-[10px] p-4 space-y-3">
            {/* Tenant-provider health banner — shown when the tenant
                default can't stream. Same intent as the roleplay editor
                banner, but scoped tight to the streaming section so the
                admin sees it right next to the pickers that will 412. */}
            {tenantStreamingProvider &&
            !tenantStreamingProvider.supportsStreaming ? (
              <div className="flex items-start gap-2 rounded-md border border-[#e6a24a]/50 bg-[#fef3e6] text-[#8a4b12] px-3 py-2 text-[11.5px]">
                <span aria-hidden className="pt-0.5">
                  ⚠
                </span>
                <div>
                  Tenant default provider (
                  <b>{tenantStreamingProvider.kind}</b>) doesn&apos;t support
                  live avatar streaming. This persona&apos;s streaming picks
                  will be ignored until you switch the default to HeyGen or
                  D-ID at Avatars &amp; Voices.
                </div>
              </div>
            ) : null}
            {!tenantStreamingProvider ? (
              <div className="flex items-start gap-2 rounded-md border border-bad/40 bg-bad-pale/40 text-bad px-3 py-2 text-[11.5px]">
                <span aria-hidden className="pt-0.5">
                  ⚠
                </span>
                <div>
                  No streaming provider configured. The trainee will fall
                  back to text-only mode regardless of what you pick here.
                </div>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-ink">
                  Streaming avatar
                </div>
                <p className="text-[11.5px] text-ink-3 mt-0.5">
                  Optional. Pick a specific LiveAvatar for this persona. If
                  empty, the trainee session uses the default avatar set on
                  your Video Provider.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  suppressHydrationWarning
                  title="Browse the HeyGen LiveAvatar catalogue"
                  className="px-3 py-1.5 rounded-md bg-accent-pale text-accent text-[12px] font-semibold hover:bg-accent hover:text-white transition-colors"
                >
                  Browse HeyGen…
                </button>
                {savedPortraits.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setDidPickerOpen(true)}
                    suppressHydrationWarning
                    title="Pick from your saved D-ID portraits library"
                    className="px-3 py-1.5 rounded-md bg-accent-pale text-accent text-[12px] font-semibold hover:bg-accent hover:text-white transition-colors"
                  >
                    Browse saved (D-ID)…
                  </button>
                ) : null}
                {liveAvatarId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setLiveAvatarId(null);
                      setLiveAvatarName(null);
                      setLiveVoiceId(null);
                      setLiveVoiceName(null);
                      setLiveDisplayUrl(null);
                    }}
                    suppressHydrationWarning
                    className="px-3 py-1.5 rounded-md border border-border bg-surface text-[12px] font-semibold text-ink-2 hover:text-ink hover:bg-surface-2"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
            {liveAvatarId ? (
              <div className="bg-surface-2 border border-border rounded-md px-3 py-2 space-y-0.5">
                <div className="text-[12.5px] font-semibold text-ink truncate">
                  {liveAvatarName ?? "Selected avatar"}
                </div>
                <div className="text-[10.5px] text-ink-3 font-mono truncate">
                  {liveAvatarId}
                </div>
                {liveVoiceName ? (
                  <div className="text-[10.5px] text-ink-3 truncate">
                    Voice: {liveVoiceName}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border bg-surface-2/60 px-3 py-2 text-[11.5px] text-ink-2">
                <div className="font-semibold text-ink">
                  No streaming avatar picked
                </div>
                <div className="text-ink-3 mt-0.5">
                  The trainee session will fall back to the tenant&apos;s
                  default avatar. If none is set on the provider row, the
                  session will fail with a 412 error.
                </div>
              </div>
            )}
            {/* Voice status — surfaces the preseeded default Indian voice
                even when no avatar is picked. Ignored at session-mint if
                the tenant's default provider is HeyGen (shape mismatch). */}
            {!liveAvatarId && liveVoiceId ? (
              <div className="bg-surface-2 border border-border rounded-md px-3 py-2 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                    Voice
                  </div>
                  <div className="text-[12.5px] text-ink truncate">
                    {liveVoiceName ?? liveVoiceId}
                  </div>
                  <div className="text-[10.5px] text-ink-3">
                    Applied when the tenant default provider is D-ID.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLiveVoiceId(null);
                    setLiveVoiceName(null);
                  }}
                  suppressHydrationWarning
                  className="px-2.5 py-1 rounded-md border border-border bg-surface text-[11.5px] font-semibold text-ink-2 hover:text-ink hover:bg-surface-2 shrink-0"
                >
                  Clear voice
                </button>
              </div>
            ) : null}
          </div>

          {/* Background Images */}
          <div className="bg-surface border border-border rounded-[10px] p-4 space-y-3">
            <div className="text-[13px] font-semibold text-accent">
              Background Images
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
              {BACKGROUNDS.map((bg) => {
                const selected = backgroundId === bg.id;
                return (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => setBackgroundId(bg.id)}
                    className={cn(
                      "relative aspect-[3/2] rounded-[10px] border-2 overflow-hidden transition-all",
                      selected
                        ? "border-accent shadow-[0_0_0_3px_rgba(255,124,82,0.15)]"
                        : "border-border hover:border-accent-pale",
                    )}
                    aria-label={`Background ${bg.label}`}
                  >
                    <div
                      className="absolute inset-0"
                      style={{ background: bg.swatch }}
                      aria-hidden
                    />
                    {selected ? (
                      <div className="absolute top-1 right-1 w-5 h-5 grid place-items-center rounded-full bg-accent text-white text-[10px]">
                        ✓
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Language */}
          <div className="bg-surface border border-border rounded-[10px] p-4 space-y-3">
            <div className="text-[13px] font-semibold text-ink">Language</div>
            <LanguagePicker
              selected={languages}
              onToggle={toggleLanguage}
              onRemove={(lang) =>
                setLanguages(languages.filter((l) => l !== lang))
              }
            />

            {/* Voices accordion */}
            <button
              type="button"
              onClick={() => setVoicesOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-surface border border-border-strong rounded-md text-[13px] font-semibold text-ink hover:bg-surface-2"
              aria-expanded={voicesOpen}
            >
              <span>Voices</span>
              <Icon
                name="chevron-down"
                size={14}
                className={cn(
                  "text-ink-3 transition-transform",
                  voicesOpen && "rotate-180",
                )}
              />
            </button>
            {voicesOpen ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {VOICES_BY_GENDER[gender].map((v) => {
                  const selected = voiceId === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setVoiceId(v.id);
                        // Wire the picker to the runtime — swap the
                        // preseeded liveVoiceId to whichever D-ID voice
                        // this card maps to. Skipped if the persona
                        // already has a hand-picked HeyGen liveAvatarId
                        // (that route carries its own voice) so we don't
                        // clobber the admin's explicit choice.
                        if (liveAvatarId) return;
                        const mapped = INTERNAL_TO_DID_VOICE[v.id];
                        if (mapped) {
                          setLiveVoiceId(mapped.id);
                          setLiveVoiceName(mapped.name);
                        }
                      }}
                      className={cn(
                        "text-left px-3 py-2 rounded-md border transition-colors",
                        selected
                          ? "border-accent bg-accent-pale/30"
                          : "border-border bg-surface hover:border-accent-pale",
                      )}
                    >
                      <div className="text-[13px] font-semibold text-ink">
                        {v.label}
                      </div>
                      <div className="text-[11.5px] text-ink-3">{v.tone}</div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* ── Roleplay voice (ElevenLabs) ─────────────────────────
              Trainee-facing spoken audio. Independent from the "Voices"
              accordion above (which maps to the D-ID streaming avatar).
              null → the player auto-picks by avatarGender. */}
          <div className="bg-surface border border-border rounded-[10px] p-4 space-y-3">
            <button
              type="button"
              onClick={() => setElevenVoicesOpen((o) => !o)}
              className="w-full flex items-center justify-between text-left"
              aria-expanded={elevenVoicesOpen}
            >
              <div>
                <div className="text-[13px] font-semibold text-ink">
                  Roleplay voice
                </div>
                <div className="text-[11.5px] text-ink-3 mt-0.5">
                  {elevenLabsVoiceId
                    ? `Trainees hear ${
                        voicesByGender("female")
                          .concat(voicesByGender("male"))
                          .find((v) => v.id === elevenLabsVoiceId)?.name ??
                        libraryVoiceName ??
                        "custom voice"
                      }`
                    : `Auto — picks a ${gender === "male" ? "male" : "female"} voice for the persona`}
                </div>
              </div>
              <Icon
                name="chevron-down"
                size={14}
                className={cn(
                  "text-ink-3 transition-transform",
                  elevenVoicesOpen && "rotate-180",
                )}
              />
            </button>
            {elevenVoicesOpen ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setElevenLabsVoiceId(null)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md border transition-colors",
                    elevenLabsVoiceId === null
                      ? "border-accent bg-accent-pale/30"
                      : "border-border bg-surface hover:border-accent-pale",
                  )}
                >
                  <div className="text-[13px] font-semibold text-ink">
                    Auto (match persona gender)
                  </div>
                  <div className="text-[11.5px] text-ink-3">
                    Trainee player picks a{" "}
                    {gender === "male" ? "male" : "female"} voice.
                  </div>
                </button>
                <div className="grid gap-2 sm:grid-cols-2">
                  {voicesByGender(gender === "neutral" ? "female" : gender).map(
                    (v) => {
                      const selected = elevenLabsVoiceId === v.id;
                      const previewing = previewingVoiceId === v.id;
                      return (
                        <div
                          key={v.id}
                          className={cn(
                            "flex items-start gap-2 px-3 py-2 rounded-md border transition-colors",
                            selected
                              ? "border-accent bg-accent-pale/30"
                              : "border-border bg-surface",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setElevenLabsVoiceId(v.id);
                              setLibraryVoiceName(null);
                            }}
                            className="flex-1 min-w-0 text-left"
                          >
                            <div className="text-[13px] font-semibold text-ink">
                              {v.name}
                            </div>
                            <div className="text-[11.5px] text-ink-3">
                              {v.tone ?? ""}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => previewVoice(v)}
                            disabled={previewing}
                            aria-label={`Preview ${v.name}`}
                            title="Play a sample"
                            className="shrink-0 w-8 h-8 grid place-items-center rounded-md border border-border-strong bg-surface hover:bg-surface-2 disabled:opacity-60"
                          >
                            <Icon
                              name={previewing ? "history" : "play"}
                              size={12}
                            />
                          </button>
                        </div>
                      );
                    },
                  )}
                </div>

                {/* Library search — the escape hatch out of the curated
                    grid above. Opens a modal that hits ElevenLabs's full
                    shared-voices catalog with Indian voices at the top. */}
                <button
                  type="button"
                  onClick={() => setLibraryOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-dashed border-border-strong bg-surface hover:bg-surface-2 text-[12.5px] font-semibold text-ink-2"
                >
                  <Icon name="ai-sparkle" size={11} />
                  Browse voice library (Indian, Hindi, and more)
                </button>
              </div>
            ) : null}
          </div>

          {libraryOpen ? (
            <VoiceLibraryModal
              initialQuery={{
                gender: gender === "neutral" ? "female" : gender,
                accent: "indian",
              }}
              onPick={(voiceId, name) => {
                setElevenLabsVoiceId(voiceId);
                setLibraryVoiceName(name);
                setLibraryOpen(false);
              }}
              onClose={() => setLibraryOpen(false)}
            />
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-md bg-[#dadbe6] text-ink text-[13px] font-semibold hover:bg-[#c8c9d6]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="px-5 py-2 rounded-md bg-surface border border-border-strong text-ink text-[13px] font-semibold hover:bg-surface-2"
          >
            Save
          </button>
        </div>
      </div>

      {pickerOpen ? (
        <AvatarPickerModal
          currentAvatarId={liveAvatarId ?? undefined}
          onClose={() => setPickerOpen(false)}
          onPick={(a: PickerAvatar) => {
            setLiveAvatarId(a.id);
            setLiveAvatarName(a.name);
            setLiveVoiceId(a.voiceId);
            setLiveVoiceName(a.voiceName);
            // HeyGen's catalogue picker doesn't expose a still-image URL
            // we can render — clear it so the audio surface falls back
            // to initials rather than showing a stale D-ID portrait.
            setLiveDisplayUrl(null);
            setPickerOpen(false);
          }}
        />
      ) : null}

      {didPickerOpen ? (
        <DidPortraitPickerModal
          portraits={savedPortraits}
          currentSourceUrl={liveAvatarId ?? undefined}
          onClose={() => setDidPickerOpen(false)}
          onPick={(p) => {
            setLiveAvatarId(p.sourceUrl);
            setLiveAvatarName(p.label);
            setLiveVoiceId(p.voiceId);
            setLiveVoiceName(p.voiceName);
            setLiveDisplayUrl(p.displayUrl);
            setDidPickerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[13px] font-semibold text-ink">{label}</span>
      {children}
    </label>
  );
}

function PillGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string }[];
}) {
  return (
    <div className="inline-flex items-center bg-surface-2 border border-border rounded-md p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          suppressHydrationWarning
          className={cn(
            "px-3.5 py-1 rounded text-[12px] font-semibold transition-colors",
            value === o.key
              ? "bg-accent text-white"
              : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LanguagePicker({
  selected,
  onToggle,
  onRemove,
}: {
  selected: string[];
  onToggle: (lang: string) => void;
  onRemove: (lang: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <div
        className="min-h-[40px] bg-surface border border-border-strong rounded-md px-2 py-1.5 flex items-center gap-1.5 flex-wrap cursor-text"
        onClick={() => setOpen(true)}
      >
        {selected.length === 0 ? (
          <span className="text-[12.5px] text-ink-3 px-1">
            Select languages…
          </span>
        ) : null}
        {selected.map((l) => (
          <span
            key={l}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-2 border border-border text-[11.5px] text-ink"
          >
            {l}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(l);
              }}
              aria-label={`Remove ${l}`}
              className="text-ink-3 hover:text-bad"
            >
              ×
            </button>
          </span>
        ))}
        <div className="ml-auto flex items-center gap-1 text-ink-3">
          <span className="text-[14px] leading-none">×</span>
          <span className="h-4 w-px bg-border" />
          <Icon name="chevron-down" size={12} />
        </div>
      </div>
      {open ? (
        <div className="absolute z-20 left-0 right-0 mt-1 max-h-[220px] overflow-y-auto bg-surface border border-border rounded-md shadow-lg py-1">
          {LANGUAGES.map((lang) => {
            const checked = selected.includes(lang);
            return (
              <button
                key={lang}
                type="button"
                onClick={() => onToggle(lang)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-surface-2",
                  checked ? "text-accent font-semibold" : "text-ink",
                )}
              >
                <span
                  className={cn(
                    "w-3.5 h-3.5 rounded border grid place-items-center text-[9px] text-white",
                    checked
                      ? "bg-accent border-accent"
                      : "border-border bg-surface",
                  )}
                >
                  {checked ? "✓" : ""}
                </span>
                {lang}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
