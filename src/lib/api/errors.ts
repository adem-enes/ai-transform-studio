import type { ErrorCode, ErrorDetails } from '@/schemas';

/**
 * Failures that only the browser can observe — the server never sends these.
 *
 * - `NETWORK_ERROR` — the request never got an HTTP response (offline, DNS, CORS, reset).
 * - `UPLOAD_FAILED` — the direct upload to Uploadcare failed for a reason other than the network.
 */
export const CLIENT_ERROR_CODES = ['NETWORK_ERROR', 'UPLOAD_FAILED'] as const;
export type ClientOnlyErrorCode = (typeof CLIENT_ERROR_CODES)[number];

/** Every code the UI may have to present: the shared API codes plus the client-only ones. */
export type ClientErrorCode = ErrorCode | ClientOnlyErrorCode;

/**
 * A failed API call, carrying the shared error code. `status` is the HTTP
 * status, or `null` when no response arrived. `details` holds field-level
 * messages on `VALIDATION_FAILED`, keyed by dot-separated field path.
 */
export class ApiError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number | null;
  readonly details: ErrorDetails | undefined;

  constructor(
    code: ClientErrorCode,
    message: string,
    {
      status = null,
      details,
      cause,
    }: { status?: number | null; details?: ErrorDetails; cause?: unknown } = {},
  ) {
    super(message, { cause });
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** `true` for a user- or code-initiated abort, which is not a failure worth presenting. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** The code to present for anything thrown; unknown errors are `INTERNAL`. */
export function errorCodeOf(error: unknown): ClientErrorCode {
  return isApiError(error) ? error.code : 'INTERNAL';
}
