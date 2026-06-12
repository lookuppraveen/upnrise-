// useStreamingAvatar — provider-agnostic wrapper around HeyGen LiveAvatar
// and D-ID Talks Streams. The /api/roleplay/streaming/session endpoint
// returns a discriminated payload; we instantiate the matching client
// (HeyGen SDK vs raw RTCPeerConnection) and surface a single state
// machine to the player.
//
// Public surface stays compatible with the older HeyGen-only version:
//   - state           : "idle" | "connecting" | "ready" | "speaking" | "failed"
//   - attach(el)      : wire the remote stream to a <video> element
//   - speak(text)     : push a line for the avatar to speak (buffered if
//                       called before "ready")
//   - error           : null until something blows up
//
// Lifecycle:
//   1. enable=true → POST /api/roleplay/streaming/session → discriminated payload
//   2. Build the right client; wire its event handler to flip our state
//   3. client.start() — emits "stream-ready" then "connected"; we
//      surface "ready" only on "connected" so speak() is always safe.
//   4. AVATAR speak-started/-ended → "speaking" / "ready"
//   5. caller invokes speak(text); pre-"ready" calls buffer and flush.
//   6. enable=false (or unmount) → client.stop() + cleanup.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AvatarClient } from "./streamingAvatar/types";
import { createHeyGenAvatarClient } from "./streamingAvatar/heygenClient";
import { createDidAvatarClient } from "./streamingAvatar/didClient";

export type StreamingAvatarState =
  | "idle"
  | "connecting"
  | "ready"
  | "speaking"
  | "failed";

type SessionResponse =
  | {
      provider: "heygen";
      token: string;
      avatarId: string | null;
      voiceId: string | null;
    }
  | {
      provider: "did";
      streamId: string;
      sessionId: string;
      offer: RTCSessionDescriptionInit;
      iceServers: RTCIceServer[];
      avatarId: string | null;
      voiceId: string | null;
    };

