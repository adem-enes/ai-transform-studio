import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';
import type { HistoryResponse, TransformationView } from '@/schemas';
import { queryKeys } from './query-keys';

type HistoryData = InfiniteData<HistoryResponse, string | undefined>;

/** The kind a history list query is filtered to — `'all'` for the unfiltered list. */
function listKind(queryKey: QueryKey): unknown {
  return queryKey[2];
}

/**
 * Writes a fresher copy of one transformation into every cached history
 * list that contains it — the list is never refetched just because one item
 * changed. Lists that do not contain it are returned untouched (same
 * reference), so nothing re-renders.
 */
export function updateHistoryItem(queryClient: QueryClient, item: TransformationView): void {
  queryClient.setQueriesData<HistoryData>({ queryKey: queryKeys.history.all }, (data) =>
    data ? replaceItem(data, item) : data,
  );
}

/** Puts a just-created transformation at the top of every cached history list it belongs in. */
export function prependHistoryItem(queryClient: QueryClient, item: TransformationView): void {
  for (const query of queryClient.getQueryCache().findAll({ queryKey: queryKeys.history.all })) {
    const kind = listKind(query.queryKey);
    if (kind !== 'all' && kind !== item.kind) {
      continue;
    }
    queryClient.setQueryData<HistoryData>(query.queryKey, (data) => {
      if (!data || data.pages.some((page) => page.items.some((existing) => existing.id === item.id))) {
        return data;
      }
      const [first, ...rest] = data.pages;
      return first ? { ...data, pages: [{ ...first, items: [item, ...first.items] }, ...rest] } : data;
    });
  }
}

function replaceItem(data: HistoryData, item: TransformationView): HistoryData {
  let changed = false;
  const pages = data.pages.map((page) => {
    const index = page.items.findIndex((existing) => existing.id === item.id);
    const existing = page.items[index];
    if (index === -1 || !existing || isSameVersion(existing, item)) {
      return page;
    }
    changed = true;
    const items = [...page.items];
    items[index] = item;
    return { ...page, items };
  });
  return changed ? { ...data, pages } : data;
}

function isSameVersion(a: TransformationView, b: TransformationView): boolean {
  return (
    a.status === b.status &&
    a.completedAt === b.completedAt &&
    a.output?.url === b.output?.url &&
    a.error?.code === b.error?.code
  );
}
