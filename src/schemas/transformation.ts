import { z } from 'zod';

/**
 * Lifecycle of a transformation, as this app tracks it (not Magic Hour's own statuses).
 *
 * - `queued` — created; submitted or about to be submitted to Magic Hour.
 * - `processing` — Magic Hour started rendering (`*.started` webhook).
 * - `finalizing` — Magic Hour finished; the result is being copied to Cloudinary.
 * - `completed` / `failed` / `timed_out` — terminal.
 */
export const TRANSFORMATION_STATUSES = [
  'queued',
  'processing',
  'finalizing',
  'completed',
  'failed',
  'timed_out',
] as const;
export const transformationStatus = z.enum(TRANSFORMATION_STATUSES);
export type TransformationStatus = z.infer<typeof transformationStatus>;

/**
 * Every allowed status change, keyed by the status it leaves. Anything not
 * listed — including every change out of a terminal status — is rejected,
 * which is what makes a duplicate or late webhook a no-op.
 *
 * `queued → finalizing` exists because Magic Hour documents that fast image
 * jobs may complete without ever sending `image.started`.
 */
export const ALLOWED_TRANSITIONS = {
  queued: ['processing', 'finalizing', 'failed', 'timed_out'],
  processing: ['finalizing', 'failed', 'timed_out'],
  finalizing: ['completed', 'failed'],
  completed: [],
  failed: [],
  timed_out: [],
} as const satisfies Record<TransformationStatus, readonly TransformationStatus[]>;

export function canTransition(from: TransformationStatus, to: TransformationStatus): boolean {
  const targets: readonly TransformationStatus[] = ALLOWED_TRANSITIONS[from];
  return targets.includes(to);
}

export function isTerminalStatus(status: TransformationStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}
