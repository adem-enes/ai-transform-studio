import { isTerminalStatus, type TransformationView } from '@/schemas';

/** How often an active transformation is re-fetched. */
export const POLL_INTERVAL_MS = 2_500;

/**
 * How long a `timed_out` transformation keeps being polled after it timed
 * out. The server may still recover it (a late webhook, or reconciliation
 * finding it finished), so the page watches for a little longer rather than
 * showing the timeout as final straight away.
 */
export const TIMED_OUT_GRACE_MS = 2 * 60_000;

/**
 * Whether a transformation is still worth polling at `nowMs`: every
 * non-terminal status, and `timed_out` within the grace period measured from
 * when the server marked it (`completedAt`).
 */
export function shouldPoll(
  transformation: Pick<TransformationView, 'status' | 'completedAt'>,
  nowMs: number,
): boolean {
  if (!isTerminalStatus(transformation.status)) {
    return true;
  }
  if (transformation.status !== 'timed_out') {
    return false;
  }
  if (transformation.completedAt === null) {
    return true;
  }
  return nowMs - Date.parse(transformation.completedAt) < TIMED_OUT_GRACE_MS;
}
