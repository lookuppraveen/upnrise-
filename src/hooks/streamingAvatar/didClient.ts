// D-ID Talks Streams client — raw RTCPeerConnection. The D-ID API key
// is server-only, so every D-ID call goes through our relay routes
// under /api/roleplay/streaming/did/*.
//
// Handshake:
//   1. Server already created the stream and handed us { offer, iceServers,
//      streamId, sessionId } in the session payload.
//   2. We build pc = new RTCPeerConnection({ iceServers }).
//   3. pc.setRemoteDescription(offer) → pc.createAnswer() → pc.setLocalDescription(answer)
//   4. POST answer to /did/sdp.
//   5. pc.onicecandidate → POST each candidate to /did/ice.
//   6. pc.ontrack → MediaStream → buffer until attach() lands.
//   7. speak(text) → POST to /did/speak.
//   8. stop() → POST to /did/close + pc.close().
//
// State signals we emit:
//   "connecting"     — issued before the offer/answer dance starts.
//   "stream-ready"   — pc.ontrack fired and we have remote media.
//   "connected"      — iceConnectionState went to "connected" or "completed".
//   "speak-started"  — first inbound RTP packets after a /speak.
//   "speak-ended"    — gap of >700ms after speak-started.
//   "disconnected"   — pc.iceConnectionState went terminal.
//
// D-ID doesn't surface speak-started/ended events directly, so we infer
// them from inbound RTP byte deltas on the audio track. That keeps the
// player UI honest without needing a per-provider event source.

import type { AvatarClient, AvatarClientEventHandler } from "./types";

export type DidStartPayload = {
  streamId: string;
  sessionId: string;
  offer: RTCSessionDescriptionInit;
  iceServers: RTCIceServer[];
  voiceId: string | null;
};

const SPEAK_GAP_MS = 700;

async function postJson(path: string, body: unknown): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `${path} → ${res.status}`);
  }
}

export function createDidAvatarClient(payload: DidStartPayload): AvatarClient {
  let pc: RTCPeerConnection | null = null;
  let remoteStream: MediaStream | null = null;
  let pendingEl: HTMLMediaElement | null = null;
  let handler: AvatarClientEventHandler | null = null;
  let speakProbeTimer: ReturnType<typeof setInterval> | null = null;
  let speaking = false;
  let lastAudioBytes = 0;
  let lastAudioBytesAt = 0;

  function emit(state: Parameters<AvatarClientEventHandler>[0]) {
    if (handler) handler(state);
  }

  function attachToEl(el: HTMLMediaElement) {
    if (!remoteStream) return;
    if (el.srcObject === remoteStream) return;
    el.srcObject = remoteStream;
    // The element may have been rendered with autoPlay; force play() so
    // we catch the case where the trainee tab isn't focused.
    void el.play().catch(() => {
      // Autoplay can be blocked until the user interacts; the player UI
      // already prompts a tap, so we ignore here.
    });
  }

  // Poll inbound audio byte count every 250ms so we can infer when
  // the avatar starts/stops speaking. D-ID Talks Streams doesn't push
  // a discrete event for that today.
  function startSpeakProbe() {
    if (speakProbeTimer || !pc) return;
    speakProbeTimer = setInterval(() => {
      const c = pc;
      if (!c) return;
      c.getStats().then((stats) => {
        let bytes = 0;
        stats.forEach((report) => {
          if (
            report.type === "inbound-rtp" &&
            (report as RTCInboundRtpStreamStats).kind === "audio"
          ) {
            const b = (report as { bytesReceived?: number }).bytesReceived;
            if (typeof b === "number") bytes = Math.max(bytes, b);
          }
        });
        const now = Date.now();
        const delta = bytes - lastAudioBytes;
        if (delta > 0) {
          lastAudioBytesAt = now;
          if (!speaking) {
            speaking = true;
            emit("speak-started");
          }
        } else if (
          speaking &&
          lastAudioBytesAt > 0 &&
          now - lastAudioBytesAt > SPEAK_GAP_MS
        ) {
          speaking = false;
          emit("speak-ended");
        }
        lastAudioBytes = bytes;
      });
    }, 250);
  }

  function stopSpeakProbe() {
    if (speakProbeTimer) {
      clearInterval(speakProbeTimer);
      speakProbeTimer = null;
    }
  }

  async function start(): Promise<void> {
    emit("connecting");
    pc = new RTCPeerConnection({ iceServers: payload.iceServers });
    pc.addTransceiver("audio", { direction: "recvonly" });
    pc.addTransceiver("video", { direction: "recvonly" });

    pc.ontrack = (e) => {
      // D-ID sends audio and video as separate tracks on the same stream
      // — collect both into one MediaStream so a single <video> element
      // can play the whole thing.
      if (!remoteStream) remoteStream = new MediaStream();
      remoteStream.addTrack(e.track);
      if (pendingEl) attachToEl(pendingEl);
      emit("stream-ready");
    };

    pc.onicecandidate = (e) => {
      const c = e.candidate;
      if (!c) return;
      // Fire-and-forget — failed ICE submission isn't fatal as long
      // as enough candidates land for connection to complete.
      void postJson("/api/roleplay/streaming/did/ice", {
        streamId: payload.streamId,
        sessionId: payload.sessionId,
        candidate: c.toJSON(),
      }).catch((err) => {
        console.warn("[did-client] ice POST failed:", err);
      });
    };

    pc.oniceconnectionstatechange = () => {
      const s = pc?.iceConnectionState;
      if (s === "connected" || s === "completed") {
        emit("connected");
        startSpeakProbe();
      } else if (s === "failed" || s === "closed" || s === "disconnected") {
        stopSpeakProbe();
        emit("disconnected");
      }
    };

    await pc.setRemoteDescription(payload.offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await postJson("/api/roleplay/streaming/did/sdp", {
      streamId: payload.streamId,
      sessionId: payload.sessionId,
      answer: { type: "answer", sdp: answer.sdp ?? "" },
    });
  }

  async function stop(): Promise<void> {
    stopSpeakProbe();
    const c = pc;
    pc = null;
    remoteStream = null;
    speaking = false;
    lastAudioBytes = 0;
    lastAudioBytesAt = 0;
    if (c) {
      try {
        c.close();
      } catch {
        // ignore — already closed
      }
    }
    // Best-effort close on the D-ID side. We don't await — caller is
    // already unmounting and shouldn't wait for the round trip.
    void postJson("/api/roleplay/streaming/did/close", {
      streamId: payload.streamId,
      sessionId: payload.sessionId,
    }).catch(() => {});
  }

  function attach(el: HTMLMediaElement) {
    pendingEl = el;
    if (remoteStream) attachToEl(el);
  }

  async function speak(text: string): Promise<void> {
    try {
      await postJson("/api/roleplay/streaming/did/speak", {
        streamId: payload.streamId,
        sessionId: payload.sessionId,
        text,
        ...(payload.voiceId ? { voiceId: payload.voiceId } : {}),
      });
    } catch (e) {
      console.warn("[did-client] speak failed:", e);
    }
  }

  function on(h: AvatarClientEventHandler) {
    handler = h;
  }

  return { start, stop, attach, speak, on };
}
