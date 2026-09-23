import 'server-only';
import type { Collection, Db } from 'mongodb';
import { logger } from '@/server/logger';
import { getDb } from './client';
import type { TransformationDoc, UploadDoc } from './models';

export const COLLECTIONS = {
  uploads: 'uploads',
  transformations: 'transformations',
} as const;

/**
 * Index creation runs once per server instance, on the first collection
 * access. The promise lives on `globalThis` (like the client) so concurrent
 * first requests share one run and dev-mode HMR does not repeat it.
 */
const cache = globalThis as typeof globalThis & {
  __indexesPromise?: Promise<void>;
};

export async function uploadsCollection(): Promise<Collection<UploadDoc>> {
  const db = await getDb();
  await indexesReady(db);
  return db.collection<UploadDoc>(COLLECTIONS.uploads);
}

export async function transformationsCollection(): Promise<Collection<TransformationDoc>> {
  const db = await getDb();
  await indexesReady(db);
  return db.collection<TransformationDoc>(COLLECTIONS.transformations);
}

/**
 * Resolves once this instance has ensured its indexes. Never rejects: the
 * indexes back performance and a uniqueness safety net, not correctness of a
 * single request, so a failure is logged and the memo cleared for the next
 * request to retry rather than failing every request until a redeploy.
 *
 * Skipped during `next build`, which must not need a database. (Every route
 * that reaches this is `force-dynamic`, so a build never should — this is
 * the belt to that brace.)
 */
function indexesReady(db: Db): Promise<void> {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return Promise.resolve();
  }
  if (!cache.__indexesPromise) {
    const promise = createIndexes(db).catch((error: unknown) => {
      logger.error('ensureIndexes failed; will retry on the next request', { error });
      if (cache.__indexesPromise === promise) {
        cache.__indexesPromise = undefined;
      }
    });
    cache.__indexesPromise = promise;
  }
  return cache.__indexesPromise;
}

/**
 * Creates every index the repositories rely on. Safe to run repeatedly:
 * `createIndexes` with an identical spec is a no-op. Runs automatically once
 * per server instance (see `indexesReady`) and from `npm run check:services`.
 *
 * The history indexes end in `_id` because pagination sorts on
 * `(createdAt, _id)`; without it, ties on `createdAt` sort in memory. The
 * `user_active` index serves the active-job guard and its reconciliation sweep.
 */
export async function ensureIndexes(): Promise<void> {
  await createIndexes(await getDb());
}

async function createIndexes(db: Db): Promise<void> {
  const uploads = db.collection<UploadDoc>(COLLECTIONS.uploads);
  const transformations = db.collection<TransformationDoc>(COLLECTIONS.transformations);
  await Promise.all([
    uploads.createIndexes([{ key: { userId: 1, createdAt: -1, _id: -1 }, name: 'user_history' }]),
    transformations.createIndexes([
      { key: { userId: 1, createdAt: -1, _id: -1 }, name: 'user_history' },
      { key: { userId: 1, status: 1 }, name: 'user_active' },
      {
        key: { 'provider.projectId': 1 },
        name: 'provider_project_unique',
        unique: true,
        // Unset until the Magic Hour create call returns; many docs may be null at once.
        partialFilterExpression: { 'provider.projectId': { $type: 'string' } },
      },
    ]),
  ]);
}
