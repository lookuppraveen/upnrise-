// Synthesia v2 driver.
//
// API surface used:
//   POST /v2/videos           → returns { id, status, ... }
//   GET  /v2/videos/{id}      → returns { id, status, download, error, ... }
//
// Status mapping:
//   queued | in_progress       → "rendering" (we collapse queued for parity with HeyGen)
//   complete                   → "ready"     (download URL in .download)
//   rejected | failed          → "failed"
//
// Auth header is `Authorization: <api_key>` (no scheme prefix — Synthesia's
// own docs show the raw key, not a Bearer/Basic token). Webhooks are
// honoured when `callbackUrl` is supplied.
//
// Docs: https://docs.synthesia.io/reference/create-a-video

import type {
  CreateVideoOpts,
  RenderJobStatus,
  VideoDriver,
} from "@/lib/video/types";

const SYNTHESIA_BASE = "https://api.synthesia.io";
// Sensible defaults so a fresh tenant can render *something* before
// the admin picks an avatar/voice. Override on the VideoProvider row.
const DEFAULT_AVATAR_ID = "anna_costume1_cameraA";
const DEFAULT_BACKGROUND = "off_white";

type SynthesiaCreateResponse = {
  id?: string;
  status?: string;
};

type SynthesiaStatusResponse = {
  id?: string;
  status?: string;
  download?: string;
  error?: { message?: string } | string;
};

export const synthesiaDriver: VideoDriver = {
  kind: "synthesia",

  async createVideo(opts: CreateVideoOpts) {
    const { apiKey, script, title, avatarId, voiceId, callbackUrl } = opts;
    const input: Record<string, unknown> = {
      scriptText: script.slice(0, 6000),
      avatar: avatarId || DEFAULT_AVATAR_ID,
      background: DEFAULT_BACKGROUND,
    };
    // Synthesia attaches voice via `avatarSettings.voice` (optional —
    // omitting falls back to the avatar's native voice).
    if (voiceId) {
      input.avatarSettings = { voice: voiceId };
    }

    const payload: Record<string, unknown> = {
      test: false,
      title,
      input: [input],
      visibility: "private",
      ...(callbackUrl
        ? { callbackId: title.slice(0, 80), callbackUrl }
        : {}),
    };

    const res = await fetch(`${SYNTHESIA_BASE}/v2/videos`, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `synthesia create failed (${res.status}): ${text.slice(0, 300)}`,
      );
    }
    const json = (await res.json()) as SynthesiaCreateResponse;
    if (!json.id) throw new Error("synthesia: no id in response");
    return { jobId: json.id };
  },

  async fetchStatus(jobId: string, apiKey: string) {
    const res = await fetch(`${SYNTHESIA_BASE}/v2/videos/${jobId}`, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return {
        status: "failed" as RenderJobStatus,
        error: `status ${res.status}`,
      };
    }
    const json = (await res.json()) as SynthesiaStatusResponse;
    const raw = (json.status ?? "").toLowerCase();
    const mapped: RenderJobStatus =
      raw === "complete"
        ? "ready"
        : raw === "rejected" || raw === "failed"
          ? "failed"
          : raw === "in_progress" || raw === "queued"
            ? "rendering"
            : "queued";
    const errorMsg =
      typeof json.error === "string"
        ? json.error
        : json.error?.message;
    return {
      status: mapped,
      videoUrl: mapped === "ready" ? json.download : undefined,
      error: errorMsg,
    };
  },
};
