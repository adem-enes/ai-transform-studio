/**
 * Startup validation. Next calls `register()` once when the server boots,
 * before it serves anything — the fail-fast that `src/lib/env/*` deliberately
 * does not do at import time.
 *
 * The work lives in a dynamically imported sibling because this file is
 * bundled for the Edge runtime too, which has no `process.exit`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node');
  }
}
