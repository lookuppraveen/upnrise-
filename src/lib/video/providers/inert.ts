// Placeholder drivers for providers we register in the UI but haven't
// wired yet (Synthesia, D-ID, ElevenLabs). They exist so admins can
// add a row and a key in /admin/video-providers without the action
// surface crashing — render attempts throw a clear "not wired" error
// that the UI surfaces.

import type { VideoDriver } from "@/lib/video/types";

export function inertDriver(
  kind: VideoDriver["kind"],
  reason: string,
): VideoDriver {
  return {
    kind,
    async createVideo() {
      throw new Error(`${kind} driver not yet implemented: ${reason}`);
    },
    async fetchStatus() {
      return { status: "failed", error: `${kind} not implemented` };
    },
  };
}
