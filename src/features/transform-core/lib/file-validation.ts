import { isAllowedMime, MEDIA_LIMITS, type MediaKind } from '@/schemas';
import { formatBytes } from './format';

type FileValidation =
  | { ok: true }
  | { ok: false; code: 'INVALID_FILE_TYPE' | 'FILE_TOO_LARGE'; message: string };

/**
 * Client-side check against the shared media limits, run before any network
 * call. The server repeats it against Uploadcare's own detection, so this is
 * a courtesy (fast feedback), never the only line of defence.
 */
export function validateFile(file: Pick<File, 'type' | 'size'>, kind: MediaKind): FileValidation {
  if (!file.type || !isAllowedMime(kind, file.type)) {
    return {
      ok: false,
      code: 'INVALID_FILE_TYPE',
      message: `Choose a ${describeAllowedTypes(kind)} file.`,
    };
  }
  const { maxBytes } = MEDIA_LIMITS[kind];
  if (file.size > maxBytes) {
    return {
      ok: false,
      code: 'FILE_TOO_LARGE',
      message: `This file is ${formatBytes(file.size)}; the limit is ${formatBytes(maxBytes)}.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, code: 'INVALID_FILE_TYPE', message: 'This file is empty.' };
  }
  return { ok: true };
}

const MIME_LABELS: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'video/mp4': 'MP4',
  'video/quicktime': 'MOV',
};

/** "JPEG, PNG or WebP" — from the shared limits, so the hint cannot drift from the check. */
export function describeAllowedTypes(kind: MediaKind): string {
  const labels = MEDIA_LIMITS[kind].mimeTypes.map((mime) => MIME_LABELS[mime] ?? mime);
  return labels.length > 1 ? `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)}` : (labels[0] ?? '');
}

/** The `accept` attribute for a file input. */
export function acceptAttribute(kind: MediaKind): string {
  return MEDIA_LIMITS[kind].mimeTypes.join(',');
}
