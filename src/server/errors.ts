import 'server-only';
import { type ApiError, ERROR_MESSAGES, type ErrorCode, type ErrorResponse } from '@/schemas';

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
  TRANSFORMATION_FAILED: 502,
  WEBHOOK_TIMEOUT: 504,
  VALIDATION_FAILED: 400,
  INVALID_SIGNATURE: 401,
  NOT_FOUND: 404,
  INTERNAL: 500,
} as const satisfies Record<ErrorCode, number>;

type AppErrorOptions = {
  /** User-safe message. Defaults to the shared copy for the code. */
  message?: string;
  /** Internal detail for logs. Never serialized to a client. */
  cause?: unknown;
};

/**
 * The one error type services throw on purpose. Route handlers turn it into
 * `{ error: { code, message } }` with `httpStatus`; anything else is `INTERNAL`.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;

  constructor(code: ErrorCode, { message, cause }: AppErrorOptions = {}) {
    super(message ?? ERROR_MESSAGES[code], { cause });
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = HTTP_STATUS[code];
  }

  toApiError(): ApiError {
    return { code: this.code, message: this.message };
  }

  /** Guards against `JSON.stringify(error)` ever leaking `cause`. */
  toJSON(): ApiError {
    return this.toApiError();
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Normalizes anything thrown into a client-safe body and status. */
export function toErrorResponse(error: unknown): { status: number; body: ErrorResponse } {
  const appError = isAppError(error) ? error : new AppError('INTERNAL', { cause: error });
  return { status: appError.httpStatus, body: { error: appError.toApiError() } };
}
