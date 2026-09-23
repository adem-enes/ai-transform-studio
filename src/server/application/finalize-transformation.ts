import 'server-only';
import type { TransformationDoc, TransformationOutput } from '@/server/db/models';
import { AppError } from '@/server/errors';
import type { StoredAsset } from '@/server/services';
import type { AppDeps } from './deps';

/**
 * Copies a finished result into Cloudinary and marks the transformation
 * `completed`. Shared by the webhook and reconciliation, and safe to run any
 * number of times, concurrently included:
 *
 * - the output is stored under the transformation's id with overwrite, so a
 *   repeated copy replaces rather than duplicates;
 * - every status change is a conditional transition, so only one caller wins
 *   and the rest observe the result.
 *
 * If the copy fails the document stays `finalizing` and a retryable error is
 * thrown; the next webhook delivery or status poll tries again.
 *
 * Returns the latest document. One already `completed` or `failed` is returned untouched.
 */
export async function finalizeTransformation(
  transformation: TransformationDoc,
  downloadUrl: string,
  { transformations, storage, clock }: Pick<AppDeps, 'transformations' | 'storage' | 'clock'>,
): Promise<TransformationDoc> {
  let current = transformation;
  if (current.status !== 'finalizing') {
    // A recovered `timed_out` job drops its timeout error and completion time.
    const moved = await transformations.transition(
      current._id,
      ['queued', 'processing', 'timed_out'],
      'finalizing',
      { error: null, completedAt: null },
    );
    const latest = moved ?? (await transformations.findById(current._id));
    if (latest?.status !== 'finalizing') {
      return latest ?? current;
    }
    current = latest;
  }

  let stored: StoredAsset;
  try {
    stored = await storage.uploadFromUrl(downloadUrl, {
      kind: current.kind,
      folder: 'outputs',
      publicId: current._id.toHexString(),
    });
  } catch (error) {
    throw new AppError('STORAGE_FAILED', { retryable: true, cause: error });
  }

  const completed = await transformations.transition(current._id, ['finalizing'], 'completed', {
    output: toStoredOutput(stored),
    error: null,
    completedAt: clock.now(),
  });
  return completed ?? (await transformations.findById(current._id)) ?? current;
}

/** What is kept of the copied result: where it is, and its real shape so the UI can frame it without guessing. */
export function toStoredOutput(stored: StoredAsset): TransformationOutput {
  return {
    publicId: stored.publicId,
    secureUrl: stored.secureUrl,
    width: stored.width,
    height: stored.height,
    durationSeconds: stored.durationSeconds,
  };
}
