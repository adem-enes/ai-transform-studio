import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signUpload, UPLOAD_SIGNATURE_TTL_SECONDS } from './uploadcare-signature';

describe('signUpload', () => {
  it('signs an expiry 30 minutes out with HMAC-SHA256 of the expiry', () => {
    const nowMs = 1_790_000_000_500;
    const { signature, expire } = signUpload('secret', nowMs);

    expect(expire).toBe(1_790_000_000 + UPLOAD_SIGNATURE_TTL_SECONDS);
    expect(UPLOAD_SIGNATURE_TTL_SECONDS).toBe(1800);
    expect(signature).toBe(createHmac('sha256', 'secret').update(String(expire)).digest('hex'));
    expect(signature).toMatch(/^[a-f\d]{64}$/);
  });

  it('depends on the secret key', () => {
    expect(signUpload('a', 0).signature).not.toBe(signUpload('b', 0).signature);
  });
});
