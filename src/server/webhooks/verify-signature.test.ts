import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyWebhookSignature } from './verify-signature';

const SECRET = 'whsec_test_secret';
const NOW_MS = 1_729_315_000_000;
const TIMESTAMP = String(Math.floor(NOW_MS / 1000) - 16);
const BODY =
  '{"type":"image.completed","payload":{"id":"clx123","status":"complete","downloads":[{"url":"https://videos.magichour.ai/clx123/output.png","expires_at":"2024-10-19T05:16:19.027Z"}],"error":null}}';

function sign(body: string, timestamp: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function headers(signature: string, timestamp: string): Headers {
  return new Headers({ [SIGNATURE_HEADER]: signature, [TIMESTAMP_HEADER]: timestamp });
}

describe('verifyWebhookSignature', () => {
  it('accepts a correctly signed, fresh webhook', () => {
    expect(verifyWebhookSignature(BODY, headers(sign(BODY, TIMESTAMP), TIMESTAMP), SECRET, NOW_MS)).toBe(
      true,
    );
  });

  it('accepts the raw body as bytes', () => {
    const bytes = new TextEncoder().encode(BODY);
    expect(verifyWebhookSignature(bytes, headers(sign(BODY, TIMESTAMP), TIMESTAMP), SECRET, NOW_MS)).toBe(
      true,
    );
  });

  it('accepts plain-object headers with any casing', () => {
    const plain = {
      'Magic-Hour-Event-Signature': sign(BODY, TIMESTAMP),
      'MAGIC-HOUR-EVENT-TIMESTAMP': TIMESTAMP,
    };
    expect(verifyWebhookSignature(BODY, plain, SECRET, NOW_MS)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const tampered = BODY.replace('"complete"', '"error"');
    expect(verifyWebhookSignature(tampered, headers(sign(BODY, TIMESTAMP), TIMESTAMP), SECRET, NOW_MS)).toBe(
      false,
    );
  });

  it('rejects a re-serialized body even when the JSON is equivalent', () => {
    const reserialized = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(
      verifyWebhookSignature(reserialized, headers(sign(BODY, TIMESTAMP), TIMESTAMP), SECRET, NOW_MS),
    ).toBe(false);
  });

  it('rejects a signature made with another secret', () => {
    const signature = sign(BODY, TIMESTAMP, 'whsec_other');
    expect(verifyWebhookSignature(BODY, headers(signature, TIMESTAMP), SECRET, NOW_MS)).toBe(false);
  });

  it('rejects a signature whose timestamp header was swapped', () => {
    const otherTimestamp = String(Number(TIMESTAMP) + 1);
    expect(verifyWebhookSignature(BODY, headers(sign(BODY, TIMESTAMP), otherTimestamp), SECRET, NOW_MS)).toBe(
      false,
    );
  });

  it.each([
    ['older than 5 minutes', -301],
    ['more than 5 minutes in the future', 301],
  ])('rejects a timestamp %s', (_label, offsetSeconds) => {
    const timestamp = String(Math.floor(NOW_MS / 1000) + offsetSeconds);
    expect(verifyWebhookSignature(BODY, headers(sign(BODY, timestamp), timestamp), SECRET, NOW_MS)).toBe(
      false,
    );
  });

  it('accepts a timestamp exactly at the 5-minute edge', () => {
    const timestamp = String(Math.floor(NOW_MS / 1000) - 300);
    expect(verifyWebhookSignature(BODY, headers(sign(BODY, timestamp), timestamp), SECRET, NOW_MS)).toBe(
      true,
    );
  });

  it.each([
    ['no headers', new Headers()],
    ['no signature', new Headers({ [TIMESTAMP_HEADER]: TIMESTAMP })],
    ['no timestamp', new Headers({ [SIGNATURE_HEADER]: sign(BODY, TIMESTAMP) })],
    ['a malformed signature', headers('not-hex', TIMESTAMP)],
    ['a truncated signature', headers(sign(BODY, TIMESTAMP).slice(0, 63), TIMESTAMP)],
    ['a non-numeric timestamp', headers(sign(BODY, 'abc'), 'abc')],
  ])('rejects %s', (_label, input) => {
    expect(verifyWebhookSignature(BODY, input, SECRET, NOW_MS)).toBe(false);
  });

  it('rejects everything when the secret is empty', () => {
    expect(verifyWebhookSignature(BODY, headers(sign(BODY, TIMESTAMP, ''), TIMESTAMP), '', NOW_MS)).toBe(
      false,
    );
  });
});
