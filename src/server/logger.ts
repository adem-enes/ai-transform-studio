import 'server-only';

/**
 * Structured server logs: one JSON line per entry, which Vercel's log viewer
 * indexes as-is.
 *
 * Fields are written through `safeValue`, which keeps only plain data and
 * redacts anything keyed like a credential. SDK errors are the main hazard —
 * Magic Hour's `ApiError.request` and Cloudinary's `request_options` both
 * carry secrets — so an `Error` is reduced to its name, message, code and
 * (recursively) its cause, never dumped whole.
 */

export type LogFields = Record<string, unknown>;

export type Logger = {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
};

const MAX_DEPTH = 4;
const REDACTED_KEY = /auth|secret|token|password|api[-_]?key|cookie|signature|^request$|headers/i;

export function safeValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'function' || typeof value === 'symbol' ? undefined : value;
  }
  if (depth >= MAX_DEPTH) {
    return '[truncated]';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    const fields: LogFields = { name: value.name, message: value.message };
    for (const key of ['code', 'httpStatus', 'retryable', 'status'] as const) {
      if (key in value) {
        fields[key] = (value as unknown as Record<string, unknown>)[key];
      }
    }
    if (value.cause !== undefined) {
      fields.cause = safeValue(value.cause, depth + 1);
    }
    return fields;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => safeValue(item, depth + 1));
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    // Class instances (ObjectId, URL, SDK objects, …): their string form, never their internals.
    return String(value);
  }
  const result: LogFields = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = REDACTED_KEY.test(key) ? '[redacted]' : safeValue(item, depth + 1);
  }
  return result;
}

function write(level: 'info' | 'warn' | 'error', message: string, fields: LogFields = {}): void {
  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...(safeValue(fields) as LogFields),
  });
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export const logger: Logger = {
  info: (message, fields) => write('info', message, fields),
  warn: (message, fields) => write('warn', message, fields),
  error: (message, fields) => write('error', message, fields),
};

/** For tests: swallows everything. */
export const silentLogger: Logger = { info() {}, warn() {}, error() {} };
