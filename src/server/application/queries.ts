import 'server-only';
import {
  type HistoryQuery,
  type HistoryResponse,
  isTerminalStatus,
  type TransformationView,
} from '@/schemas';
import { AppError } from '@/server/errors';
import { toTransformationView } from '@/server/views';
import type { AppDeps } from './deps';
import { reconcileTransformation } from './reconcile-transformation';

/**
 * One transformation, as the UI polls it. An active one is reconciled with
 * the provider first (throttled; never fails the request).
 */
export async function getTransformation(
  { userId, id }: { userId: string; id: string },
  deps: AppDeps,
): Promise<TransformationView> {
  const transformation = await deps.transformations.findByIdForUser(id, userId);
  if (!transformation) {
    throw new AppError('NOT_FOUND');
  }
  const current = isTerminalStatus(transformation.status)
    ? transformation
    : await reconcileTransformation(transformation, deps.clock.now(), deps);
  return toTransformationView(current);
}

/** The user's transformations, newest first. Not reconciled: history is a listing, not a poll. */
export async function listHistory(
  { userId, ...query }: { userId: string } & HistoryQuery,
  { transformations }: Pick<AppDeps, 'transformations'>,
): Promise<HistoryResponse> {
  const page = await transformations.listByUser({ userId, ...query });
  return { items: page.items.map(toTransformationView), nextCursor: page.nextCursor };
}
