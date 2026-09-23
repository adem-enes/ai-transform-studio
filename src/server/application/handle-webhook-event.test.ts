import { describe, expect, it } from 'vitest';
import { AppError } from '@/server/errors';
import type { WebhookEvent } from '@/server/webhooks/event';
import { handleWebhookEvent } from './handle-webhook-event';
import { createFakeDeps, type FakeDeps, seedSubmitted } from './testing';

const DOWNLOAD_URL = 'https://videos.magichour.ai/proj_1/output.png';

function event(
  type: string,
  overrides: Partial<WebhookEvent['payload']> = {},
  projectId = 'proj_1',
): WebhookEvent {
  const status = type.endsWith('.completed') ? 'complete' : type.endsWith('.errored') ? 'error' : 'rendering';
  return {
    type,
    payload: {
      id: projectId,
      status,
      downloads: type.endsWith('.completed')
        ? [{ url: DOWNLOAD_URL, expires_at: '2026-01-02T00:00:00Z' }]
        : [],
      error: type.endsWith('.errored') ? { code: 'render_failed', message: 'GPU fell over' } : null,
      ...overrides,
    },
  };
}

function statusOf(deps: FakeDeps, id: Parameters<FakeDeps['transformations']['get']>[0]) {
  return deps.transformations.get(id)?.status;
}

describe('handleWebhookEvent', () => {
  it('completes a job whose completed event arrives before started, then ignores the late started', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps);

    await expect(handleWebhookEvent(event('image.completed'), deps)).resolves.toEqual({
      result: 'applied',
      status: 'completed',
    });
    const completed = deps.transformations.get(job._id);
    expect(completed?.output?.secureUrl).toMatch(/^https:\/\/res\.cloudinary\.com\//);
    expect(deps.storage.calls[0]).toMatchObject({
      url: DOWNLOAD_URL,
      options: { folder: 'outputs', kind: 'image', publicId: job._id.toHexString() },
    });

    await expect(handleWebhookEvent(event('image.started'), deps)).resolves.toMatchObject({ result: 'noop' });
    expect(statusOf(deps, job._id)).toBe('completed');
  });

  it('moves queued to processing on started', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps);
    await expect(handleWebhookEvent(event('image.started'), deps)).resolves.toEqual({
      result: 'applied',
      status: 'processing',
    });
    expect(statusOf(deps, job._id)).toBe('processing');
  });

  it('treats a duplicate completed as a no-op without copying again', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { status: 'processing' });

    await handleWebhookEvent(event('image.completed'), deps);
    await expect(handleWebhookEvent(event('image.completed'), deps)).resolves.toEqual({
      result: 'noop',
      status: 'completed',
    });
    expect(deps.storage.calls).toHaveLength(1);
    expect(statusOf(deps, job._id)).toBe('completed');
  });

  it('keeps a completed job completed when an errored event arrives afterwards', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { status: 'processing' });

    await handleWebhookEvent(event('image.completed'), deps);
    await expect(handleWebhookEvent(event('image.errored'), deps)).resolves.toMatchObject({ result: 'noop' });
    const doc = deps.transformations.get(job._id);
    expect(doc?.status).toBe('completed');
    expect(doc?.error).toBeNull();
  });

  it('fails a job on errored, keeping the provider error internal', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { status: 'processing' });

    await handleWebhookEvent(event('image.errored', { credits_charged: 0 }), deps);
    const doc = deps.transformations.get(job._id);
    expect(doc?.status).toBe('failed');
    expect(doc?.error).toEqual({ code: 'TRANSFORMATION_FAILED', message: 'The transformation failed.' });
    expect(doc?.provider.rawError).toEqual({ code: 'render_failed', message: 'GPU fell over' });
    expect(doc?.provider.creditsCharged).toBe(0);
  });

  it('throws a retryable error for an unknown project', async () => {
    const deps = createFakeDeps();
    const error = await handleWebhookEvent(event('image.completed', {}, 'proj_unknown'), deps).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ retryable: true });
  });

  it('leaves the job finalizing and throws retryably when the Cloudinary copy fails; the next attempt completes', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { status: 'processing' });

    deps.storage.fail = true;
    const error = await handleWebhookEvent(event('image.completed'), deps).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'STORAGE_FAILED', retryable: true });
    expect(statusOf(deps, job._id)).toBe('finalizing');

    deps.storage.fail = false;
    await expect(handleWebhookEvent(event('image.completed'), deps)).resolves.toEqual({
      result: 'applied',
      status: 'completed',
    });
    expect(statusOf(deps, job._id)).toBe('completed');
  });

  it('fetches the download URL from the API when the completed payload has none', async () => {
    const deps = createFakeDeps();
    seedSubmitted(deps);
    deps.provider.status = async (_kind, projectId) => ({
      projectId,
      status: 'complete',
      creditsCharged: 5,
      downloads: [{ url: 'https://videos.magichour.ai/proj_1/fetched.png', expiresAt: '' }],
      error: null,
    });

    await expect(
      handleWebhookEvent(event('image.completed', { downloads: [] }), deps),
    ).resolves.toMatchObject({
      status: 'completed',
    });
    expect(deps.storage.calls[0]?.url).toBe('https://videos.magichour.ai/proj_1/fetched.png');
  });

  it('ignores event types it does not handle', async () => {
    const deps = createFakeDeps();
    await expect(handleWebhookEvent(event('audio.completed'), deps)).resolves.toEqual({ result: 'ignored' });
  });
});
