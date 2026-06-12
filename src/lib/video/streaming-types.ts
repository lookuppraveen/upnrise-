// Streaming avatar driver interface — distinct from the existing
// video-render drivers (HeyGen/Synthesia/D-ID) which produce a finished
// MP4. Streaming avatars expose a real-time WebRTC stream of a talking
// head that lip-syncs to TTS as text arrives.
//
// Today HeyGen Streaming Avatar v1 and D-ID Talks Streams are wired.
// HeyGen uses LiveAvatar's session-token model (the browser SDK opens
// the WebRTC connection itself with a short-lived token). D-ID uses raw
// WebRTC: we mint the stream server-side, hand the SDP offer + ICE
// servers to the browser, and the browser does the SDP answer / trickle
// ICE / speak / close dance back through our server (the D-ID API key
// never reaches the browser).

export type StreamingAvatarProvider = "heygen" | "did" | "tavus";

export type StartStreamingSessionInput = {
  apiKey: string;
  avatarId: string | null;
  voiceId: string | null;
  /** Display title — surfaced in provider dashboards for debugging. */
  title?: string;
};

// HeyGen LiveAvatar session — the SDK opens the WebRTC connection
// itself using these creds; we never see the room traffic.
export type HeyGenStreamingCredentials = {
  provider: "heygen";
  /** Bucket the player loads + uses to drive the connection. */
  sessionId: string;
  /** Bearer token the SDK sends with subsequent requests. */
  accessToken: string;
  /** URL the WebRTC peer connection points at. */
  url: string;
  /** Realtime data (ICE servers etc.) the SDK needs. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: Record<string, any>;
};

// D-ID Talks Streams session — the browser builds RTCPeerConnection
// from offer + iceServers, sends the answer back via our server, then
// relays trickle ICE candidates + speak commands the same way.
export type DidStreamingCredentials = {
  provider: "did";
  /** D-ID stream id — used in every follow-up call. */
  streamId: string;
  /** D-ID session id — required body field on every follow-up call. */
  sessionId: string;
  /** Offer the browser feeds into pc.setRemoteDescription. */
  offer: RTCSessionDescriptionInit;
  /** ICE servers the browser passes to new RTCPeerConnection({...}). */
  iceServers: RTCIceServer[];
  /** Raw D-ID response for debugging. */
  raw: Record<string, unknown>;
};

/**
 * A short-lived, client-usable connection blob the browser uses to open
 * the WebRTC stream. Discriminated union so callers branch on `provider`
 * and the client picks the right transport. Never persist this — fresh
 * credentials are minted per session.
 */
export type StreamingSessionCredentials =
  | HeyGenStreamingCredentials
  | DidStreamingCredentials;

export interface StreamingAvatarDriver {
  readonly kind: StreamingAvatarProvider;
  /**
   * Create a streaming session and return short-lived credentials. The
   * client opens the WebRTC connection itself using the provider's
   * SDK / fetch + RTCPeerConnection.
   */
  createSession(
    opts: StartStreamingSessionInput,
  ): Promise<StreamingSessionCredentials>;
  /** Close out a session so the provider doesn't bill for an idle stream. */
  closeSession(sessionId: string, apiKey: string): Promise<void>;
}
