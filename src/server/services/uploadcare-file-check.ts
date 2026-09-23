import 'server-only';
import type { FileInfo } from '@uploadcare/rest-client';
import { isAllowedMime, MEDIA_LIMITS, type MediaKind } from '@/schemas';
import { AppError } from '@/server/errors';

export type VerifiedFile = {
  uuid: string;
  kind: MediaKind;
  /** Public CDN URL of the original file — what Cloudinary fetches from. */
  cdnUrl: string;
  originalFilename: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
};

/**
 * Pure check of an Uploadcare file-info object against the limits for `kind`.
 * Throws the matching `AppError`; separated from the network call so it can be
 * tested against fixtures.
 *
 * The MIME type is Uploadcare's content-sniffed `contentInfo.mime` when
 * present, not the browser-supplied one, so a renamed file cannot slip through.
 */
export function verifyFileInfo(info: FileInfo, kind: MediaKind): VerifiedFile {
  if (info.datetimeRemoved !== null) {
    throw new AppError('UPLOAD_NOT_FOUND');
  }
  if (!info.isReady || info.datetimeStored === null || info.originalFileUrl === null) {
    throw new AppError('FILE_NOT_READY');
  }

  const mime = (info.contentInfo?.mime?.mime ?? info.mimeType).toLowerCase();
  if (!isAllowedMime(kind, mime)) {
    throw new AppError('INVALID_FILE_TYPE', {
      message: `Unsupported file type (${mime}). Allowed: ${MEDIA_LIMITS[kind].mimeTypes.join(', ')}.`,
    });
  }

  const { maxBytes } = MEDIA_LIMITS[kind];
  if (info.size > maxBytes) {
    throw new AppError('FILE_TOO_LARGE', {
      message: `The file is larger than the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`,
    });
  }

  const image = info.contentInfo?.image;
  const video = info.contentInfo?.video;
  const dimensions = kind === 'image' ? image : video?.video;

  return {
    uuid: info.uuid,
    kind,
    cdnUrl: info.originalFileUrl,
    originalFilename: info.originalFilename,
    mime,
    bytes: info.size,
    width: positiveIntOrNull(dimensions?.width),
    height: positiveIntOrNull(dimensions?.height),
    // Uploadcare reports video duration in milliseconds.
    durationSeconds: kind === 'video' && video ? video.duration / 1000 : null,
  };
}

function positiveIntOrNull(value: number | undefined): number | null {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : null;
}
