import 'server-only';
import * as z from 'zod';
import { optional } from './optional';

/**
 * Server-side environment, validated once and read through a call.
 *
 * Same posture as the reference storefront's `src/config/env.ts`:
 *
 * - **Shape and presence are separate questions.** Every variable is optional
 *   in the schema, so a *malformed* value is always an error, while a
 *   *missing* one is a deployment-readiness question answered by
 *   `missingServerEnv()` — fatal at server startup in production, a warning in
 *   development (see `src/instrumentation.node.ts`).
 * - **Lazy, never parsed at import time.** Next loads this module graph while
 *   collecting page data during `next build`; an import-time parse would turn
 *   every runtime secret into a build requirement. `next build` therefore
 *   passes with no `.env.local` at all.
 * - **Call sites that need a value use `requireServerEnv()`**, which narrows
 *   the type and throws with the variable's name, so a service never has to
 *   handle `undefined` for configuration it cannot work without.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** MongoDB connection string (`mongodb://` or `mongodb+srv://`). */
  MONGODB_URI: optional(
    z.string().regex(/^mongodb(\+srv)?:\/\//, 'MONGODB_URI must start with mongodb:// or mongodb+srv://'),
  ),

  /** Cloudinary account credentials — media storage for inputs and results. */
  CLOUDINARY_CLOUD_NAME: optional(z.string().min(1)),
  CLOUDINARY_API_KEY: optional(z.string().min(1)),
  CLOUDINARY_API_SECRET: optional(z.string().min(1)),

  /** Uploadcare secret key — server-side verification/management of client uploads. */
  UPLOADCARE_SECRET_KEY: optional(z.string().min(1)),

  /** Magic Hour API key, and the secret its webhooks are verified against. */
  MAGIC_HOUR_API_KEY: optional(z.string().min(1)),
  MAGIC_HOUR_WEBHOOK_SECRET: optional(z.string().min(1)),

  /**
   * This app's own public origin — the base for absolute URLs handed to third
   * parties (e.g. the Magic Hour webhook callback). Normalised to a bare
   * origin so a trailing slash or a pasted path cannot produce `//api/...`.
   */
  APP_URL: optional(z.url({ protocol: /^https?$/ }).transform((value) => new URL(value).origin)),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

type RequiredServerKey = Exclude<keyof ServerEnv, 'NODE_ENV'>;

/** Every variable the running app needs. All of them, today — kept as a list so one can become optional later. */
const REQUIRED_SERVER_ENV = [
  'MONGODB_URI',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'UPLOADCARE_SECRET_KEY',
  'MAGIC_HOUR_API_KEY',
  'MAGIC_HOUR_WEBHOOK_SECRET',
  'APP_URL',
] as const satisfies readonly RequiredServerKey[];

let cached: ServerEnv | undefined;

/** Parses and caches `process.env`. Throws on a malformed value; never on a missing one. */
export function loadServerEnv(): ServerEnv {
  if (cached) {
    return cached;
  }
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid server environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  cached = Object.freeze(parsed.data);
  return cached;
}

/** The names of required variables that are not set. Reported, never thrown, so startup can list them all at once. */
export function missingServerEnv(env: ServerEnv): RequiredServerKey[] {
  return REQUIRED_SERVER_ENV.filter((key) => env[key] === undefined);
}

/**
 * The named variables, guaranteed present.
 *
 * @example const { MAGIC_HOUR_API_KEY } = requireServerEnv('MAGIC_HOUR_API_KEY');
 */
export function requireServerEnv<K extends RequiredServerKey>(
  ...keys: K[]
): { [P in K]: NonNullable<ServerEnv[P]> } {
  const env = loadServerEnv();
  const missing = keys.filter((key) => env[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}. See .env.example.`);
  }
  return env as { [P in K]: NonNullable<ServerEnv[P]> };
}
