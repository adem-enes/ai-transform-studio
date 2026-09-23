/**
 * Cloudinary delivery URLs, built from the `secure_url`s the API returns
 * (`https://res.cloudinary.com/<cloud>/<image|video>/upload/v123/<public id>.<ext>`).
 *
 * Transformations are inserted right after `/upload/`, so resizing and
 * format negotiation happen on Cloudinary's CDN, not on Vercel's image
 * optimizer.
 */

const CLOUDINARY_HOST = 'res.cloudinary.com';

const UPLOAD_SEGMENT = /\/(image|video)\/upload\//;

function isCloudinaryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === CLOUDINARY_HOST &&
      UPLOAD_SEGMENT.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

/** Inserts one transformation step (e.g. `f_auto,q_auto`) after `/upload/`. Non-Cloudinary URLs pass through unchanged. */
function withTransformation(url: string, transformation: string): string {
  if (!isCloudinaryUrl(url)) {
    return url;
  }
  return url.replace(UPLOAD_SEGMENT, (segment) => `${segment}${transformation}/`);
}

/** A resized, format-negotiated rendition: `f_auto,q_auto`, never wider than `width` and never upscaled. */
export function imageUrl(url: string, { width, quality }: { width: number; quality?: number }): string {
  return withTransformation(url, `f_auto,c_limit,w_${Math.round(width)},q_${quality ?? 'auto'}`);
}

/**
 * A still frame of a Cloudinary video (the first, or the one at `offsetSeconds`)
 * as a JPEG URL the image loader can resize further. Non-Cloudinary URLs pass
 * through unchanged.
 */
export function videoPosterUrl(url: string, offsetSeconds = 0): string {
  if (!isCloudinaryUrl(url)) {
    return url;
  }
  return withTransformation(url, `so_${seconds(offsetSeconds)}`).replace(/\.[a-z0-9]+$/i, '.jpg');
}

/** The part of a Cloudinary video between `start` and `end` seconds, trimmed on the CDN. */
export function videoClipUrl(url: string, start: number, end: number): string {
  return withTransformation(url, `so_${seconds(start)},eo_${seconds(end)}`);
}

/** Cloudinary offsets take up to two decimals. */
function seconds(value: number): string {
  return String(Math.round(Math.max(0, value) * 100) / 100);
}

/**
 * The original file, served with `Content-Disposition: attachment` so the
 * browser downloads it instead of navigating. `name` (no extension) becomes
 * the suggested file name; Cloudinary allows only a restricted character set.
 */
export function attachmentUrl(url: string, name?: string): string {
  const safeName = name?.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
  return withTransformation(url, safeName ? `fl_attachment:${safeName}` : 'fl_attachment');
}
