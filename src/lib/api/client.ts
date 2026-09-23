import type * as z from 'zod';
import { errorResponse } from '@/schemas';
import { ApiError, isAbortError } from './errors';

type RequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
};

/**
 * Calls one of this app's API routes and validates the response against the
 * shared schema.
 *
 * - A non-2xx response becomes an `ApiError` with the code, message and
 *   details from the `{ error }` envelope (`INTERNAL` if the body is not one —
 *   e.g. a platform error page).
 * - No response at all becomes `NETWORK_ERROR`. An abort is re-thrown as-is.
 * - A 2xx body that does not match `schema` is `INTERNAL`: the UI never
 *   renders data it has not validated.
 */
export async function apiRequest<T extends z.ZodType>(
  path: string,
  schema: T,
  { method = 'GET', body, signal }: RequestOptions = {},
): Promise<z.infer<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      signal,
      credentials: 'same-origin',
      headers:
        body === undefined
          ? { accept: 'application/json' }
          : { 'content-type': 'application/json', accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new ApiError('NETWORK_ERROR', 'Could not reach the server.', { cause: error });
  }

  const json: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsed = errorResponse.safeParse(json);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiError(code, message, { status: response.status, details });
    }
    throw new ApiError('INTERNAL', `Unexpected ${response.status} response.`, { status: response.status });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError('INTERNAL', 'The server sent a response this page does not understand.', {
      status: response.status,
      cause: parsed.error,
    });
  }
  return parsed.data;
}
