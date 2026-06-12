// HeyGen LiveAvatar client — wraps @heygen/liveavatar-web-sdk behind
// the AvatarClient interface. Lifecycle notes mirror the original
// useStreamingAvatar implementation:
//
//   - SESSION_STREAM_READY fires before the SDK is CONNECTED. The SDK
//     rejects repeat() calls before CONNECTED with "Session needs to
//     be connected", so we only emit "connected" on SESSION_STATE_CHANGED
//     → CONNECTED. The hook buffers speak() until then.
//   - stop() MUST wait for start() to settle. Calling stop() before
//     CONNECTED is a no-op on the SDK side, which silently leaks the
//     session on LiveAvatar's backend and burns the tenant's
//     concurrency cap.

import type { AvatarClient, AvatarClientEventHandler } from "./types";

export type HeyGenStartPayload = {
  token: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SdkSession = any;

export function createHeyGenAvatarClient(
  payload: HeyGenStartPayload,
): AvatarClient {
  let session: SdkSession | null = null;
  let startPromise: Promise<void> | null = null;
  let pendingEl: HTMLMediaElement | null = null;
  let streamReady = false;
  let connected = false;
  let handler: AvatarClientEventHandler | null = null;
  const pendingSpeech: string[] = [];

  function emit(state: Parameters<AvatarClientEventHandler>[0]) {
    if (handler) handler(state);
  }

  async function start(): Promise<void> {
    emit("connecting");
    const mod = await import("@heygen/liveavatar-web-sdk");
    const { LiveAvatarSession, SessionEvent, AgentEventsEnum, SessionState } =
      mod;

    // voiceChat: false — we drive the avatar via session.repeat()
    // with the AI's pre-generated reply text. Turning voiceChat on
    // would have the SDK try to capture the trainee's mic for STT,
    // which we already handle in the player via WebSpeech.
    session = new LiveAvatarSession(payload.token, { voiceChat: false });

    session.on(SessionEvent.SESSION_STREAM_READY, () => {
      streamReady = true;
      if (pendingEl) {
        try {
          session.attach(pendingEl);
        } catch (e) {
          console.warn("[heygen-client] attach on ready failed:", e);
        }
      }
      emit("stream-ready");
    });
    session.on(SessionEvent.SESSION_STATE_CHANGED, (sdkState: unknown) => {
      if (sdkState === SessionState.CONNECTED) {
        connected = true;
        emit("connected");
        for (const text of pendingSpeech) {
          try {
            session.repeat(text);
          } catch (e) {
            console.warn("[heygen-client] flush repeat failed:", e);
          }
        }
        pendingSpeech.length = 0;
      } else if (
        sdkState === SessionState.DISCONNECTED ||
        sdkState === SessionState.DISCONNECTING
      ) {
        connected = false;
      }
    });
    session.on(SessionEvent.SESSION_DISCONNECTED, () => {
      streamReady = false;
      connected = false;
      emit("disconnected");
    });
    session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => emit("speak-started"));
    session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => emit("speak-ended"));

    startPromise = session.start();
    await startPromise;
  }

  async function stop(): Promise<void> {
    const s = session;
    const startP = startPromise;
    session = null;
    startPromise = null;
    streamReady = false;
    connected = false;
    pendingSpeech.length = 0;
    if (!s) return;
    try {
      if (startP) await startP.catch(() => {});
      await s.stop();
    } catch {
      // Tear-down errors are non-fatal — LiveAvatar GCs idle sessions.
    }
  }

  function attach(el: HTMLMediaElement) {
    pendingEl = el;
    if (session && streamReady) {
      try {
        session.attach(el);
      } catch (e) {
        console.warn("[heygen-client] attach failed:", e);
      }
    }
  }

  async function speak(text: string): Promise<void> {
    if (!session) return;
    if (!connected) {
      pendingSpeech.push(text);
      return;
    }
    try {
      session.repeat(text);
    } catch (e) {
      console.warn("[heygen-client] speak failed:", e);
    }
  }

  function on(h: AvatarClientEventHandler) {
    handler = h;
  }

  return { start, stop, attach, speak, on };
}
