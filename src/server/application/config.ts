import 'server-only';
import type { MediaKind } from '@/schemas';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** Workflow timing and limits — the one place these numbers live. */
export const WORKFLOW = {
  /** Transformations per user that may be queued, processing or finalizing at once. */
  maxActiveJobs: 2,
  /** Minimum gap between two provider status checks for the same transformation. */
  reconcileIntervalMs: 15 * SECOND,
  /**
   * A transformation still `queued` without a project id this long after
   * creation was either never submitted or submitted without its id being
   * saved — either way nothing will ever update it again.
   */
  submissionStuckMs: 2 * MINUTE,
  /** Since submission; past this a still-running job is marked `timed_out`. */
  timeoutMs: {
    image: 5 * MINUTE,
    video: 20 * MINUTE,
  } satisfies Record<MediaKind, number>,
  /**
   * Since submission; a `timed_out` job is still checked with the provider
   * until then, in case it finished after all. Magic Hour's download URLs
   * expire about a day after the render, so later there is nothing to recover.
   */
  timedOutRecoveryMs: 24 * HOUR,
} as const;
