import 'server-only';
import { type Filter, ObjectId } from 'mongodb';
import {
  canTransition,
  isTerminalStatus,
  type MediaKind,
  TRANSFORMATION_STATUSES,
  type TransformationStatus,
} from '@/schemas';
import { transformationsCollection } from '@/server/db/collections';
import {
  type TransformationDoc,
  type TransformationError,
  type TransformationOutput,
  type TransformationProvider,
  transformationDoc,
} from '@/server/db/models';
import { afterCursorFilter, decodeCursor, encodeCursor, parseObjectId } from './cursor';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A new transformation: who, what source, which params. Everything else starts empty. */
export type NewTransformation = DistributiveOmit<
  TransformationDoc,
  | '_id'
  | 'status'
  | 'provider'
  | 'output'
  | 'error'
  | 'createdAt'
  | 'submittedAt'
  | 'completedAt'
  | 'lastReconciledAt'
  | 'updatedAt'
>;

/** Every non-terminal status — a transformation in one of these still has work outstanding. */
export const ACTIVE_STATUSES: readonly TransformationStatus[] = TRANSFORMATION_STATUSES.filter(
  (status) => !isTerminalStatus(status),
);

/** Statuses a provider check may be claimed for. The recovery window for `timed_out` is the caller's to enforce. */
const RECONCILABLE_STATUSES: readonly TransformationStatus[] = [...ACTIVE_STATUSES, 'timed_out'];

function parse(doc: unknown): TransformationDoc {
  return transformationDoc.parse(doc);
}

export async function createTransformation(input: NewTransformation): Promise<TransformationDoc> {
  const now = new Date();
  const doc = parse({
    ...input,
    _id: new ObjectId(),
    status: 'queued',
    provider: { projectId: null, creditsCharged: null, rawError: null },
    output: null,
    error: null,
    createdAt: now,
    submittedAt: null,
    completedAt: null,
    lastReconciledAt: null,
    updatedAt: now,
  });
  await (await transformationsCollection()).insertOne(doc);
  return doc;
}

/** Removes a transformation that was never submitted (used to back out of the active-job guard). */
export async function deleteTransformation(id: ObjectId): Promise<void> {
  await (await transformationsCollection()).deleteOne({ _id: id, 'provider.projectId': null });
}

/** Internal lookup by id, not user-scoped — for workflow code that already holds a trusted id. */
export async function findTransformationById(id: ObjectId): Promise<TransformationDoc | null> {
  const doc = await (await transformationsCollection()).findOne({ _id: id });
  return doc ? parse(doc) : null;
}

export async function findTransformationByIdForUser(
  id: string,
  userId: string,
): Promise<TransformationDoc | null> {
  const _id = parseObjectId(id);
  if (!_id) {
    return null;
  }
  const doc = await (await transformationsCollection()).findOne({ _id, userId });
  return doc ? parse(doc) : null;
}

/** Webhook lookup. Not user-scoped: the caller has already verified the Magic Hour signature. */
export async function findTransformationByProjectId(projectId: string): Promise<TransformationDoc | null> {
  const doc = await (await transformationsCollection()).findOne({ 'provider.projectId': projectId });
  return doc ? parse(doc) : null;
}

/**
 * Records the Magic Hour project id once the create call returns. Only a still
 * `queued`, not-yet-submitted document is updated, so this can never overwrite
 * a project id or resurrect a document that has already failed.
 */
