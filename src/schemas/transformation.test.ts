import { describe, expect, it } from 'vitest';
import {
  canTransition,
  isTerminalStatus,
  TRANSFORMATION_STATUSES,
  type TransformationStatus,
} from './transformation';

const ALLOWED: ReadonlyArray<readonly [TransformationStatus, TransformationStatus]> = [
  ['queued', 'processing'],
  ['queued', 'finalizing'],
  ['queued', 'failed'],
  ['queued', 'timed_out'],
  ['processing', 'finalizing'],
  ['processing', 'failed'],
  ['processing', 'timed_out'],
  ['finalizing', 'completed'],
  ['finalizing', 'failed'],
];

const isAllowed = (from: TransformationStatus, to: TransformationStatus) =>
  ALLOWED.some(([f, t]) => f === from && t === to);

const EVERY_PAIR = TRANSFORMATION_STATUSES.flatMap((from) =>
  TRANSFORMATION_STATUSES.map((to) => [from, to] as const),
);
const DISALLOWED = EVERY_PAIR.filter(([from, to]) => !isAllowed(from, to));

describe('canTransition', () => {
  it.each(ALLOWED)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each(DISALLOWED)('rejects %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it('covers every status pair', () => {
    expect(ALLOWED.length + DISALLOWED.length).toBe(TRANSFORMATION_STATUSES.length ** 2);
  });
});

describe('isTerminalStatus', () => {
  it.each(TRANSFORMATION_STATUSES)('%s', (status) => {
    expect(isTerminalStatus(status)).toBe(['completed', 'failed', 'timed_out'].includes(status));
  });
});
