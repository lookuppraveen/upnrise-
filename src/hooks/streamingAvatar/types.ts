// Internal client interface the useStreamingAvatar hook talks to.
// Each implementation hides a provider's transport (HeyGen LiveAvatar
// SDK vs raw RTCPeerConnection for D-ID) behind the same lifecycle.

export type AvatarClientState =
  | "connecting"
  | "stream-ready"
  | "connected"
  | "speak-started"
  | "speak-ended"
  | "disconnected";

export type AvatarClientEventHandler = (state: AvatarClientState) => void;

export interface AvatarClient {
  /** Open the WebRTC connection. Resolves once it's safe to call speak. */
  start(): Promise<void>;
  /** Tear down. Safe to call repeatedly; idempotent. */
  stop(): Promise<void>;
  /** Attach the remote media stream to a <video> element. */
  attach(el: HTMLMediaElement): void;
  /** Push text the avatar should speak. */
  speak(text: string): Promise<void>;
  /** Subscribe to lifecycle transitions. */
  on(handler: AvatarClientEventHandler): void;
}
