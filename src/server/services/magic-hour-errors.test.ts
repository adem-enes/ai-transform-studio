import { describe, expect, it } from 'vitest';
import { mapProviderFailure, providerFailure, providerFailureOf } from './magic-hour-errors';

describe('mapProviderFailure', () => {
  it.each([
    [402, 'insufficient_credits', 'INSUFFICIENT_CREDITS'],
    [402, 'subscription_required', 'PLAN_UPGRADE_REQUIRED'],
    [402, 'plan_upgrade_required', 'PLAN_UPGRADE_REQUIRED'],
    [400, 'invalid_request', 'PROVIDER_REJECTED'],
    [422, 'unprocessable_entity', 'PROVIDER_REJECTED'],
    [404, 'not_found', 'NOT_FOUND'],
    [401, 'unauthorized', 'INTERNAL'],
    [408, undefined, 'PROVIDER_UNAVAILABLE'],
    [429, undefined, 'PROVIDER_UNAVAILABLE'],
    [500, 'internal_server_error', 'PROVIDER_UNAVAILABLE'],
    [503, undefined, 'PROVIDER_UNAVAILABLE'],
    [null, undefined, 'PROVIDER_UNAVAILABLE'],
  ])('HTTP %s / %s → %s', (status, code, expected) => {
    const failure = providerFailure(status, code ? { code, message: 'provider says no' } : null);
    expect(mapProviderFailure(failure).code).toBe(expected);
  });

  it('keeps the provider detail out of the client-facing message', () => {
    const error = mapProviderFailure(
      providerFailure(422, { code: 'unprocessable_entity', message: 'secret detail' }),
    );
    expect(error.message).not.toContain('secret detail');
    expect(JSON.stringify(error)).not.toContain('secret detail');
    expect(providerFailureOf(error)).toEqual({
      status: 422,
      code: 'unprocessable_entity',
      message: 'secret detail',
    });
  });

  it('tolerates an unexpected body', () => {
    expect(providerFailure(500, '<html>Bad gateway</html>')).toEqual({
      status: 500,
      code: null,
      message: null,
    });
  });
});
