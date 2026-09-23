import 'server-only';

/**
 * Files younger than this are left alone by the Uploadcare sweep: they may be
 * uploads still on their way to Cloudinary.
 */
export const UPLOADCARE_MIN_AGE_MS = 60 * 60 * 1000;

/** The Uploadcare REST API deletes at most this many files per batch call. */
export const UPLOADCARE_DELETE_BATCH = 100;

type ListedFile = { uuid: string; datetimeUploaded: string; datetimeRemoved: string | null };

/** Files uploaded before `nowMs - minAgeMs` and not already removed, oldest first. */
export function selectStaleFiles<T extends ListedFile>(
  files: readonly T[],
  nowMs: number,
  minAgeMs: number = UPLOADCARE_MIN_AGE_MS,
): T[] {
  const cutoff = nowMs - minAgeMs;
  return files
    .filter((file) => file.datetimeRemoved === null && Date.parse(file.datetimeUploaded) < cutoff)
    .sort((a, b) => Date.parse(a.datetimeUploaded) - Date.parse(b.datetimeUploaded));
}

/** Splits `items` into chunks of at most `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
