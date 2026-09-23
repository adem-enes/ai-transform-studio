import type { VideoTransformParams } from '@/schemas';

/**
 * Video-to-Video pricing, from Magic Hour's "Models and Credit Costs" page
 * (docs.magichour.ai/api-reference/models → Duration-based endpoints):
 * "48 credits/second at 24fps" — i.e. 2 credits per rendered frame. The
 * Video-to-Video reference adds that "credits are only charged for the frames
 * that actually render", and that the create call's `credits_charged` is an
 * estimate corrected once the true output frame rate is known.
 *
 * So the estimate is 2 × clip seconds × output fps, where the output fps is
 * the source's (`FULL`) or half of it (`HALF`, per `fps_resolution`).
 */
export const VIDEO_CREDITS_PER_FRAME = 48 / 24;

/** The documented reference rate, for when the source frame rate is unknown. */
export const VIDEO_CREDITS_PER_SECOND_AT_24_FPS = 48;

export type VideoCostEstimate =
  | { kind: 'estimate'; credits: number; outputFps: number }
  /** Source frame rate unknown: only the documented rate can be shown. */
  | { kind: 'rate' };

export function estimateVideoCost({
  clipSeconds,
  fpsResolution,
  sourceFps,
}: {
  clipSeconds: number;
  fpsResolution: VideoTransformParams['fps_resolution'];
  sourceFps: number | null;
}): VideoCostEstimate {
  if (!sourceFps || sourceFps <= 0 || clipSeconds <= 0) {
    return { kind: 'rate' };
  }
  const outputFps = fpsResolution === 'FULL' ? sourceFps : sourceFps / 2;
  const frames = Math.ceil(clipSeconds * outputFps);
  return { kind: 'estimate', credits: frames * VIDEO_CREDITS_PER_FRAME, outputFps };
}

/** "~240 credits" or the documented rate, for the form and the "Transform again" hint. */
export function describeVideoCost(estimate: VideoCostEstimate): string {
  return estimate.kind === 'estimate'
    ? `~${estimate.credits.toLocaleString('en')} credits`
    : `${VIDEO_CREDITS_PER_SECOND_AT_24_FPS} credits per second at 24 fps`;
}
