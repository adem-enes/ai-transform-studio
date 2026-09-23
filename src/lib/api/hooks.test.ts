// @vitest-environment jsdom
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransformationStatus, TransformationView } from '@/schemas';
import { useTransformation } from './hooks';
import { POLL_INTERVAL_MS, TIMED_OUT_GRACE_MS } from './polling';

const ID = '65f1c0ffee0000000000abcd';
const NOW = new Date('2026-09-23T12:00:00.000Z');

function view(status: TransformationStatus, completedAt: string | null = null): TransformationView {
  return {
    id: ID,
    uploadId: '65f1c0ffee0000000000dcba',
    kind: 'image',
    status,
    source: {
      url: 'https://res.cloudinary.com/demo/image/upload/v1/source.png',
      mime: 'image/png',
      width: 640,
      height: 480,
      durationSeconds: null,
      frameRate: null,
    },
    output:
      status === 'completed'
        ? {
            url: 'https://res.cloudinary.com/demo/image/upload/v1/out.png',
            width: 640,
            height: 480,
            durationSeconds: null,
          }
        : null,
    error: status === 'timed_out' ? { code: 'WEBHOOK_TIMEOUT', message: 'Timed out.' } : null,
    creditsCharged: 5,
    createdAt: NOW.toISOString(),
    completedAt,
    params: { prompt: 'make it blue', model: 'default', aspect_ratio: 'auto', resolution: '1k' },
  };
}

/** Answers each GET with the next status in `sequence`, repeating the last one. */
function mockServer(sequence: TransformationView[]) {
  let call = 0;
  const fetchMock = vi.fn(async () => {
    const body = sequence[Math.min(call, sequence.length - 1)];
    call += 1;
    return new Response(JSON.stringify({ transformation: body }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderUseTransformation() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useTransformation(ID), { wrapper });
}

async function tick(ms = POLL_INTERVAL_MS) {
  await vi.advanceTimersByTimeAsync(ms);
}

describe('useTransformation', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(NOW);
    focusManager.setFocused(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    focusManager.setFocused(undefined);
  });

  it('polls while the status is active and stops once it is terminal', async () => {
    const fetchMock = mockServer([view('queued'), view('processing'), view('completed', NOW.toISOString())]);
    const { result } = renderUseTransformation();

    await vi.waitFor(() => expect(result.current.data?.status).toBe('queued'));
    await tick();
    expect(result.current.data?.status).toBe('processing');
    await tick();
    expect(result.current.data?.status).toBe('completed');

    const callsAtCompletion = fetchMock.mock.calls.length;
    await tick(POLL_INTERVAL_MS * 5);
    expect(fetchMock).toHaveBeenCalledTimes(callsAtCompletion);
  });

  it.each(['failed', 'completed'] as const)(
    'never polls a transformation that is already %s',
    async (status) => {
      const fetchMock = mockServer([view(status, NOW.toISOString())]);
      const { result } = renderUseTransformation();
      await vi.waitFor(() => expect(result.current.data?.status).toBe(status));
      await tick(POLL_INTERVAL_MS * 4);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps polling a fresh timed_out transformation, since the server may still recover it', async () => {
    const fetchMock = mockServer([
      view('timed_out', NOW.toISOString()),
      view('completed', NOW.toISOString()),
    ]);
    const { result } = renderUseTransformation();
    await vi.waitFor(() => expect(result.current.data?.status).toBe('timed_out'));
    await tick();
    expect(result.current.data?.status).toBe('completed');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops polling a timed_out transformation after the grace period', async () => {
    const timedOutAt = new Date(NOW.getTime() - TIMED_OUT_GRACE_MS - 1).toISOString();
    const fetchMock = mockServer([view('timed_out', timedOutAt)]);
    const { result } = renderUseTransformation();
    await vi.waitFor(() => expect(result.current.data?.status).toBe('timed_out'));
    await tick(POLL_INTERVAL_MS * 4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('pauses polling while the tab is hidden', async () => {
    const fetchMock = mockServer([view('processing')]);
    const { result } = renderUseTransformation();
    await vi.waitFor(() => expect(result.current.data?.status).toBe('processing'));

    focusManager.setFocused(false);
    const callsWhenHidden = fetchMock.mock.calls.length;
    await tick(POLL_INTERVAL_MS * 4);
    expect(fetchMock).toHaveBeenCalledTimes(callsWhenHidden);

    focusManager.setFocused(true);
    await tick();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsWhenHidden);
  });
});
