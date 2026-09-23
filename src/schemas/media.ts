import * as z from 'zod';

const MEDIA_KINDS = ['image', 'video'] as const;
export const mediaKind = z.enum(MEDIA_KINDS);
export type MediaKind = z.infer<typeof mediaKind>;

const MB = 1024 * 1024;

type MediaLimits = {
  /** MIME types accepted for upload, checked by the UI and again by the server against Uploadcare's detection. */
  readonly mimeTypes: readonly string[];
  readonly maxBytes: number;
};

type VideoLimits = MediaLimits & {
  /** Longest clip (end − start) a transformation may request. Magic Hour bills video per rendered frame. */
  readonly maxClipSeconds: number;
};

/**
 * Upload and transformation limits — the one place these numbers live.
 *
 * Sizes sit under Cloudinary's free-plan per-file limits (10 MB image, 100 MB
 * video) since every source is copied there, and far under Magic Hour's
 * (200 MB on its free tier).
 */
export const MEDIA_LIMITS = {
  image: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 10 * MB,
  },
  video: {
    mimeTypes: ['video/mp4', 'video/quicktime'],
    maxBytes: 50 * MB,
    maxClipSeconds: 5,
  },
} as const satisfies { image: MediaLimits; video: VideoLimits };

export function isAllowedMime(kind: MediaKind, mime: string): boolean {
  const allowed: readonly string[] = MEDIA_LIMITS[kind].mimeTypes;
  return allowed.includes(mime.toLowerCase());
}
