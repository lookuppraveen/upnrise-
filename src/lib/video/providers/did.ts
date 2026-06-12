// D-ID Talks driver.
//
// API surface used:
//   POST /talks               → returns { id, status, created_at, ... }
//   GET  /talks/{id}          → returns { id, status, result_url, error?, ... }
//
// D-ID stores the source portrait as a URL (`source_url`). We surface that
// through the existing `avatarId` field on the VideoProvider row — so the
// admin pastes the public URL of their presenter image (D-ID-hosted, S3,
// CDN, etc.) into "Avatar ID" when creating the provider row.
//
// The `voiceId` field maps to the Microsoft TTS voice name (e.g.
// "en-US-JennyNeural"). D-ID supports Microsoft, ElevenLabs, and Amazon
// providers — we default to Microsoft for the lowest-friction default.
//
// Auth: `Authorization: Basic <api_key>`. D-ID issues a single token that
// is already pre-encoded; the literal "Basic" prefix is what their docs
// expect, not real HTTP Basic encoding.
//
// Docs: https://docs.d-id.com/reference/talks-overview

import type {
  CreateVideoOpts,
  RenderJobStatus,
  VideoDriver,
} from "@/lib/video/types";
import { DID_SOURCE_URL_ERROR, isValidDidSourceUrl } from "@/lib/video/did-validation";

const DID_BASE = "https://api.d-id.com";
// No source-image fallback: D-ID retired the old public-presenter bucket,
// so any hardcoded default would 403. Callers must supply avatarId; the
// validator below converts the no-value case into a clear admin-facing error.
const DEFAULT_VOICE_ID = "en-US-JennyNeural";

type DidCreateResponse = {
  id?: string;
  status?: string;
};

type DidStatusResponse = {
  id?: string;
  status?: string;
  result_url?: string;
  error?: { description?: string; message?: string } | string;
};

function authHeader(apiKey: string): string {
  return `Basic ${apiKey}`;
}

export const didDriver: VideoDriver = {
  kind: "did",

  async createVideo(opts: CreateVideoOpts) {
    const { apiKey, script, avatarId, voiceId, callbackUrl } = opts;
    if (!isValidDidSourceUrl(avatarId)) {
      throw new Error(DID_SOURCE_URL_ERROR);
    }
    const payload: Record<string, unknown> = {
      source_url: avatarId,
      script: {
        type: "text",
        input: script.slice(0, 4000),
        provider: {
          type: "microsoft",
          voice_id: voiceId || DEFAULT_VOICE_ID,
        },
      },
      config: { fluent: true, pad_audio: 0.0 },
      ...(callbackUrl ? { webhook: callbackUrl } : {}),
    };

    const res = await fetch(`${DID_BASE}/talks`, {
      method: "POST",
      headers: {
        Authorization: authHeader(apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `d-id create failed (${res.status}): ${text.slice(0, 300)}`,
      );
    }
    const json = (await res.json()) as DidCreateResponse;
    if (!json.id) throw new Error("d-id: no id in response");
    return { jobId: json.id };
  },

  async fetchStatus(jobId: string, apiKey: string) {
    const res = await fetch(`${DID_BASE}/talks/${jobId}`, {
      headers: { Authorization: authHeader(apiKey) },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return {
        status: "failed" as RenderJobStatus,
        error: `status ${res.status}`,
      };
    }
    const json = (await res.json()) as DidStatusResponse;
    const raw = (json.status ?? "").toLowerCase();
    const mapped: RenderJobStatus =
      raw === "done"
        ? "ready"
        : raw === "error" || raw === "rejected"
          ? "failed"
          : raw === "started"
            ? "rendering"
            : "queued";
    const errorMsg =
      typeof json.error === "string"
        ? json.error
        : json.error?.description ?? json.error?.message;
    return {
      status: mapped,
      videoUrl: mapped === "ready" ? json.result_url : undefined,
      error: errorMsg,
    };
  },
};
