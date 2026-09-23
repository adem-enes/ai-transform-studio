import * as z from 'zod';

/**
 * No JIT-compiled object parsers. Zod otherwise probes `new Function('')`,
 * which the Content-Security-Policy (no `'unsafe-eval'`) blocks — zod falls
 * back, but the browser reports a CSP violation on every page that parses.
 * The interpreted parser is plenty fast for API-sized payloads.
 *
 * Must be evaluated before any schema is defined: `./index` imports it first.
 */
z.config({ jitless: true });
