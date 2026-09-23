import 'server-only';
import type { TransformationDoc, TransformationOutput } from '@/server/db/models';
import { AppError } from '@/server/errors';
import type { StoredAsset } from '@/server/services';
import type { AppDeps } from './deps';

type FinalizeDeps = Pick<AppDeps, 'transformations' | 'storage' | 'clock'>;

/** Where Magic Hour left the result, and what it finally charged (when it says). */
type ProviderResult = {
  downloadUrl: string;
  creditsCharged?: number | undefined;
};

/**
 * Finalization is two steps, so the webhook can acknowledge after the first:
 *
 * 1. `startFinalizing` — a quick conditional transition to `finalizing`.
 * 2. `completeFinalization` — copies the result into Cloudinary and marks the
 *    transformation `completed`.
 *
 * Both are safe to run any number of times, concurrently included:
 *
 * - the output is stored under the transformation's id with overwrite, so a
 *   repeated copy replaces rather than duplicates;
 * - every status change is a conditional transition, so only one caller wins
 *   and the rest observe the result.
 *
 * If the copy fails the document stays `finalizing`; reconciliation (the
 * next status poll) runs `finalizeTransformation` again.
 */

/**
 * Moves an active or `timed_out` transformation to `finalizing`. Returns the
 * updated document, or `null` when this call did not make the move — it was
 * already finalizing, or had settled.
 */
export async function startFinalizing(
  transformation: TransformationDoc,
  { transformations }: Pick<AppDeps, 'transformations'>,
): Promise<TransformationDoc | null> {
  // A recovered `timed_out` job drops its timeout error and completion time.
  return transformations.transition(transformation._id, ['queued', 'processing', 'timed_out'], 'finalizing', {
    error: null,
    completedAt: null,
  });
}

/**
 * Copies the result of a `finalizing` transformation and marks it
 * `completed`. A failed copy throws a retryable `STORAGE_FAILED` and leaves
 * the document `finalizing`. Returns the latest document.
 */
export async function completeFinalization(
  finalizing: TransformationDoc,
  { downloadUrl, creditsCharged }: ProviderResult,
  { transformations, storage, clock }: FinalizeDeps,
): Promise<TransformationDoc> {
  let stored: StoredAsset;
  try {
    stored = await storage.uploadFromUrl(downloadUrl, {
      kind: finalizing.kind,
      folder: 'outputs',
      publicId: finalizing._id.toHexString(),
    });
  } catch (error) {
    throw new AppError('STORAGE_FAILED', { retryable: true, cause: error });
  }

  const completed = await transformations.transition(finalizing._id, ['finalizing'], 'completed', {
    output: toStoredOutput(stored),
    error: null,
    completedAt: clock.now(),
    // Video is charged an estimate up front; the finished project carries the real figure.
    ...(creditsCharged === undefined ? {} : { provider: { creditsCharged } }),
  });
  return completed ?? (await transformations.findById(finalizing._id)) ?? finalizing;
}

/**
 * Both steps in one call, for reconciliation. Returns the latest document;
 * one already `completed` or `failed` is returned untouched.
 */
export async function finalizeTransformation(
  transformation: TransformationDoc,
  result: ProviderResult,
  deps: FinalizeDeps,
): Promise<TransformationDoc> {
  let current = transformation;
  if (current.status !== 'finalizing') {
    const latest =
      (await startFinalizing(current, deps)) ?? (await deps.transformations.findById(current._id));
    if (latest?.status !== 'finalizing') {
      return latest ?? current;
    }
    current = latest;
  }
  return completeFinalization(current, result, deps);
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
