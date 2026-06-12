// HeyGen Streaming Avatar v1 driver.
//
// Docs: https://docs.heygen.com/reference/streaming-api
// (separate product from the standard /v2/video/generate render API
// already wired in /lib/video/providers/heygen.ts — uses a different
// "Streaming Avatar" subscription on the same HeyGen account.)
//
// Flow:
//   1. POST /v1/streaming.new           → session_id + access_token + url
//   2. (client) Build RTCPeerConnection with the returned LiveKit creds
//   3. POST /v1/streaming.start         → server flips the session live
//   4. (client) POST /v1/streaming.task → push text → avatar speaks
//   5. POST /v1/streaming.stop          → tear down
//
// Today we implement steps 1 (createSession) + 5 (closeSession) on the
// server. Steps 2-4 happen in the browser via the HeyGen Streaming
// SDK (see RoleplayPlayer's `useStreamingAvatar` hook). The reason
// for the split: step 1's access_token must NOT round-trip through
// the browser more than once (it's short-lived + tenant-scoped), and
// step 4 must happen low-latency from the browser so we don't add a
// server hop to every spoken sentence.

import type {
  StartStreamingSessionInput,
  StreamingAvatarDriver,
  StreamingSessionCredentials,
} from "../streaming-types";

const HEYGEN_BASE = "https://api.heygen.com";

export const heygenStreamingDriver: StreamingAvatarDriver = {
  kind: "heygen",

  async createSession(
    opts: StartStreamingSessionInput,
  ): Promise<StreamingSessionCredentials> {
    const res = await fetch(`${HEYGEN_BASE}/v1/streaming.new`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": opts.apiKey,
      },
      body: JSON.stringify({
        quality: "medium",
        avatar_name: opts.avatarId ?? undefined,
        voice: opts.voiceId ? { voice_id: opts.voiceId } : undefined,
        version: "v2",
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `heygen streaming.new ${res.status}: ${text.slice(0, 200)}`,
      );
    }
    const data = (await res.json()) as {
      data?: {
        session_id?: string;
        access_token?: string;
        url?: string;
        ice_servers2?: unknown;
      };
    };
    const d = data.data;
    if (!d?.session_id || !d?.access_token || !d?.url) {
      throw new Error("heygen streaming.new returned an incomplete payload");
    }
    return {
      provider: "heygen",
      sessionId: d.session_id,
      accessToken: d.access_token,
      url: d.url,
      raw: d as Record<string, unknown>,
    };
  },

  async closeSession(sessionId: string, apiKey: string): Promise<void> {
    const res = await fetch(`${HEYGEN_BASE}/v1/streaming.stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ session_id: sessionId }),
    });
    // Tear-down errors are non-fatal — provider will GC idle sessions
    // after a few minutes anyway. Log but don't throw.
    if (!res.ok) {
      console.warn(`[heygen-streaming] stop ${res.status} ${sessionId}`);
    }
  },
};
