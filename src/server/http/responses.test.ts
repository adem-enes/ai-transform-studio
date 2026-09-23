import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from '@/server/errors';
import { silentLogger } from '@/server/logger';
import { parseInput, readJson, withErrorHandling } from './responses';

function route(thrown: unknown) {
  const logger = { ...silentLogger, error: vi.fn() };
  const handler = withErrorHandling(async () => {
    throw thrown;
  }, logger);
  return { handler, logger };
}

describe('withErrorHandling', () => {
  it('passes a successful response through', async () => {
    const handler = withErrorHandling(async () => Response.json({ ok: true }, { status: 201 }));
    const response = await handler();
    expect(response.status).toBe(201);
  });

  it('maps an AppError to its status and code', async () => {
    const { handler, logger } = route(new AppError('TOO_MANY_ACTIVE_JOBS'));
    const response = await handler();
    expect(response.status).toBe(429);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: {
        code: 'TOO_MANY_ACTIVE_JOBS',
        message: 'You already have transformations in progress. Wait for one to finish.',
      },
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('includes field-level details from input validation', async () => {
    const schema = z.object({ kind: z.enum(['image', 'video']), limit: z.number().max(50) });
    const handler = withErrorHandling(async () => {
      parseInput(schema, { kind: 'audio', limit: 99 });
      return new Response();
    });
    const response = await handler();
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(body.error.details)).toEqual(['kind', 'limit']);
  });

  it('answers malformed JSON with 400', async () => {
    const handler = withErrorHandling(async (request: Request) => {
      await readJson(request);
      return new Response();
    });
    const response = await handler(new Request('http://x/', { method: 'POST', body: '{nope' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('VALIDATION_FAILED');
  });

  it('maps anything else to a generic 500 and logs it', async () => {
    const { handler, logger } = route(new Error('connection string mongodb://user:hunter2@host'));
    const response = await handler();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: 'INTERNAL', message: 'Something went wrong on our side.' },
    });
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('treats a stray ZodError (e.g. a drifted stored document) as a server fault, not a bad request', async () => {
    const { handler } = route(z.string().safeParse(1).error);
    const response = await handler();
    expect(response.status).toBe(500);
  });

  it('logs AppErrors that are server faults', async () => {
    const { handler, logger } = route(new AppError('STORAGE_FAILED'));
    const response = await handler();
    expect(response.status).toBe(502);
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
