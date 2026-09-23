import { ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { AppError } from '@/server/errors';
import { decodeCursor, encodeCursor, parseObjectId } from './cursor';

describe('history cursor', () => {
  it('round-trips', () => {
    const cursor = { createdAt: new Date('2026-09-23T10:00:00.123Z'), id: new ObjectId() };
    const decoded = decodeCursor(encodeCursor(cursor));
    expect(decoded.createdAt.getTime()).toBe(cursor.createdAt.getTime());
    expect(decoded.id.equals(cursor.id)).toBe(true);
  });

  it.each(['', 'garbage', Buffer.from('123:nothex').toString('base64url')])('rejects %j', (value) => {
    expect(() => decodeCursor(value)).toThrow(AppError);
  });
});

describe('parseObjectId', () => {
  it('parses a hex id and rejects anything else', () => {
    const id = new ObjectId();
    expect(parseObjectId(id.toHexString())?.equals(id)).toBe(true);
    expect(parseObjectId('not-an-id')).toBeNull();
    expect(parseObjectId(`${id.toHexString()}0`)).toBeNull();
  });
});
