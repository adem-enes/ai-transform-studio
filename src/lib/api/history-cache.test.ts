import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { HistoryResponse, TransformationView } from '@/schemas';
import { prependHistoryItem, updateHistoryItem } from './history-cache';
import { queryKeys } from './query-keys';

function item(
  id: string,
  status: TransformationView['status'],
  kind: 'image' | 'video' = 'image',
): TransformationView {
  const base = {
    id,
    uploadId: '65f1c0ffee0000000000dcba',
    status,
    source: {
      url: 'https://res.cloudinary.com/demo/image/upload/s.png',
      mime: 'image/png',
      width: 1,
      height: 1,
      durationSeconds: null,
    },
    output: null,
    error: null,
    createdAt: '2026-09-23T12:00:00.000Z',
    completedAt: null,
  };
  return kind === 'image'
    ? { ...base, kind, params: { prompt: 'x', model: 'default', aspect_ratio: 'auto', resolution: '1k' } }
    : {
        ...base,
        kind,
        params: {
          start_seconds: 0,
          end_seconds: 2,
          art_style: 'Clay',
          fps_resolution: 'HALF',
          model: 'default',
          version: 'default',
          prompt_type: 'default',
          prompt: null,
        },
      };
}

const A = 'a'.repeat(24);
const B = 'b'.repeat(24);

function seed(client: QueryClient, kind: 'image' | 'video' | undefined, items: TransformationView[]) {
  client.setQueryData(queryKeys.history.list(kind), {
    pages: [{ items, nextCursor: null } satisfies HistoryResponse],
    pageParams: [undefined],
  });
}

function itemsOf(client: QueryClient, kind: 'image' | 'video' | undefined) {
  return client
    .getQueryData<{ pages: HistoryResponse[] }>(queryKeys.history.list(kind))
    ?.pages.flatMap((page) => page.items);
}

describe('history cache', () => {
  it('replaces a changed item in every list that holds it', () => {
    const client = new QueryClient();
    seed(client, undefined, [item(A, 'processing'), item(B, 'completed')]);
    seed(client, 'image', [item(A, 'processing')]);

    updateHistoryItem(client, item(A, 'completed'));
    expect(itemsOf(client, undefined)?.map((i) => i.status)).toEqual(['completed', 'completed']);
    expect(itemsOf(client, 'image')?.[0]?.status).toBe('completed');
  });

  it('leaves lists untouched (same reference) when nothing changed', () => {
    const client = new QueryClient();
    seed(client, undefined, [item(A, 'processing')]);
    const before = client.getQueryData(queryKeys.history.list(undefined));
    updateHistoryItem(client, item(A, 'processing'));
    updateHistoryItem(client, item(B, 'completed'));
    expect(client.getQueryData(queryKeys.history.list(undefined))).toBe(before);
  });

  it('prepends a new item to the lists it belongs in only', () => {
    const client = new QueryClient();
    seed(client, undefined, [item(B, 'completed')]);
    seed(client, 'video', []);
    prependHistoryItem(client, item(A, 'queued'));
    prependHistoryItem(client, item(A, 'queued'));
    expect(itemsOf(client, undefined)?.map((i) => i.id)).toEqual([A, B]);
    expect(itemsOf(client, 'video')).toEqual([]);
  });
});
