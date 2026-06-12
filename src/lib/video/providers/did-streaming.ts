// D-ID Talks Streams driver.
//
// Docs: https://docs.d-id.com/reference/talks-streams-overview
//
// Distinct from the standard /talks render driver in did.ts — this
// produces a real-time WebRTC stream of a talking portrait that
// lip-syncs to text as we push it. Used by the live roleplay player.
//
// Flow (subset implemented server-side):
//   1. createSession  → POST /talks/streams                 → { id, session_id, offer, ice_servers }
//   2. submitAnswer   → POST /talks/streams/{id}/sdp        → { answer, session_id }       (browser → server → D-ID)
//   3. submitIce      → POST /talks/streams/{id}/ice        → { candidate, session_id }    (browser → server → D-ID, trickled)
//   4. submitText     → POST /talks/streams/{id}            → { script, session_id, … }    (server pushes a script chunk)
//   5. closeSession   → DELETE /talks/streams/{id}          → { session_id }
//
// Steps 1, 4, 5 are pure server. Steps 2 + 3 are server-relayed because
// the D-ID API key MUST stay server-side — we don't have a session-token
// concept the way HeyGen does. The relay routes live under
// /api/roleplay/streaming/did/*.

import type {
  DidStreamingCredentials,
  StartStreamingSessionInput,
  StreamingAvatarDriver,
} from "../streaming-types";
import { DID_SOURCE_URL_ERROR, isValidDidSourceUrl } from "../did-validation";

const DID_BASE = "https://api.d-id.com";
// No source-image fallback: D-ID retired the old public-presenter bucket,
// so any hardcoded default would 403. The session route already 412s
// when avatarId is missing; the validator below catches anything else.
const DEFAULT_VOICE_ID = "en-US-JennyNeural";

function authHeader(apiKey: string): string {
  return `Basic ${apiKey}`;
}

type DidStreamCreateResponse = {
  id?: string;
  session_id?: string;
  offer?: RTCSessionDescriptionInit;
  ice_servers?: RTCIceServer[];
};

export const didStreamingDriver: StreamingAvatarDriver = {
  kind: "did",

  async createSession(
    opts: StartStreamingSessionInput,
  ): Promise<DidStreamingCredentials> {
    if (!isValidDidSourceUrl(opts.avatarId)) {
      throw new Error(DID_SOURCE_URL_ERROR);
    }
    const payload = {
      source_url: opts.avatarId,
      stream_warmup: true,
    };
    const res = await fetch(`${DID_BASE}/talks/streams`, {
      method: "POST",
      headers: {
        Authorization: authHeader(opts.apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `d-id streams.new ${res.status}: ${text.slice(0, 200)}`,
      );
    }
    const json = (await res.json()) as DidStreamCreateResponse;
    if (!json.id || !json.session_id || !json.offer || !json.ice_servers) {
      throw new Error("d-id streams.new returned an incomplete payload");
    }
    return {
      provider: "did",
      streamId: json.id,
      sessionId: json.session_id,
      offer: json.offer,
      iceServers: json.ice_servers,
      raw: json as Record<string, unknown>,
    };
  },

  async closeSession(streamId: string, apiKey: string): Promise<void> {
    // Caller must include session_id in the body. We don't carry it on
    // this interface — callers that hold a sessionId should use
    // submitClose() instead. This implementation is a best-effort tear
    // down that D-ID will accept; if it fails, the server GCs the
    // stream after ~5 minutes idle.
    const res = await fetch(`${DID_BASE}/talks/streams/${streamId}`, {
      method: "DELETE",
      headers: { Authorization: authHeader(apiKey) },
    });
    if (!res.ok) {
      console.warn(`[did-streaming] delete ${res.status} ${streamId}`);
    }
  },
};

// ─── Relay helpers ───
//
// Called by the /api/roleplay/streaming/did/* routes. Each forwards a
// single browser-originated step to D-ID. Bundled here so all the D-ID
// HTTP knowledge lives next to the driver.

export async function submitAnswer(opts: {
  apiKey: string;
  streamId: string;
  sessionId: string;
  answer: RTCSessionDescriptionInit;
}): Promise<void> {
  const res = await fetch(
    `${DID_BASE}/talks/streams/${opts.streamId}/sdp`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader(opts.apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        answer: opts.answer,
        session_id: opts.sessionId,
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`d-id sdp ${res.status}: ${text.slice(0, 200)}`);
  }
}

export async function submitIceCandidate(opts: {
  apiKey: string;
  streamId: string;
  sessionId: string;
  candidate: RTCIceCandidateInit;
}): Promise<void> {
  // D-ID Talks Streams expects the candidate flattened — not wrapped.
  const body: Record<string, unknown> = {
    session_id: opts.sessionId,
    candidate: opts.candidate.candidate ?? "",
    sdpMid: opts.candidate.sdpMid ?? null,
    sdpMLineIndex: opts.candidate.sdpMLineIndex ?? null,
  };
  const res = await fetch(
    `${DID_BASE}/talks/streams/${opts.streamId}/ice`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader(opts.apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`d-id ice ${res.status}: ${text.slice(0, 200)}`);
  }
}

export async function submitSpeak(opts: {
  apiKey: string;
  streamId: string;
  sessionId: string;
  text: string;
  voiceId: string | null;
}): Promise<void> {
  const payload = {
    script: {
      type: "text",
      input: opts.text.slice(0, 1000),
      provider: {
        type: "microsoft",
        voice_id: opts.voiceId || DEFAULT_VOICE_ID,
      },
    },
    config: { fluent: true, pad_audio: 0.0 },
    session_id: opts.sessionId,
  };
  const res = await fetch(
    `${DID_BASE}/talks/streams/${opts.streamId}`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader(opts.apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`d-id speak ${res.status}: ${text.slice(0, 200)}`);
  }
}

export async function submitClose(opts: {
  apiKey: string;
  streamId: string;
  sessionId: string;
}): Promise<void> {
  const res = await fetch(
    `${DID_BASE}/talks/streams/${opts.streamId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: authHeader(opts.apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ session_id: opts.sessionId }),
    },
  );
  if (!res.ok) {
    // D-ID still tears the stream down on its side eventually. Log only.
    console.warn(`[did-streaming] close ${res.status} ${opts.streamId}`);
  }
}
