import 'server-only';
import {
  isTerminalStatus,
  type TransformationView,
  type TransformSpec,
  type VideoTransformParams,
} from '@/schemas';
import type { TransformationDoc, UploadDoc } from '@/server/db/models';
import { AppError, isAppError } from '@/server/errors';
import type { NewTransformation } from '@/server/repositories';
import { providerFailureOf, type SubmittedProject } from '@/server/services';
import { toTransformationView } from '@/server/views';
import { WORKFLOW } from './config';
import type { AppDeps } from './deps';
import { storedError } from './failures';
import { reconcileTransformation } from './reconcile-transformation';

export type CreateTransformationInput = { userId: string; uploadId: string } & TransformSpec;

/**
 * Validates a request against its upload, records it as `queued`, then
 * submits it to Magic Hour exactly once.
 *
 * The document exists before the create call so that a failure at any later
 * point leaves a trace. The create call is never retried: the API has no
 * idempotency key, so a retry after a lost response could bill twice.
 */
export async function createTransformation(
  input: CreateTransformationInput,
  deps: AppDeps,
): Promise<TransformationView> {
  const { transformations, uploads, clock } = deps;

  const upload = await uploads.findByIdForUser(input.uploadId, input.userId);
  if (!upload) {
    throw new AppError('UPLOAD_NOT_FOUND');
  }
  if (upload.kind !== input.kind) {
    const message = `This upload is ${articled(upload.kind)}, not ${articled(input.kind)}.`;
    throw new AppError('VALIDATION_FAILED', { message, details: { kind: [message] } });
  }
  if (input.kind === 'video') {
    assertClipWithinSource(input.params, upload.durationSeconds);
  }

  await assertActiveJobCapacity(input.userId, deps);
  const transformation = await transformations.create(newTransformation(input, upload));

  // Re-count after inserting: two concurrent requests that both passed the
  // check above now both see each other, and both back out.
  if ((await transformations.countActiveByUser(input.userId)) > WORKFLOW.maxActiveJobs) {
    await transformations.delete(transformation._id);
    throw new AppError('TOO_MANY_ACTIVE_JOBS');
  }

  const submitted = await submit(transformation, deps);

  // The one unrecoverable window: Magic Hour has the job (and the credits),
  // but if this write fails no webhook can ever find the document. The log
  // line is the audit trail; reconciliation fails the document after
  // `WORKFLOW.submissionStuckMs`.
  let saved: TransformationDoc | null = null;
  let saveError: unknown = null;
  try {
    saved = await transformations.markSubmitted(transformation._id, {
      ...submitted,
      submittedAt: clock.now(),
    });
  } catch (error) {
    saveError = error;
  }
  if (!saved) {
    deps.logger.error('Magic Hour project submitted but its id could not be saved', {
      transformationId: transformation._id,
      projectId: submitted.projectId,
      creditsCharged: submitted.creditsCharged,
      error: saveError,
    });
    throw new AppError('INTERNAL', { cause: saveError });
  }
  return toTransformationView(saved);
}

async function submit(transformation: TransformationDoc, deps: AppDeps): Promise<SubmittedProject> {
  const { provider, transformations, clock, logger } = deps;
  const sourceUrl = transformation.source.secureUrl;
  const name = `transformation ${transformation._id.toHexString()}`;
  try {
    return transformation.kind === 'image'
      ? await provider.submitImage({ sourceUrl, params: transformation.params, name })
      : await provider.submitVideo({ sourceUrl, params: transformation.params, name });
  } catch (error) {
    const appError = isAppError(error) ? error : new AppError('INTERNAL', { cause: error });
    logger.warn('Magic Hour rejected a submission', {
      transformationId: transformation._id,
      error: appError,
    });
    await transformations
      .transition(transformation._id, ['queued'], 'failed', {
        error: storedError(appError.code, appError.message),
        provider: { rawError: providerFailureOf(appError) },
        completedAt: clock.now(),
      })
      .catch((transitionError: unknown) => {
        logger.error('Could not mark a rejected submission as failed', {
          transformationId: transformation._id,
          error: transitionError,
        });
      });
    throw appError;
  }
}

/**
 * Rejects when the user already has `WORKFLOW.maxActiveJobs` jobs in flight.
 * Before rejecting, the active jobs are reconciled, so one that finished or
 * died without a webhook — and without the user polling it — does not hold
 * a slot forever.
 */
async function assertActiveJobCapacity(userId: string, deps: AppDeps): Promise<void> {
  const { transformations, clock } = deps;
  if ((await transformations.countActiveByUser(userId)) < WORKFLOW.maxActiveJobs) {
    return;
  }
  const active = await transformations.listActiveByUser(userId);
  const now = clock.now();
  const settled = await Promise.all(active.map((job) => reconcileTransformation(job, now, deps)));
  const stillActive = settled.filter((job) => !isTerminalStatus(job.status));
  if (stillActive.length >= WORKFLOW.maxActiveJobs) {
    throw new AppError('TOO_MANY_ACTIVE_JOBS');
  }
}

function assertClipWithinSource(params: VideoTransformParams, durationSeconds: number | null): void {
  // Unknown duration: let Magic Hour validate rather than block the request.
  if (durationSeconds !== null && params.end_seconds > durationSeconds) {
    const message = `The end time must not exceed the video length (${formatSeconds(durationSeconds)} s).`;
    throw new AppError('VALIDATION_FAILED', { message, details: { 'params.end_seconds': [message] } });
  }
}

function newTransformation(input: CreateTransformationInput, upload: UploadDoc): NewTransformation {
  const base = {
    userId: input.userId,
    uploadId: upload._id,
    source: {
      secureUrl: upload.cloudinary.secureUrl,
      mime: upload.mime,
      width: upload.width,
      height: upload.height,
      durationSeconds: upload.durationSeconds,
      frameRate: upload.frameRate,
    },
  };
  return input.kind === 'image'
    ? { ...base, kind: 'image', params: input.params }
    : { ...base, kind: 'video', params: input.params };
}

function articled(kind: UploadDoc['kind']): string {
  return kind === 'image' ? 'an image' : 'a video';
}

function formatSeconds(seconds: number): string {
  return String(Math.round(seconds * 100) / 100);
}
