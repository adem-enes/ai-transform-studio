import { type ClientErrorCode, errorCodeOf } from '@/lib/api/errors';
import { shouldPoll } from '@/lib/api/polling';
import type { MediaKind, TransformationView } from '@/schemas';

/** What the result panel of a transform page shows. */
export type PanelState =
  | { kind: 'empty' }
  | { kind: 'submitting'; startedAt: number }
  | { kind: 'loading' }
  | { kind: 'load-error'; code: ClientErrorCode }
  | { kind: 'active'; transformation: TransformationView }
  | { kind: 'completed'; transformation: TransformationView }
  | { kind: 'failed'; transformation: TransformationView }
  | { kind: 'timed_out'; transformation: TransformationView; stillChecking: boolean };

/** The panel state for a page of `kind`, from the URL's id, the submit in flight and the polled transformation. */
export function derivePanelState({
  kind,
  transformationId,
  invalidId,
  submitStartedAt,
  data,
  error,
  isPending,
  nowMs,
}: {
  kind: MediaKind;
  transformationId: string | null;
  invalidId: boolean;
  /** Set while a submit is in flight. */
  submitStartedAt: number | null;
  data: TransformationView | undefined;
  error: unknown;
  isPending: boolean;
  nowMs: number;
}): PanelState {
  if (submitStartedAt !== null) {
    return { kind: 'submitting', startedAt: submitStartedAt };
  }
  if (invalidId) {
    return { kind: 'load-error', code: 'NOT_FOUND' };
  }
  if (!transformationId) {
    return { kind: 'empty' };
  }
  // A link to the other page's job (`/video?t=<image job>`) is treated as not found here.
  if (data !== undefined && data.kind !== kind) {
    return { kind: 'load-error', code: 'NOT_FOUND' };
  }
  if (!data) {
    return isPending && !error ? { kind: 'loading' } : { kind: 'load-error', code: errorCodeOf(error) };
  }
  switch (data.status) {
    case 'completed':
      return { kind: 'completed', transformation: data };
    case 'failed':
      return { kind: 'failed', transformation: data };
    case 'timed_out':
      return { kind: 'timed_out', transformation: data, stillChecking: shouldPoll(data, nowMs) };
    default:
      return { kind: 'active', transformation: data };
  }
}

/**
 * Server field errors (`params.prompt` → `prompt`) onto the form. Returns how
 * many messages had no matching field, which the caller shows as a general error.
 */
export function applyFieldErrors(
  details: Record<string, string[]>,
  fields: ReadonlySet<string>,
  apply: (field: string, message: string) => void,
): number {
  let unmapped = 0;
  for (const [path, messages] of Object.entries(details)) {
    const field = path.replace(/^params\./, '');
    const message = messages[0];
    if (fields.has(field) && message) {
      apply(field, message);
    } else {
      unmapped += 1;
    }
  }
  return unmapped;
}
