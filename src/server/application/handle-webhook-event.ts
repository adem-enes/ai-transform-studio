import 'server-only';
import { isTerminalStatus, type MediaKind, type TransformationStatus } from '@/schemas';
import { AppError } from '@/server/errors';
import { isHandledEventType, type WebhookEvent } from '@/server/webhooks/event';
import type { AppDeps } from './deps';
import { storedError } from './failures';
import { finalizeTransformation } from './finalize-transformation';

export type WebhookOutcome = {
  /** `applied` — the event changed state; `noop` — duplicate, late or out of order; `ignored` — not ours to handle. */
  result: 'applied' | 'noop' | 'ignored';
  status?: TransformationStatus;
};

type Action = 'started' | 'completed' | 'errored';

/**
 * Applies one verified Magic Hour webhook event.
 *
 * Every event is safe to receive more than once and in any order: each
 * status change is a conditional transition, so a duplicate, late or
 * out-of-order event resolves to `noop`. The only errors thrown on purpose
 * are retryable ones (unknown project, result not yet copyable), which the
 * route answers with 503 so Magic Hour redelivers.
 */
export async function handleWebhookEvent(
  event: WebhookEvent,
  deps: Pick<AppDeps, 'transformations' | 'storage' | 'provider' | 'clock' | 'logger'>,
): Promise<WebhookOutcome> {
  const { transformations, provider, clock, logger } = deps;
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
      const downloadUrl =
        event.payload.downloads[0]?.url ?? (await downloadUrlFromProvider(kind, projectId, provider));
      const finalized = await finalizeTransformation(transformation, downloadUrl, deps);
      return {
        result: finalized.status === 'completed' ? 'applied' : 'noop',
        status: finalized.status,
      };
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

/** A `*.completed` payload without downloads: ask the API. Any failure here is worth a redelivery. */
async function downloadUrlFromProvider(
  kind: MediaKind,
  projectId: string,
  provider: AppDeps['provider'],
): Promise<string> {
  let url: string | undefined;
  try {
    url = (await provider.getProjectStatus(kind, projectId)).downloads[0]?.url;
  } catch (error) {
    throw new AppError('PROVIDER_UNAVAILABLE', { retryable: true, cause: error });
  }
  if (!url) {
    throw new AppError('PROVIDER_UNAVAILABLE', {
      retryable: true,
      message: 'The result is not available for download yet.',
      cause: { projectId },
    });
  }
  return url;
}
