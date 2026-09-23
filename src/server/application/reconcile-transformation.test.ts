import { describe, expect, it } from 'vitest';
import type { MediaKind } from '@/schemas';
import type { ProjectStatus } from '@/server/services';
import { WORKFLOW } from './config';
import { reconcileTransformation } from './reconcile-transformation';
import { createFakeDeps, type FakeDeps, seedSubmitted } from './testing';

function providerSays(
  deps: FakeDeps,
  status: ProjectStatus['status'],
  downloads: ProjectStatus['downloads'] = [],
) {
  deps.provider.status = async (_kind, projectId) => ({
    projectId,
    status,
    creditsCharged: 5,
    downloads,
    error: status === 'error' ? { code: 'render_failed', message: 'GPU fell over' } : null,
  });
}

describe('reconcileTransformation', () => {
  it('checks the provider at most once per interval', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { status: 'processing' });

    await reconcileTransformation(job, deps.clock.now(), deps);
    await reconcileTransformation(job, deps.clock.now(), deps);
    expect(deps.provider.statusCalls).toBe(1);

    deps.clock.advance(WORKFLOW.reconcileIntervalMs - 1);
    await reconcileTransformation(job, deps.clock.now(), deps);
    expect(deps.provider.statusCalls).toBe(1);

    deps.clock.advance(1);
    await reconcileTransformation(job, deps.clock.now(), deps);
    expect(deps.provider.statusCalls).toBe(2);
  });

  it('lets only one of several concurrent polls reach the provider', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { status: 'processing' });
    const now = deps.clock.now();
    await Promise.all([1, 2, 3, 4].map(() => reconcileTransformation(job, now, deps)));
    expect(deps.provider.statusCalls).toBe(1);
  });

  it('finalizes a job the provider reports complete', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { status: 'processing' });
    providerSays(deps, 'complete', [{ url: 'https://videos.magichour.ai/proj_1/out.png', expiresAt: '' }]);

    const result = await reconcileTransformation(job, deps.clock.now(), deps);
    expect(result.status).toBe('completed');
    expect(result.output?.publicId).toContain(job._id.toHexString());
  });

  it('fails a job the provider reports canceled, saying so', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { status: 'processing' });
    providerSays(deps, 'canceled');

    const result = await reconcileTransformation(job, deps.clock.now(), deps);
    expect(result.status).toBe('failed');
    expect(result.error).toEqual({
      code: 'TRANSFORMATION_FAILED',
      message: 'The transformation was cancelled.',
    });
  });

  it('fails a job the provider reports errored', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { status: 'queued' });
    providerSays(deps, 'error');

    const result = await reconcileTransformation(job, deps.clock.now(), deps);
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('TRANSFORMATION_FAILED');
    expect(result.provider.rawError).toEqual({ code: 'render_failed', message: 'GPU fell over' });
  });

  it('moves queued to processing when the provider is rendering', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { status: 'queued' });
    providerSays(deps, 'rendering');
    await expect(reconcileTransformation(job, deps.clock.now(), deps)).resolves.toMatchObject({
      status: 'processing',
    });
  });

  describe.each<[MediaKind, number]>([
    ['image', WORKFLOW.timeoutMs.image],
    ['video', WORKFLOW.timeoutMs.video],
  ])('timeout (%s)', (kind, limitMs) => {
    it('keeps a job running at exactly the limit', async () => {
      const deps = createFakeDeps();
      const job = seedSubmitted(deps, { kind, status: 'processing' });
      deps.clock.advance(limitMs);
      await expect(reconcileTransformation(job, deps.clock.now(), deps)).resolves.toMatchObject({
        status: 'processing',
      });
    });

    it('times out a job just past the limit', async () => {
      const deps = createFakeDeps();
      const job = seedSubmitted(deps, { kind, status: 'processing' });
      deps.clock.advance(limitMs + 1);
      const result = await reconcileTransformation(job, deps.clock.now(), deps);
      expect(result.status).toBe('timed_out');
      expect(result.error?.code).toBe('WEBHOOK_TIMEOUT');
    });
  });

  it('times out an overdue job even when the provider check fails', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { status: 'processing' });
    deps.provider.status = async () => {
      throw new Error('network down');
    };
    deps.clock.advance(WORKFLOW.timeoutMs.image + 1);
    await expect(reconcileTransformation(job, deps.clock.now(), deps)).resolves.toMatchObject({
      status: 'timed_out',
    });
  });

  it('never throws: a provider failure returns the current state', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { status: 'processing' });
    deps.provider.status = async () => {
      throw new Error('network down');
    };
    await expect(reconcileTransformation(job, deps.clock.now(), deps)).resolves.toMatchObject({
      status: 'processing',
    });
  });

  it('fails a job stuck in queued without a project id past the limit, without calling the provider', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { status: 'queued', projectId: null });

    deps.clock.advance(WORKFLOW.submissionStuckMs);
    await expect(reconcileTransformation(job, deps.clock.now(), deps)).resolves.toMatchObject({
      status: 'queued',
    });

    deps.clock.advance(1);
    const result = await reconcileTransformation(job, deps.clock.now(), deps);
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('INTERNAL');
    expect(deps.provider.statusCalls).toBe(0);
  });

  it('leaves terminal jobs alone', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { status: 'completed' });
    await reconcileTransformation(job, deps.clock.now(), deps);
    expect(deps.provider.statusCalls).toBe(0);
  });
});
