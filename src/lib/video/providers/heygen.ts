// HeyGen v2 driver.
//
// API surface used:
//   POST /v2/video/generate         → returns { data: { video_id } }
//   GET  /v1/video_status.get?video_id=… → status + video_url
//
// We send a simple single-scene script with the configured avatar +
// voice. HeyGen supports SSML and more elaborate scene layouts; v1 of
// this integration keeps the payload flat. callbackUrl is honoured when
// supplied — HeyGen will POST a status update when the render finishes.
//
// Docs: https://docs.heygen.com/reference/

import type {
  CreateVideoOpts,
  RenderJobStatus,
  VideoDriver,
} from "@/lib/video/types";

const HEYGEN_BASE = "https://api.heygen.com";
// Fallback IDs picked from HeyGen's public default avatars so an admin
// can render *something* immediately without first browsing the catalog.
// Override on the VideoProvider row for production use.
const DEFAULT_AVATAR_ID = "Daisy-inskirt-20220818";
const DEFAULT_VOICE_ID = "2d5b0e6cf36f460aa7fc47e3eee4ba54";

export const heygenDriver: VideoDriver = {
  kind: "heygen",

  async createVideo(opts: CreateVideoOpts) {
    const { apiKey, script, title, avatarId, voiceId, callbackUrl } = opts;
    const payload = {
      video_inputs: [
        {
          character: {
            type: "avatar",
            avatar_id: avatarId || DEFAULT_AVATAR_ID,
            avatar_style: "normal",
          },
          voice: {
            type: "text",
            input_text: script.slice(0, 5000),
            voice_id: voiceId || DEFAULT_VOICE_ID,
          },
        },
      ],
      dimension: { width: 1280, height: 720 },
      title,
      ...(callbackUrl ? { callback_id: title, callback_url: callbackUrl } : {}),
    };

    const res = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`heygen create failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as { data?: { video_id?: string } };
    const jobId = json.data?.video_id;
    if (!jobId) throw new Error("heygen: no video_id in response");
    return { jobId };
  },

  async fetchStatus(jobId: string, apiKey: string) {
    const url = new URL(`${HEYGEN_BASE}/v1/video_status.get`);
    url.searchParams.set("video_id", jobId);
    const res = await fetch(url.toString(), {
      headers: { "X-Api-Key": apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return {
        status: "failed" as RenderJobStatus,
        error: `status ${res.status}`,
      };
    }
    const json = (await res.json()) as {
      data?: {
        status?: string;
        video_url?: string;
        error?: { message?: string };
      };
    };
    const raw = json.data?.status ?? "";
    const mapped: RenderJobStatus =
      raw === "completed"
        ? "ready"
        : raw === "failed"
          ? "failed"
          : raw === "processing"
            ? "rendering"
            : "queued";
    return {
      status: mapped,
      videoUrl: json.data?.video_url,
      error: json.data?.error?.message,
    };
  },
};
