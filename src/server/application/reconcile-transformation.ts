import 'server-only';
import { isTerminalStatus, type TransformationStatus } from '@/schemas';
import type { TransformationDoc } from '@/server/db/models';
import type { TransitionPatch } from '@/server/repositories';
import type { ProjectStatus } from '@/server/services';
import { WORKFLOW } from './config';
import type { AppDeps } from './deps';
import { storedError } from './failures';
import { finalizeTransformation } from './finalize-transformation';

type ReconcileDeps = Pick<AppDeps, 'transformations' | 'storage' | 'provider' | 'clock' | 'logger'>;

/**
 * The webhook-independent safety net, run when a client polls an active
 * transformation. It catches what webhooks cannot: a lost or never-sent
 * event (cancellation has none), a failed result copy, a job that never
 * finishes, and a submission whose project id was never saved.
 *
 * It also runs for a `timed_out` job within `WORKFLOW.timedOutRecoveryMs` of
 * submission: the timeout is our guess, so a job the provider has since
 * completed is finalized, and one it errored or cancelled becomes `failed`.
 *
 * - At most one provider check per transformation per
 *   `WORKFLOW.reconcileIntervalMs`, claimed atomically so concurrent polls
 *   don't all call Magic Hour.
 * - Past `WORKFLOW.timeoutMs[kind]` since submission, a still-running job
 *   becomes `timed_out` — also when the provider check itself failed.
 * - Never throws: failures are logged and the latest known state returned,
 *   so a status request always succeeds.
 */
export async function reconcileTransformation(
  transformation: TransformationDoc,
  now: Date,
  deps: ReconcileDeps,
): Promise<TransformationDoc> {
  if (!isReconcilable(transformation, now)) {
    return transformation;
  }
  try {
    return await reconcile(transformation, now, deps);
  } catch (error) {
    deps.logger.error('Reconciliation failed', { transformationId: transformation._id, error });
    return (await deps.transformations.findById(transformation._id).catch(() => null)) ?? transformation;
  }
}

function isReconcilable(transformation: TransformationDoc, now: Date): boolean {
  if (!isTerminalStatus(transformation.status)) {
    return true;
  }
  if (transformation.status !== 'timed_out') {
    return false;
  }
  const startedAt = transformation.submittedAt ?? transformation.createdAt;
  return now.getTime() - startedAt.getTime() <= WORKFLOW.timedOutRecoveryMs;
}

async function reconcile(
  transformation: TransformationDoc,
  now: Date,
  deps: ReconcileDeps,
): Promise<TransformationDoc> {
  const { transformations, provider, logger } = deps;
  const projectId = transformation.provider.projectId;

  if (projectId === null) {
    const age = now.getTime() - transformation.createdAt.getTime();
    if (transformation.status !== 'queued' || age <= WORKFLOW.submissionStuckMs) {
      return transformation;
    }
    logger.error('Transformation never recorded a Magic Hour project id; marking it failed', {
      transformationId: transformation._id,
    });
    return move(
      transformation,
      ['queued'],
      'failed',
      { error: storedError('INTERNAL'), completedAt: now },
      deps,
    );
  }

  const claimed = await transformations.claimReconciliation(
    transformation._id,
    now,
    WORKFLOW.reconcileIntervalMs,
  );
  if (!claimed) {
    return transformation;
  }

  let current = claimed;
  try {
    const status = await provider.getProjectStatus(current.kind, projectId);
    current = await applyProviderStatus(current, status, now, deps);
  } catch (error) {
    logger.warn('Provider status check failed during reconciliation', {
      transformationId: current._id,
      error,
    });
    current = (await transformations.findById(current._id)) ?? current;
  }

  const startedAt = current.submittedAt ?? current.createdAt;
  const overdue = now.getTime() - startedAt.getTime() > WORKFLOW.timeoutMs[current.kind];
  if (overdue && (current.status === 'queued' || current.status === 'processing')) {
    logger.warn('Transformation timed out', { transformationId: current._id, projectId });
    current = await move(
      current,
      ['queued', 'processing'],
      'timed_out',
      { error: storedError('WEBHOOK_TIMEOUT'), completedAt: now },
      deps,
    );
  }
  return current;
}

async function applyProviderStatus(
  transformation: TransformationDoc,
  project: ProjectStatus,
  now: Date,
  deps: ReconcileDeps,
): Promise<TransformationDoc> {
  switch (project.status) {
    case 'complete': {
      const downloadUrl = project.downloads[0]?.url;
      if (!downloadUrl) {
        throw new Error('Magic Hour reports the project complete but lists no downloads');
      }
      return finalizeTransformation(transformation, downloadUrl, deps);
    }
    case 'error':
    case 'canceled': {
      const cancelled = project.status === 'canceled';
      return move(
        transformation,
        ['queued', 'processing', 'timed_out'],
        'failed',
        {
          error: storedError(
            'TRANSFORMATION_FAILED',
            cancelled ? 'The transformation was cancelled.' : undefined,
          ),
          provider: {
            rawError: project.error ?? { status: project.status },
            creditsCharged: project.creditsCharged,
          },
          completedAt: now,
        },
        deps,
      );
    }
    case 'rendering':
      return transformation.status === 'queued'
        ? move(transformation, ['queued'], 'processing', {}, deps)
        : transformation;
    case 'queued':
    case 'draft':
      return transformation;
  }
}

/** A conditional transition that always yields the latest document, whether or not it applied. */
async function move(
  transformation: TransformationDoc,
  from: readonly TransformationStatus[],
  to: TransformationStatus,
  patch: TransitionPatch,
  { transformations }: Pick<AppDeps, 'transformations'>,
): Promise<TransformationDoc> {
  return (
    (await transformations.transition(transformation._id, from, to, patch)) ??
    (await transformations.findById(transformation._id)) ??
    transformation
  );
}
