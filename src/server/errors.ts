import 'server-only';
import {
  type ApiError,
  ERROR_MESSAGES,
  type ErrorCode,
  type ErrorDetails,
  type ErrorResponse,
} from '@/schemas';

const HTTP_STATUS = {
  INVALID_FILE_TYPE: 415,
  FILE_TOO_LARGE: 413,
  FILE_NOT_READY: 409,
  UPLOAD_NOT_FOUND: 404,
  STORAGE_FAILED: 502,
  PROVIDER_REJECTED: 422,
  INSUFFICIENT_CREDITS: 402,
  PLAN_UPGRADE_REQUIRED: 402,
  PROVIDER_UNAVAILABLE: 503,
  TOO_MANY_ACTIVE_JOBS: 429,
  TRANSFORMATION_FAILED: 502,
  WEBHOOK_TIMEOUT: 504,
  VALIDATION_FAILED: 400,
  INVALID_SIGNATURE: 401,
  PAYLOAD_TOO_LARGE: 413,
  NOT_FOUND: 404,
  INTERNAL: 500,
} as const satisfies Record<ErrorCode, number>;

type AppErrorOptions = {
  /** User-safe message. Defaults to the shared copy for the code. */
  message?: string;
  /** User-safe field-level messages, keyed by dot-separated field path. */
  details?: ErrorDetails;
  /**
   * The operation may succeed if repeated unchanged — e.g. a webhook that
   * arrived before its project id was saved. The webhook route answers these
   * with 503 so Magic Hour redelivers.
   */
  retryable?: boolean;
  /** Internal detail for logs. Never serialized to a client. */
  cause?: unknown;
};

/**
 * The one error type services throw on purpose. Route handlers turn it into
 * `{ error: { code, message, details? } }` with `httpStatus`; anything else is `INTERNAL`.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details: ErrorDetails | undefined;
  readonly retryable: boolean;

  constructor(code: ErrorCode, { message, details, retryable = false, cause }: AppErrorOptions = {}) {
    super(message ?? ERROR_MESSAGES[code], { cause });
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = HTTP_STATUS[code];
    this.details = details;
    this.retryable = retryable;
  }

  toApiError(): ApiError {
    const error: ApiError = { code: this.code, message: this.message };
    return this.details ? { ...error, details: this.details } : error;
  }

  /** Guards against `JSON.stringify(error)` ever leaking `cause`. */
  toJSON(): ApiError {
    return this.toApiError();
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function isRetryable(error: unknown): boolean {
  return isAppError(error) && error.retryable;
}

/** Normalizes anything thrown into a client-safe body and status. */
export function toErrorResponse(error: unknown): { status: number; body: ErrorResponse } {
  const appError = isAppError(error) ? error : new AppError('INTERNAL', { cause: error });
  return { status: appError.httpStatus, body: { error: appError.toApiError() } };
}
