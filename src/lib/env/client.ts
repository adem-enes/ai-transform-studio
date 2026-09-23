import { z } from 'zod';
import { optional } from './optional';

/**
 * Browser-visible environment. Safe to import from client components.
 *
 * `NEXT_PUBLIC_*` values are **inlined at build time**, and only where the
 * source spells out `process.env.NEXT_PUBLIC_X` literally — so the object
 * below lists each one by name rather than passing `process.env` to the
 * schema. It also means these are build-time configuration: a value missing
 * during `next build` is missing from the client bundle until the next build.
 *
 * Lazy and presence-checked at startup, exactly like `./server.ts`.
 */
export const clientEnvSchema = z.object({
  /** Uploadcare public key for the client-side upload widget. */
  NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY: optional(z.string().min(1)),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

type ClientKey = keyof ClientEnv;

export const REQUIRED_CLIENT_ENV = [
  'NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY',
] as const satisfies readonly ClientKey[];

let cached: ClientEnv | undefined;

export function loadClientEnv(): ClientEnv {
  if (cached) {
    return cached;
  }
  const parsed = clientEnvSchema.safeParse({
    NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY: process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY,
  });
  if (!parsed.success) {
    throw new Error(`Invalid client environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  cached = Object.freeze(parsed.data);
  return cached;
}

export function missingClientEnv(env: ClientEnv): ClientKey[] {
  return REQUIRED_CLIENT_ENV.filter((key) => env[key] === undefined);
}

export const clientEnv = loadClientEnv;
