import * as z from 'zod';

/**
 * Treats an empty string as absent, so `FOO=` in `.env.local` (or an empty
 * value in the Vercel dashboard) reads as "not set" rather than failing a
 * `.min(1)` or a URL check. A value that *is* present is still validated
 * against `schema`, so a malformed one is an error, never a guess.
 */
export function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}