export function useStreamingAvatar(opts: {
  enabled: boolean;
  /** Optional. When provided, the session endpoint looks at the module's
   * persona for a per-module avatar override before falling back to the
   * tenant's provider default. */
  moduleId?: string;
}): {
  state: StreamingAvatarState;
  attach: (el: HTMLMediaElement | null) => void;
  speak: (text: string) => Promise<void>;
  error: string | null;
} {
  const { enabled, moduleId } = opts;
  const [state, setState] = useState<StreamingAvatarState>("idle");
  const [error, setError] = useState<string | null>(null);
  // Bumped to trigger a fresh effect run when we want to re-mint the
  // session (D-ID idles out streams after ~5min — we auto-reconnect
  // rather than leave the trainee with a "LOADING…" placeholder).
  const [restartKey, setRestartKey] = useState(0);
  const clientRef = useRef<AvatarClient | null>(null);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const pendingElRef = useRef<HTMLMediaElement | null>(null);
  const connectedRef = useRef(false);
  const pendingSpeechRef = useRef<string[]>([]);
  // Auto-reconnect bookkeeping. Only triggers when we previously
  // reached "connected" — protects against tight failure loops when
  // the initial mint itself is broken. Capped at 3 attempts in any
  // 60s window so we don't hammer D-ID.
  const wasConnectedRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const lastReconnectAtRef = useRef(0);

  const stop = useCallback(async () => {
    const c = clientRef.current;
    const startP = startPromiseRef.current;
    clientRef.current = null;
    startPromiseRef.current = null;
    connectedRef.current = false;
    pendingSpeechRef.current = [];
    setState("idle");
    if (c) {
      try {
        if (startP) await startP.catch(() => {});
        await c.stop();
      } catch {
        // ignore — provider GCs idle sessions
      }
    }
  }, []);

  // When the caller flips `enabled` off (toggled audio-only, navigated
  // away, unmounted), reset the auto-reconnect tracking so the next
  // fresh enable doesn't think it's reconnecting from a stale session.
  useEffect(() => {
    if (!enabled) {
      wasConnectedRef.current = false;
      reconnectAttemptsRef.current = 0;
      lastReconnectAtRef.current = 0;
    }
  }, [enabled]);

  const attach = useCallback((el: HTMLMediaElement | null) => {
    pendingElRef.current = el;
    const c = clientRef.current;
    if (c && el) {
      try {
        c.attach(el);
      } catch (e) {
        console.warn("[streaming-avatar] attach failed:", e);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    console.log("[streaming-avatar] effect ran. enabled =", enabled, "moduleId =", moduleId);
    if (!enabled) {
      console.log("[streaming-avatar] disabled — calling stop()");
      // stop() resets state to "idle". Calling setState in the effect
      // body is the intended UX — when the caller flips enabled off,
      // the player should snap out of any active state immediately.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void stop();
      return;
    }
    (async () => {
      setError(null);
      setState("connecting");
      console.log("[streaming-avatar] minting session…");
      try {
        const res = await fetch("/api/roleplay/streaming/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(moduleId ? { moduleId } : {}),
        });
        console.log("[streaming-avatar] session response status:", res.status);
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `session mint ${res.status}`);
        }
        const session = (await res.json()) as SessionResponse;
        console.log("[streaming-avatar] session payload:", { provider: session.provider, avatarId: session.avatarId, hasOffer: "offer" in session && Boolean(session.offer) });
        if (cancelled) return;
        if (!session.avatarId) {
          throw new Error(
            session.provider === "did"
              ? "no source image configured — paste a portrait URL at /admin/video-providers"
              : "video provider has no avatarId set — add one at /admin/video-providers",
          );
        }

        let client: AvatarClient;
        if (session.provider === "heygen") {
          client = createHeyGenAvatarClient({ token: session.token });
        } else {
          client = createDidAvatarClient({
            streamId: session.streamId,
            sessionId: session.sessionId,
            offer: session.offer,
            iceServers: session.iceServers,
            voiceId: session.voiceId,
          });
        }
        clientRef.current = client;

        client.on((s) => {
          if (cancelled) return;
          console.log("[streaming-avatar] client event:", s);
          if (s === "connected") {
            connectedRef.current = true;
            wasConnectedRef.current = true;
            reconnectAttemptsRef.current = 0;
            setState("ready");
            const q = pendingSpeechRef.current;
            pendingSpeechRef.current = [];
            for (const text of q) void client.speak(text);
          } else if (s === "stream-ready") {
            const el = pendingElRef.current;
            if (el) client.attach(el);
          } else if (s === "disconnected") {
            connectedRef.current = false;
            // If we successfully connected earlier in this session, the
            // disconnect is almost certainly D-ID's idle timeout. Mint
            // a fresh stream automatically so the trainee's next reply
            // isn't stuck on "LOADING…". Otherwise (never connected),
            // surface the disconnection as idle.
            if (wasConnectedRef.current && enabled) {
              const now = Date.now();
              if (now - lastReconnectAtRef.current > 60_000) {
                reconnectAttemptsRef.current = 0;
              }
              if (reconnectAttemptsRef.current >= 3) {
                console.warn(
                  "[streaming-avatar] too many reconnects in the last 60s — staying idle",
                );
                setState("idle");
                return;
              }
              reconnectAttemptsRef.current += 1;
              lastReconnectAtRef.current = now;
              console.log(
                `[streaming-avatar] auto-reconnecting (attempt ${reconnectAttemptsRef.current})…`,
              );
              setState("connecting");
              setRestartKey((k) => k + 1);
            } else {
              setState("idle");
            }
          } else if (s === "speak-started") {
            setState("speaking");
          } else if (s === "speak-ended") {
            setState("ready");
          }
        });

        const startP = client.start();
        startPromiseRef.current = startP;
        await startP;
        if (cancelled) {
          await client.stop().catch(() => {});
          return;
        }
      } catch (e) {
        if (cancelled) return;
        const raw = e instanceof Error ? e.message : "Failed to start avatar";
        console.warn("[streaming-avatar] start failed:", raw);
        const msg = /concurrency limit/i.test(raw)
          ? `${raw}. Close other tabs of the trainee roleplay, wait ~60s for stale sessions to GC, or upgrade your plan's concurrent-session cap.`
          : raw;
        setError(msg);
        setState("failed");
      }
    })();

    return () => {
      cancelled = true;
      void stop();
    };
  }, [enabled, moduleId, stop, restartKey]);

  const speak = useCallback(async (text: string) => {
    const c = clientRef.current;
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!c || !connectedRef.current) {
      // Either we never connected yet, or D-ID idled out the stream
      // since the last reply. Buffer the text and — if we lost a
      // previously-good session — kick a fresh mint so we don't just
      // sit in the pendingSpeechRef forever.
      pendingSpeechRef.current.push(trimmed);
      if (!c && wasConnectedRef.current) {
        console.log("[streaming-avatar] speak() with no client — auto-reconnecting…");
        setRestartKey((k) => k + 1);
      }
      return;
    }
    try {
      await c.speak(trimmed);
    } catch (e) {
      console.warn("[streaming-avatar] speak failed:", e);
    }
  }, []);

  return { state, attach, speak, error };
}
