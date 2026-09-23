import 'server-only';
import * as z from 'zod';
import type { ErrorCode } from '@/schemas';
import { AppError } from '@/server/errors';

/**
 * Magic Hour error bodies are `{ code, message }` on every 4xx/5xx
 * (API reference, per-endpoint responses). Parsed leniently: an unexpected
 * body must still map to a sensible code.
 */
const providerErrorBody = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

/** What went wrong at the provider, for logs and `provider.rawError`. Never sent to clients. */
type ProviderFailure = {
  /** HTTP status, or `null` when no response arrived (network error, timeout). */
  status: number | null;
  code: string | null;
  message: string | null;
};

function codeFor({ status, code }: ProviderFailure): ErrorCode {
  if (status === null || status === 408 || status === 429 || status >= 500) {
    return 'PROVIDER_UNAVAILABLE';
  }
  if (status === 402) {
    return code === 'subscription_required' || code === 'plan_upgrade_required'
      ? 'PLAN_UPGRADE_REQUIRED'
      : 'INSUFFICIENT_CREDITS';
  }
  if (status === 400 || status === 422) {
    return 'PROVIDER_REJECTED';
  }
  if (status === 404) {
    return 'NOT_FOUND';
  }
  // 401/403: our API key is wrong — a deployment problem, not something the user can act on.
  return 'INTERNAL';
}

export function providerFailure(status: number | null, body: unknown): ProviderFailure {
  const parsed = providerErrorBody.safeParse(body);
  return {
    status,
    code: parsed.success ? (parsed.data.code ?? null) : null,
    message: parsed.success ? (parsed.data.message ?? null) : null,
  };
}

/** Pure mapping from a provider failure to the `AppError` a route should surface. */
export function mapProviderFailure(failure: ProviderFailure, cause?: unknown): AppError {
  return new AppError(codeFor(failure), { cause: { failure, error: cause } });
}

/** Reads the failure out of an AppError produced by `mapProviderFailure`, e.g. to store as `rawError`. */
export function providerFailureOf(error: AppError): ProviderFailure | null {
  const cause: unknown = error.cause;
  if (typeof cause === 'object' && cause !== null && 'failure' in cause) {
    const { failure } = cause;
    const parsed = z
      .object({ status: z.number().nullable(), code: z.string().nullable(), message: z.string().nullable() })
      .safeParse(failure);
    return parsed.success ? parsed.data : null;
  }
  return null;
}
