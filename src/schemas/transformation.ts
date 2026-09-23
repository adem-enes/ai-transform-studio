import * as z from 'zod';

/**
 * Lifecycle of a transformation, as this app tracks it (not Magic Hour's own statuses).
 *
 * - `queued` — created; submitted or about to be submitted to Magic Hour.
 * - `processing` — Magic Hour started rendering (`*.started` webhook).
 * - `finalizing` — Magic Hour finished; the result is being copied to Cloudinary.
 * - `completed` / `failed` / `timed_out` — terminal: the job holds no active slot
 *   and the UI stops treating it as running.
 *
 * `timed_out` is the one terminal status that is our own guess rather than
 * the provider's verdict, so it can still be recovered — see `ALLOWED_TRANSITIONS`.
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

const TERMINAL_STATUSES = [
  'completed',
  'failed',
  'timed_out',
] as const satisfies readonly TransformationStatus[];

/**
 * Every allowed status change, keyed by the status it leaves. Anything not
 * listed — including every change out of `completed` or `failed` — is
 * rejected, which is what makes a duplicate or late webhook a no-op.
 *
 * `queued → finalizing` exists because Magic Hour documents that fast image
 * jobs may complete without ever sending `image.started`.
 *
 * `timed_out → finalizing | failed` exist because a timeout is only our
 * guess: a job that finishes (or fails) at Magic Hour afterwards is
 * recovered by a late webhook or by reconciliation, rather than leaving
 * spent credits with a lost result.
 */
const ALLOWED_TRANSITIONS = {
  queued: ['processing', 'finalizing', 'failed', 'timed_out'],
  processing: ['finalizing', 'failed', 'timed_out'],
  finalizing: ['completed', 'failed'],
  completed: [],
  failed: [],
  timed_out: ['finalizing', 'failed'],
} as const satisfies Record<TransformationStatus, readonly TransformationStatus[]>;

export function canTransition(from: TransformationStatus, to: TransformationStatus): boolean {
  const targets: readonly TransformationStatus[] = ALLOWED_TRANSITIONS[from];
  return targets.includes(to);
}

export function isTerminalStatus(status: TransformationStatus): boolean {
  const terminal: readonly TransformationStatus[] = TERMINAL_STATUSES;
  return terminal.includes(status);
}
