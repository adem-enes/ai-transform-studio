import 'server-only';
import type { z } from 'zod';
import type { ErrorDetails } from '@/schemas';
import { AppError, isAppError, toErrorResponse } from '@/server/errors';
import { logger as defaultLogger, type Logger } from '@/server/logger';

/** API responses are per-user and live; nothing may cache them. */
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/**
 * `AppError` → its status and `{ error: { code, message, details? } }`;
 * anything else → 500 `INTERNAL` with the generic message. The full error is
 * logged (through the redacting logger) for 5xx responses and anything
 * unexpected; expected 4xx outcomes are not logged.
 */
export function errorJson(error: unknown, log: Logger = defaultLogger): Response {
  const { status, body } = toErrorResponse(error);
  if (!isAppError(error)) {
    log.error('Unhandled error in route handler', { error });
  } else if (status >= 500) {
    log.error('Route handler failed', { error });
  }
  return json(body, status);
}

/**
 * The one wrapper every route handler goes through: whatever the handler
 * throws becomes a well-formed error response.
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
  log: Logger = defaultLogger,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorJson(error, log);
    }
  };
}

/** Zod issues → `{ 'params.end_seconds': ['…'] }`. Issues on the root object are keyed `_`. */
export function zodDetails(error: z.ZodError): ErrorDetails {
  const details: ErrorDetails = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join('.') : '_';
    details[key] = [...(details[key] ?? []), issue.message];
  }
  return details;
}

/**
 * Validates request input. A failure is a 400 `VALIDATION_FAILED` with
 * field-level `details`.
 *
 * Input validation goes through here rather than the wrapper mapping every
 * `ZodError`: the repositories also parse stored documents with zod, and a
 * drifted document is a server fault (500), not a bad request.
 */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError('VALIDATION_FAILED', { details: zodDetails(result.error), cause: result.error });
  }
  return result.data;
}

/** The request body as JSON; a missing or malformed body is a 400. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    throw new AppError('VALIDATION_FAILED', {
      message: 'The request body must be valid JSON.',
      cause: error,
    });
  }
}
