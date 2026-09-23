import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Magic Hour webhook signature scheme
 * (https://docs.magichour.ai/integration/webhook/secure-handler):
 *
 *   signature = hex( HMAC-SHA256( secret, `${timestamp}.${rawBody}` ) )
 *
 * sent as `magic-hour-event-signature` (64 hex chars), with the Unix-seconds
 * `timestamp` in `magic-hour-event-timestamp`. The body must be the raw bytes
 * as received — re-serialized JSON will not match.
 */
export const SIGNATURE_HEADER = 'magic-hour-event-signature';
export const TIMESTAMP_HEADER = 'magic-hour-event-timestamp';

/** Replay window, either side of now (the docs' recommended 5 minutes). */
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

type HeaderSource = Headers | Record<string, string | undefined>;

function header(headers: HeaderSource, name: string): string | null {
  if (headers instanceof Headers) {
    return headers.get(name);
  }
  // Plain objects: header names are case-insensitive, so match regardless of how they were keyed.
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  return key === undefined ? null : (headers[key] ?? null);
}

/**
 * `true` only for an authentic, fresh webhook. Pure: the clock and secret are
 * parameters, so every branch is testable.
 */
export function verifyWebhookSignature(
  rawBody: string | Uint8Array,
  headers: HeaderSource,
  secret: string,
  nowMs: number,
): boolean {
  const signature = header(headers, SIGNATURE_HEADER)?.trim().toLowerCase();
  const timestamp = header(headers, TIMESTAMP_HEADER)?.trim();
  if (!signature || !timestamp || !secret) {
    return false;
  }
  if (!/^[a-f\d]{64}$/.test(signature) || !/^\d{1,12}$/.test(timestamp)) {
    return false;
  }
  if (Math.abs(Math.floor(nowMs / 1000) - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.`, 'utf8').update(rawBody).digest();
  // Both are exactly 32 bytes here, as timingSafeEqual requires.
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
