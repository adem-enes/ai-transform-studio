import 'server-only';
import { isTerminalStatus, type MediaKind, type TransformationStatus } from '@/schemas';
import type { TransformationDoc } from '@/server/db/models';
import { AppError } from '@/server/errors';
import { isHandledEventType, type WebhookEvent } from '@/server/webhooks/event';
import type { AppDeps } from './deps';
import { storedError } from './failures';
import { completeFinalization, startFinalizing } from './finalize-transformation';

export type WebhookOutcome = {
  /** `applied` — the event changed state; `noop` — duplicate, late or out of order; `ignored` — not ours to handle. */
  result: 'applied' | 'noop' | 'ignored';
  status?: TransformationStatus;
};

type Action = 'started' | 'completed' | 'errored';

/**
 * Runs work after the response is sent (`after()` from next/server in the
 * route, a queue in tests). The task must not throw; failures are its own to log.
 */
export type Defer = (task: () => Promise<void>) => void;

type WebhookDeps = Pick<AppDeps, 'transformations' | 'storage' | 'provider' | 'clock' | 'logger'> & {
  defer: Defer;
};

/**
 * Applies one verified Magic Hour webhook event.
 *
 * Every event is safe to receive more than once and in any order: each
 * status change is a conditional transition, so a duplicate, late or
 * out-of-order event resolves to `noop`. The only errors thrown on purpose
 * is a retryable one (unknown project), which the route answers with 503 so
 * Magic Hour redelivers.
 *
 * Magic Hour wants an answer within 10 s, and copying a video result can
 * take minutes, so a `*.completed` event only moves the job to `finalizing`
 * here; the copy runs deferred, after the response. If it fails the job stays
 * `finalizing` and reconciliation finishes it on the next status poll.
 */
export async function handleWebhookEvent(event: WebhookEvent, deps: WebhookDeps): Promise<WebhookOutcome> {
  const { transformations, clock, logger } = deps;
  if (!isHandledEventType(event.type)) {
    return { result: 'ignored' };
  }
  const [kind, action] = event.type.split('.') as [MediaKind, Action];
  const projectId = event.payload.id;

  const transformation = await transformations.findByProjectId(projectId);
  if (!transformation) {
    // Usually the create call's response has not been saved yet — see createTransformation.
    throw new AppError('NOT_FOUND', {
      retryable: true,
      message: 'No transformation has this project id yet.',
      cause: { projectId, type: event.type },
    });
  }
  if (transformation.kind !== kind) {
    logger.warn('Webhook kind does not match the transformation; ignoring', {
      type: event.type,
      projectId,
      transformationId: transformation._id,
    });
    return { result: 'ignored', status: transformation.status };
  }

  switch (action) {
    case 'started': {
      const moved = await transformations.transition(transformation._id, ['queued'], 'processing');
      return moved
        ? { result: 'applied', status: moved.status }
        : { result: 'noop', status: transformation.status };
    }

    case 'completed': {
      // `timed_out` is our guess, not the provider's: a late completion recovers the job.
      if (isTerminalStatus(transformation.status) && transformation.status !== 'timed_out') {
        return { result: 'noop', status: transformation.status };
      }
      const finalizing = await startFinalizing(transformation, deps);
      if (!finalizing) {
        // Already finalizing (a duplicate delivery, or a copy in progress) or settled meanwhile.
        const latest = await transformations.findById(transformation._id);
        return { result: 'noop', status: latest?.status ?? transformation.status };
      }
      deps.defer(() => finishInBackground(finalizing, event, deps));
      return { result: 'applied', status: finalizing.status };
    }

    case 'errored': {
      const failed = await transformations.transition(
        transformation._id,
        ['queued', 'processing', 'timed_out'],
        'failed',
        {
          error: storedError('TRANSFORMATION_FAILED'),
          provider: {
            rawError: event.payload.error,
            // Magic Hour refunds a failed render; the event carries the corrected figure.
            ...(event.payload.credits_charged === undefined
              ? {}
              : { creditsCharged: event.payload.credits_charged }),
          },
          completedAt: clock.now(),
        },
      );
      return failed
        ? { result: 'applied', status: failed.status }
        : { result: 'noop', status: transformation.status };
    }
  }
}

/** The deferred half of a `*.completed` event: copy the result, mark it completed. Never throws. */
async function finishInBackground(
  finalizing: TransformationDoc,
  event: WebhookEvent,
  deps: WebhookDeps,
): Promise<void> {
  const { logger } = deps;
  const projectId = event.payload.id;
  try {
    const downloadUrl =
      event.payload.downloads[0]?.url ?? (await downloadUrlFromProvider(finalizing.kind, projectId, deps));
    const done = await completeFinalization(
      finalizing,
      { downloadUrl, creditsCharged: event.payload.credits_charged },
      deps,
    );
    logger.info('Webhook result finalized', { transformationId: done._id, projectId, status: done.status });
  } catch (error) {
    logger.error('Background finalization failed; reconciliation will retry on the next status poll', {
      transformationId: finalizing._id,
      projectId,
      error,
    });
  }
}

/** A `*.completed` payload without downloads: ask the API. */
async function downloadUrlFromProvider(
  kind: MediaKind,
  projectId: string,
  { provider }: Pick<AppDeps, 'provider'>,
): Promise<string> {
  const url = (await provider.getProjectStatus(kind, projectId)).downloads[0]?.url;
  if (!url) {
    throw new AppError('PROVIDER_UNAVAILABLE', {
      message: 'The result is not available for download yet.',
      cause: { projectId },
    });
  }
  return url;
}