export async function markTransformationSubmitted(
  id: ObjectId,
  {
    projectId,
    creditsCharged,
    submittedAt,
  }: { projectId: string; creditsCharged: number; submittedAt: Date },
): Promise<TransformationDoc | null> {
  const doc = await (await transformationsCollection()).findOneAndUpdate(
    { _id: id, status: 'queued', 'provider.projectId': null },
    {
      $set: {
        'provider.projectId': projectId,
        'provider.creditsCharged': creditsCharged,
        submittedAt,
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' },
  );
  return doc ? parse(doc) : null;
}

export type TransitionPatch = {
  provider?: Partial<TransformationProvider>;
  output?: TransformationOutput | null;
  error?: TransformationError | null;
  /** Defaults to now when `to` is terminal. */
  completedAt?: Date | null;
};

/**
 * Moves a transformation to `to` if — atomically — its current status is one
 * of `from` and the move is allowed by `ALLOWED_TRANSITIONS`. Returns the
 * updated document, or `null` when nothing changed (wrong current status,
 * disallowed move, or no such document). A duplicate or out-of-order webhook
 * therefore lands here as a harmless `null`, never an error.
 */
export async function transition(
  id: ObjectId,
  from: readonly TransformationStatus[],
  to: TransformationStatus,
  patch: TransitionPatch = {},
): Promise<TransformationDoc | null> {
  const allowedFrom = from.filter((status) => canTransition(status, to));
  if (allowedFrom.length === 0) {
    return null;
  }

  const now = new Date();
  const set: Record<string, unknown> = { status: to, updatedAt: now };
  for (const [key, value] of Object.entries(patch.provider ?? {})) {
    set[`provider.${key}`] = value;
  }
  if (patch.output !== undefined) {
    set.output = patch.output;
  }
  if (patch.error !== undefined) {
    set.error = patch.error;
  }
  const completedAt =
    patch.completedAt !== undefined ? patch.completedAt : isTerminalStatus(to) ? now : undefined;
  if (completedAt !== undefined) {
    set.completedAt = completedAt;
  }

  const doc = await (await transformationsCollection()).findOneAndUpdate(
    { _id: id, status: { $in: [...allowedFrom] } },
    { $set: set },
    { returnDocument: 'after' },
  );
  return doc ? parse(doc) : null;
}

export async function listActiveTransformationsByUser(userId: string): Promise<TransformationDoc[]> {
  const docs = await (await transformationsCollection())
    .find({ userId, status: { $in: [...ACTIVE_STATUSES] } })
    .sort({ createdAt: -1, _id: -1 })
    .toArray();
  return docs.map(parse);
}

export async function countActiveTransformationsByUser(userId: string): Promise<number> {
  return (await transformationsCollection()).countDocuments({
    userId,
    status: { $in: [...ACTIVE_STATUSES] },
  });
}

/**
 * Atomically claims the right to check this transformation with the provider:
 * succeeds (returning the updated document) only if it is still active (or
 * `timed_out`, hence recoverable) and was not claimed within the last `minIntervalMs`. Concurrent status polls race on
 * this single conditional update, so at most one of them calls Magic Hour.
 */
export async function claimReconciliation(
  id: ObjectId,
  now: Date,
  minIntervalMs: number,
): Promise<TransformationDoc | null> {
  const doc = await (await transformationsCollection()).findOneAndUpdate(
    {
      _id: id,
      status: { $in: [...RECONCILABLE_STATUSES] },
      $or: [
        // `null` also matches documents written before the field existed.
        { lastReconciledAt: null },
        { lastReconciledAt: { $lte: new Date(now.getTime() - minIntervalMs) } },
      ],
    },
    { $set: { lastReconciledAt: now } },
    { returnDocument: 'after' },
  );
  return doc ? parse(doc) : null;
}

export type TransformationPage = { items: TransformationDoc[]; nextCursor: string | null };

export async function listTransformationsByUser({
  userId,
  kind,
  cursor,
  limit,
}: {
  userId: string;
  kind?: MediaKind;
  cursor?: string;
  limit: number;
}): Promise<TransformationPage> {
  const filter: Filter<TransformationDoc> = {
    userId,
    ...(kind ? { kind } : {}),
    ...(cursor ? afterCursorFilter(decodeCursor(cursor)) : {}),
  };
  const docs = await (await transformationsCollection())
    .find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();

  const items = docs.slice(0, limit).map(parse);
  const last = items.at(-1);
  const nextCursor =
    docs.length > limit && last ? encodeCursor({ createdAt: last.createdAt, id: last._id }) : null;
  return { items, nextCursor };
}
