import { loadClientEnv, missingClientEnv } from '@/lib/env/client';
import { loadServerEnv, missingServerEnv } from '@/lib/env/server';

/**
 * The Node.js half of startup validation, imported by `src/instrumentation.ts`.
 *
 * - A **malformed** value always refuses to start.
 * - A **missing** value refuses to start in production and warns elsewhere,
 *   so `npm run dev` works before every third-party account exists.
 *
 * `console` rather than a logger: this runs before anything could configure one.
 */

function fail(message: string): never {
  console.error(message);
  console.error('\nThe app cannot start without a valid configuration. See .env.example.');
  process.exit(1);
}

function loadOrFail<T>(load: () => T): T {
  try {
    return load();
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

const server = loadOrFail(loadServerEnv);
const client = loadOrFail(loadClientEnv);

const missing = [...missingServerEnv(server), ...missingClientEnv(client)];

if (missing.length > 0) {
  const list = missing.map((key) => `- ${key}`).join('\n');
  if (server.NODE_ENV === 'production') {
    fail(`Missing required environment variables:\n${list}`);
  }
  console.warn(
    `[env] Missing environment variables (fatal in production):\n${list}\n` +
      'Features that need them will fail when used. Copy .env.example to .env.local and fill them in.',
  );
}
