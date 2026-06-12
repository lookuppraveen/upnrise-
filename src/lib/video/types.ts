// Shared types for the avatar-video provider layer.
//
// A driver implements `createVideo(script, opts)` against the provider's
// API and returns a job id we can poll or watch via webhook. When the
// job completes, the URL lands in TrainingModule.body.videoUrl and the
// job descriptor is cleared.

export type RenderJobStatus =
  | "queued"
  | "rendering"
  | "ready"
  | "failed";

export type RenderJob = {
  provider: "heygen" | "synthesia" | "did" | "elevenlabs";
  providerId: string; // row id in video_providers
  jobId: string;
  status: RenderJobStatus;
  startedAt: string; // ISO
  error?: string;
};

export type CreateVideoOpts = {
  apiKey: string;
  avatarId: string | null;
  voiceId: string | null;
  script: string;
  title: string;
  // Server-absolute webhook URL. Optional; providers that don't support
  // webhooks will be polled at render-status check time instead.
  callbackUrl?: string;
};

export interface VideoDriver {
  readonly kind: "heygen" | "synthesia" | "did" | "elevenlabs";
  /** Kick off a render. Throws on transport/auth errors. */
  createVideo(opts: CreateVideoOpts): Promise<{ jobId: string }>;
  /**
   * Best-effort status fetch. Returns the latest known status and, if
   * ready, the video URL. Callers should also rely on webhooks when
   * available — polling is the fallback.
   */
  fetchStatus(
    jobId: string,
    apiKey: string,
  ): Promise<{ status: RenderJobStatus; videoUrl?: string; error?: string }>;
}
