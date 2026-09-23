import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@/server/errors';
import { silentLogger } from '@/server/logger';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER } from '@/server/webhooks/verify-signature';
import { createWebhookHandler, MAX_WEBHOOK_BODY_BYTES } from './webhook-handler';

const SECRET = 'whsec_test';
const NOW_MS = 1_790_000_000_000;
const TIMESTAMP = String(Math.floor(NOW_MS / 1000));

function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(`${TIMESTAMP}.${body}`).digest('hex');
}

function request(body: string, { signature = sign(body), headers = {} as Record<string, string> } = {}) {
  return new Request('http://localhost/api/webhook', {
    method: 'POST',
    body,
    headers: { [SIGNATURE_HEADER]: signature, [TIMESTAMP_HEADER]: TIMESTAMP, ...headers },
  });
}

function setup(handle = vi.fn(async () => ({ result: 'applied' as const, status: 'processing' as const }))) {
  const handler = createWebhookHandler({
    secret: () => SECRET,
    nowMs: () => NOW_MS,
    handle,
    logger: silentLogger,
  });
  return { handler, handle };
}

const STARTED = JSON.stringify({ type: 'image.started', payload: { id: 'proj_1', status: 'rendering' } });

describe('POST /api/webhook', () => {
  it('handles a correctly signed event with 200', async () => {
    const { handler, handle } = setup();
    const response = await handler(request(STARTED));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, result: 'applied', status: 'processing' });
    expect(handle).toHaveBeenCalledWith(expect.objectContaining({ type: 'image.started' }));
  });

  it('rejects a bad signature with 401 and never handles the event', async () => {
    const { handler, handle } = setup();
    const response = await handler(request(STARTED, { signature: sign(STARTED, 'wrong-secret') }));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('INVALID_SIGNATURE');
    expect(handle).not.toHaveBeenCalled();
  });

  it('rejects a body over 1 MB with 413', async () => {
    const { handler, handle } = setup();
    const huge = JSON.stringify({ type: 'image.started', padding: 'x'.repeat(MAX_WEBHOOK_BODY_BYTES) });
    const response = await handler(request(huge));
    expect(response.status).toBe(413);
    expect(handle).not.toHaveBeenCalled();
  });

  it('rejects an oversized declared Content-Length before reading the body', async () => {
    const { handler } = setup();
    const response = await handler(
      request(STARTED, { headers: { 'content-length': String(MAX_WEBHOOK_BODY_BYTES + 1) } }),
    );
    expect(response.status).toBe(413);
  });

  it('acknowledges an unknown event type with 200 without handling it', async () => {
    const { handler, handle } = setup();
    const body = JSON.stringify({ type: 'audio.completed', payload: { id: 'a1' } });
    const response = await handler(request(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, result: 'ignored' });
    expect(handle).not.toHaveBeenCalled();
  });

  it('answers a retryable failure with 503 so Magic Hour redelivers', async () => {
    const { handler } = setup(
      vi.fn(async () => {
        throw new AppError('NOT_FOUND', { retryable: true });
      }),
    );
    const response = await handler(request(STARTED));
    expect(response.status).toBe(503);
  });

  it('rejects a malformed handled event with 400', async () => {
    const { handler, handle } = setup();
    const body = JSON.stringify({ type: 'image.completed', payload: { status: 'complete' } });
    const response = await handler(request(body));
    expect(response.status).toBe(400);
    expect(handle).not.toHaveBeenCalled();
  });
});
