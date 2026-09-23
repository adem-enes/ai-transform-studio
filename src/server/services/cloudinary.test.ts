import { describe, expect, it } from 'vitest';
import { cloudinaryFailure } from './cloudinary';

describe('cloudinaryFailure', () => {
  it('keeps only message and status from an admin API rejection, dropping credentials', () => {
    const rejection = {
      request_options: { hostname: 'api.cloudinary.com', auth: 'KEY:SECRET' },
      error: { message: 'unknown api_key', http_code: 401 },
    };
    const failure = cloudinaryFailure(rejection);
    expect(failure).toEqual({ httpCode: 401, message: 'unknown api_key' });
    expect(JSON.stringify(failure)).not.toContain('SECRET');
  });

  it('reads an upload API rejection', () => {
    expect(cloudinaryFailure({ message: 'Resource not found', http_code: 404, name: 'Error' })).toEqual({
      httpCode: 404,
      message: 'Resource not found',
    });
  });

  it('handles Errors and unrecognized values', () => {
    expect(cloudinaryFailure(new Error('socket hang up'))).toEqual({
      httpCode: null,
      message: 'socket hang up',
    });
    expect(cloudinaryFailure('boom')).toEqual({ httpCode: null, message: 'Unrecognized Cloudinary error' });
  });
});
