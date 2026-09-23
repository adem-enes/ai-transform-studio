import { z } from 'zod';

/**
 * Machine-readable error codes shared by the API and the UI. The UI keys its
 * copy off the code; the server never sends provider or stack details.
 */
export const ERROR_CODES = [
  // Upload validation
  'INVALID_FILE_TYPE',
  'FILE_TOO_LARGE',
  'FILE_NOT_READY',
  'UPLOAD_NOT_FOUND',
  'STORAGE_FAILED',
  // Magic Hour, at submission
  'PROVIDER_REJECTED',
  'INSUFFICIENT_CREDITS',
  'PLAN_UPGRADE_REQUIRED',
  'PROVIDER_UNAVAILABLE',
  'TOO_MANY_ACTIVE_JOBS',
  // Magic Hour, after submission
  'TRANSFORMATION_FAILED',
  'WEBHOOK_TIMEOUT',
  // Generic
  'VALIDATION_FAILED',
  'INVALID_SIGNATURE',
  'PAYLOAD_TOO_LARGE',
  'NOT_FOUND',
  'INTERNAL',
] as const;
export const errorCode = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCode>;

/** Default user-facing copy per code. The server may send a more specific message. */
export const ERROR_MESSAGES = {
  INVALID_FILE_TYPE: 'This file type is not supported.',
  FILE_TOO_LARGE: 'This file is too large.',
  FILE_NOT_READY: 'The upload has not finished processing yet. Try again in a moment.',
  UPLOAD_NOT_FOUND: 'The uploaded file could not be found.',
  STORAGE_FAILED: 'The file could not be stored. Please try again.',
  PROVIDER_REJECTED: 'The AI service rejected this request. Try different settings.',
  INSUFFICIENT_CREDITS: 'The AI service is out of credits.',
  PLAN_UPGRADE_REQUIRED: 'This option is not available on the current AI service plan.',
  PROVIDER_UNAVAILABLE: 'The AI service is temporarily unavailable. Please try again.',
  TOO_MANY_ACTIVE_JOBS: 'You already have transformations in progress. Wait for one to finish.',
  TRANSFORMATION_FAILED: 'The transformation failed.',
  WEBHOOK_TIMEOUT: 'The transformation took too long and was stopped.',
  VALIDATION_FAILED: 'Some of the submitted values are invalid.',
  INVALID_SIGNATURE: 'Invalid request signature.',
  PAYLOAD_TOO_LARGE: 'The request body is too large.',
  NOT_FOUND: 'Not found.',
  INTERNAL: 'Something went wrong on our side.',
} as const satisfies Record<ErrorCode, string>;

/** Field path (dot-separated, e.g. `params.end_seconds`) → messages for that field. */
export const errorDetails = z.record(z.string(), z.array(z.string()));
export type ErrorDetails = z.infer<typeof errorDetails>;

export const apiError = z.object({
  code: errorCode,
  message: z.string(),
  /** Field-level messages; present on `VALIDATION_FAILED` when the failure is tied to specific fields. */
  details: errorDetails.optional(),
});
export type ApiError = z.infer<typeof apiError>;

/** Body of every non-2xx JSON response. */
export const errorResponse = z.object({ error: apiError });
export type ErrorResponse = z.infer<typeof errorResponse>;
