import { describe, expect, it } from 'vitest';
import { assertSameOrigin } from './origin';

const APP = 'https://ai-transform-studio.vercel.app';

function post(origin?: string): Request {
  return new Request(`${APP}/api/transform`, {
    method: 'POST',
    headers: origin === undefined ? {} : { origin },
  });
}

describe('assertSameOrigin', () => {
  it('accepts the app’s own origin', () => {
    expect(() => assertSameOrigin(post(APP), APP)).not.toThrow();
  });

  it('accepts a request without an Origin header', () => {
    expect(() => assertSameOrigin(post(), APP)).not.toThrow();
  });

  it.each([
    'https://evil.example',
    'null',
    'http://ai-transform-studio.vercel.app',
    'https://ai-transform-studio.vercel.app.evil.example',
  ])('rejects %s with 403 FORBIDDEN_ORIGIN', (origin) => {
    expect(() => assertSameOrigin(post(origin), APP)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN_ORIGIN', httpStatus: 403 }),
    );
  });
});
