import 'server-only';
import type { Collection } from 'mongodb';
import { getDb } from './client';
import type { TransformationDoc, UploadDoc } from './models';

export const COLLECTIONS = {
  uploads: 'uploads',
  transformations: 'transformations',
} as const;

export async function uploadsCollection(): Promise<Collection<UploadDoc>> {
  return (await getDb()).collection<UploadDoc>(COLLECTIONS.uploads);
}

export async function transformationsCollection(): Promise<Collection<TransformationDoc>> {
  return (await getDb()).collection<TransformationDoc>(COLLECTIONS.transformations);
}

/**
 * Creates every index the repositories rely on. Safe to run repeatedly:
 * `createIndexes` with an identical spec is a no-op. Run by
 * `npm run check:services` (and whenever a deploy needs it).
 *
 * The history indexes end in `_id` because pagination sorts on
 * `(createdAt, _id)`; without it, ties on `createdAt` sort in memory.
 */
export async function ensureIndexes(): Promise<void> {
  const [uploads, transformations] = await Promise.all([uploadsCollection(), transformationsCollection()]);
  await Promise.all([
    uploads.createIndexes([{ key: { userId: 1, createdAt: -1, _id: -1 }, name: 'user_history' }]),
    transformations.createIndexes([
      { key: { userId: 1, createdAt: -1, _id: -1 }, name: 'user_history' },
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
