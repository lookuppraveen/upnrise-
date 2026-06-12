// Curated list of Microsoft (Azure) Neural voices that D-ID's /talks
// and /talks/streams accept when provider.type is "microsoft". Heavy on
// Indian languages because that's the most common request — extend by
// pasting any voice id from
// https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support
// here and it will work upstream without code changes.

export type DidVoice = {
  id: string;
  name: string;
  lang: string;
  gender: "F" | "M";
};

export type DidVoiceGroup = {
  lang: string;
  label: string;
  voices: DidVoice[];
};

export const DID_VOICE_GROUPS: DidVoiceGroup[] = [
  {
    lang: "en-IN",
    label: "English (India)",
    voices: [
      { id: "en-IN-NeerjaNeural", name: "Neerja", lang: "en-IN", gender: "F" },
      { id: "en-IN-AnanyaNeural", name: "Ananya", lang: "en-IN", gender: "F" },
      { id: "en-IN-KavyaNeural", name: "Kavya", lang: "en-IN", gender: "F" },
      { id: "en-IN-PrabhatNeural", name: "Prabhat", lang: "en-IN", gender: "M" },
      { id: "en-IN-AaravNeural", name: "Aarav", lang: "en-IN", gender: "M" },
      { id: "en-IN-KunalNeural", name: "Kunal", lang: "en-IN", gender: "M" },
      { id: "en-IN-RehaanNeural", name: "Rehaan", lang: "en-IN", gender: "M" },
    ],
  },
  {
    lang: "hi-IN",
    label: "Hindi",
    voices: [
      { id: "hi-IN-SwaraNeural", name: "Swara", lang: "hi-IN", gender: "F" },
      { id: "hi-IN-AnanyaNeural", name: "Ananya", lang: "hi-IN", gender: "F" },
      { id: "hi-IN-KavyaNeural", name: "Kavya", lang: "hi-IN", gender: "F" },
      { id: "hi-IN-MadhurNeural", name: "Madhur", lang: "hi-IN", gender: "M" },
      { id: "hi-IN-AaravNeural", name: "Aarav", lang: "hi-IN", gender: "M" },
      { id: "hi-IN-KunalNeural", name: "Kunal", lang: "hi-IN", gender: "M" },
    ],
  },
  {
    lang: "ta-IN",
    label: "Tamil",
    voices: [
      { id: "ta-IN-PallaviNeural", name: "Pallavi", lang: "ta-IN", gender: "F" },
      { id: "ta-IN-ValluvarNeural", name: "Valluvar", lang: "ta-IN", gender: "M" },
    ],
  },
  {
    lang: "te-IN",
    label: "Telugu",
    voices: [
      { id: "te-IN-ShrutiNeural", name: "Shruti", lang: "te-IN", gender: "F" },
      { id: "te-IN-MohanNeural", name: "Mohan", lang: "te-IN", gender: "M" },
    ],
  },
  {
    lang: "bn-IN",
    label: "Bengali (India)",
    voices: [
      { id: "bn-IN-TanishaaNeural", name: "Tanishaa", lang: "bn-IN", gender: "F" },
      { id: "bn-IN-BashkarNeural", name: "Bashkar", lang: "bn-IN", gender: "M" },
    ],
  },
  {
    lang: "mr-IN",
    label: "Marathi",
    voices: [
      { id: "mr-IN-AarohiNeural", name: "Aarohi", lang: "mr-IN", gender: "F" },
      { id: "mr-IN-ManoharNeural", name: "Manohar", lang: "mr-IN", gender: "M" },
    ],
  },
  {
    lang: "kn-IN",
    label: "Kannada",
    voices: [
      { id: "kn-IN-SapnaNeural", name: "Sapna", lang: "kn-IN", gender: "F" },
      { id: "kn-IN-GaganNeural", name: "Gagan", lang: "kn-IN", gender: "M" },
    ],
  },
  {
    lang: "gu-IN",
    label: "Gujarati",
    voices: [
      { id: "gu-IN-DhwaniNeural", name: "Dhwani", lang: "gu-IN", gender: "F" },
      { id: "gu-IN-NiranjanNeural", name: "Niranjan", lang: "gu-IN", gender: "M" },
    ],
  },
  {
    lang: "ml-IN",
    label: "Malayalam",
    voices: [
      { id: "ml-IN-SobhanaNeural", name: "Sobhana", lang: "ml-IN", gender: "F" },
      { id: "ml-IN-MidhunNeural", name: "Midhun", lang: "ml-IN", gender: "M" },
    ],
  },
  {
    lang: "en-US",
    label: "English (US)",
    voices: [
      { id: "en-US-JennyNeural", name: "Jenny", lang: "en-US", gender: "F" },
      { id: "en-US-AriaNeural", name: "Aria", lang: "en-US", gender: "F" },
      { id: "en-US-GuyNeural", name: "Guy", lang: "en-US", gender: "M" },
    ],
  },
  {
    lang: "en-GB",
    label: "English (UK)",
    voices: [
      { id: "en-GB-SoniaNeural", name: "Sonia", lang: "en-GB", gender: "F" },
      { id: "en-GB-RyanNeural", name: "Ryan", lang: "en-GB", gender: "M" },
    ],
  },
];

// Flat lookup. Returns the friendly "Neerja · Indian Female (English)"
// label for a given voice id, or null if it's a free-form value the
// admin pasted by hand (custom voice).
export function lookupDidVoice(id: string | null | undefined): DidVoice | null {
  if (!id) return null;
  for (const group of DID_VOICE_GROUPS) {
    const v = group.voices.find((x) => x.id === id);
    if (v) return v;
  }
  return null;
}

export function formatDidVoiceLabel(v: DidVoice): string {
  return `${v.name} · ${v.gender === "F" ? "Female" : "Male"} (${v.lang})`;
}
