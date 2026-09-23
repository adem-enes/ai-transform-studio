import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@/server/errors';
import type { WebhookEvent } from '@/server/webhooks/event';
import { handleWebhookEvent } from './handle-webhook-event';
import { reconcileTransformation } from './reconcile-transformation';
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
  it('answers a completed event at finalizing and copies the result only once deferred work runs', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { status: 'processing' });

    await expect(handleWebhookEvent(event('image.completed'), deps)).resolves.toEqual({
      result: 'applied',
      status: 'finalizing',
    });
    expect(deps.storage.calls).toHaveLength(0);
    expect(statusOf(deps, job._id)).toBe('finalizing');

    await deps.deferred.runAll();
    const completed = deps.transformations.get(job._id);
    expect(completed?.status).toBe('completed');
    expect(completed?.output?.secureUrl).toMatch(/^https:\/\/res\.cloudinary\.com\//);
    expect(deps.storage.calls[0]).toMatchObject({
      url: DOWNLOAD_URL,
      options: { folder: 'outputs', kind: 'image', publicId: job._id.toHexString() },
    });
  });

  it('completes a job whose completed event arrives before started, then ignores the late started', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps);

    await handleWebhookEvent(event('image.completed'), deps);
    await deps.deferred.runAll();
    expect(statusOf(deps, job._id)).toBe('completed');

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
    expect(deps.deferred.tasks).toHaveLength(0);
  });

  it('treats duplicate completed events as no-ops without copying again', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { status: 'processing' });

    await handleWebhookEvent(event('image.completed'), deps);
    // A redelivery while the first copy is still pending…
    await expect(handleWebhookEvent(event('image.completed'), deps)).resolves.toEqual({
      result: 'noop',
      status: 'finalizing',
    });
    await deps.deferred.runAll();
    // …and one after it finished.
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
    await deps.deferred.runAll();
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

  it('records the final credits figure from the completed payload', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { kind: 'video', status: 'processing' });

    await handleWebhookEvent(event('video.completed', { credits_charged: 38 }), deps);
    await deps.deferred.runAll();
    expect(deps.transformations.get(job._id)?.provider.creditsCharged).toBe(38);
  });

  it('recovers a timed_out job when a late completed event arrives', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { status: 'timed_out' });

    await expect(handleWebhookEvent(event('image.completed'), deps)).resolves.toEqual({
      result: 'applied',
      status: 'finalizing',
    });
    expect(deps.transformations.get(job._id)?.error).toBeNull();
    await deps.deferred.runAll();
    const doc = deps.transformations.get(job._id);
    expect(doc?.status).toBe('completed');
    expect(doc?.output?.secureUrl).toMatch(/^https:\/\/res\.cloudinary\.com\//);
  });

  it('fails a timed_out job when a late errored event arrives', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { status: 'timed_out' });

    await expect(handleWebhookEvent(event('image.errored'), deps)).resolves.toMatchObject({
      result: 'applied',
      status: 'failed',
    });
    expect(deps.transformations.get(job._id)?.error?.code).toBe('TRANSFORMATION_FAILED');
  });

  it('ignores a late started event for a timed_out job', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { status: 'timed_out' });
    await expect(handleWebhookEvent(event('image.started'), deps)).resolves.toMatchObject({ result: 'noop' });
    expect(statusOf(deps, job._id)).toBe('timed_out');
  });

  it('throws a retryable error for an unknown project', async () => {
    const deps = createFakeDeps();
    const error = await handleWebhookEvent(event('image.completed', {}, 'proj_unknown'), deps).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ retryable: true });
  });

  it('leaves the job finalizing when the background copy fails, and a later reconcile completes it', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { status: 'processing' });
    const logError = vi.spyOn(deps.logger, 'error');

    deps.storage.fail = true;
    await expect(handleWebhookEvent(event('image.completed'), deps)).resolves.toMatchObject({
      result: 'applied',
    });
    await expect(deps.deferred.runAll()).resolves.toBeUndefined();
    expect(statusOf(deps, job._id)).toBe('finalizing');
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('Background finalization failed'),
      expect.objectContaining({ transformationId: job._id }),
    );

    deps.storage.fail = false;
    deps.provider.status = async (_kind, projectId) => ({
      projectId,
      status: 'complete',
      creditsCharged: 5,
      downloads: [{ url: DOWNLOAD_URL, expiresAt: '' }],
      error: null,
    });
    const finalizing = deps.transformations.get(job._id);
    if (!finalizing) {
      throw new Error('seeded job missing');
    }
    const reconciled = await reconcileTransformation(finalizing, deps.clock.now(), deps);
    expect(reconciled.status).toBe('completed');
    expect(statusOf(deps, job._id)).toBe('completed');
  });

  it('fetches the download URL from the API in the background when the completed payload has none', async () => {
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
    ).resolves.toMatchObject({ status: 'finalizing' });
    expect(deps.provider.statusCalls).toBe(0);
    await deps.deferred.runAll();
    expect(deps.storage.calls[0]?.url).toBe('https://videos.magichour.ai/proj_1/fetched.png');
  });

  it('leaves the job finalizing when the background download lookup fails', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps);
    deps.provider.status = async () => {
      throw new Error('Magic Hour is down');
    };

    await handleWebhookEvent(event('image.completed', { downloads: [] }), deps);
    await deps.deferred.runAll();
    expect(statusOf(deps, job._id)).toBe('finalizing');
    expect(deps.storage.calls).toHaveLength(0);
  });

  it('ignores event types it does not handle', async () => {
    const deps = createFakeDeps();
    await expect(handleWebhookEvent(event('audio.completed'), deps)).resolves.toEqual({ result: 'ignored' });
  });
});
