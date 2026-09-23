import 'server-only';
import { ObjectId } from 'mongodb';
import { AppError } from '@/server/errors';

/** Position in a list sorted by `(createdAt desc, _id desc)`. */
export type HistoryCursor = { createdAt: Date; id: ObjectId };

export function encodeCursor({ createdAt, id }: HistoryCursor): string {
  return Buffer.from(`${createdAt.getTime()}:${id.toHexString()}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): HistoryCursor {
  const match = /^(\d{1,15}):([a-f\d]{24})$/i.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!match?.[1] || !match[2]) {
    throw new AppError('VALIDATION_FAILED', { message: 'Invalid pagination cursor.' });
  }
  return { createdAt: new Date(Number(match[1])), id: new ObjectId(match[2]) };
}

/** Mongo filter for "strictly after `cursor`" in `(createdAt desc, _id desc)` order. */
export function afterCursorFilter({ createdAt, id }: HistoryCursor) {
  return {
    $or: [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: id } }],
  };
}

/** Parses a route param into an ObjectId, or `null` for anything that is not one. */
export function parseObjectId(value: string): ObjectId | null {
  return /^[a-f\d]{24}$/i.test(value) ? new ObjectId(value) : null;
}
