import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { MediaKind, TransformationView, TransformRequest } from '@/schemas';
import { createTransformation, getTransformation, listHistory } from './endpoints';
import { isApiError } from './errors';
import { prependHistoryItem, updateHistoryItem } from './history-cache';
import { POLL_INTERVAL_MS, shouldPoll } from './polling';
import { queryKeys } from './query-keys';

/**
 * One transformation, polled while it can still change.
 *
 * - Every `POLL_INTERVAL_MS` while the status is non-terminal, and for a
 *   grace period after a `timed_out` (the server may still recover it).
 * - Paused while the tab is hidden (`refetchIntervalInBackground: false`);
 *   refetched on return.
 * - Every newer copy is written into the cached history lists, so History
 *   updates without refetching.
 *
 * `id: null` disables the query. `initialData` seeds it (e.g. from a history page).
 */
export function useTransformation(
  id: string | null,
  { initialData }: { initialData?: TransformationView } = {},
) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.transformations.detail(id ?? ''),
    queryFn: ({ signal }) => getTransformation(id as string, signal),
    enabled: id !== null,
    initialData,
    // Settled data never goes stale; anything that may still change is refetched on mount.
    staleTime: ({ state }) =>
      state.data && !shouldPoll(state.data, Date.now()) ? Number.POSITIVE_INFINITY : 0,
    refetchInterval: ({ state }) =>
      state.data && shouldPoll(state.data, Date.now()) ? POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    // A missing transformation stays missing; anything else gets a couple of quiet retries.
    retry: (failureCount, error) => !(isApiError(error) && error.code === 'NOT_FOUND') && failureCount < 2,
  });

  const data = query.data;
  useEffect(() => {
    if (data) {
      updateHistoryItem(queryClient, data);
    }
  }, [queryClient, data]);

  return query;
}

/** The caller's history, newest first, one page per "Load more". */
export function useHistory({ kind }: { kind?: MediaKind }) {
  return useInfiniteQuery({
    queryKey: queryKeys.history.list(kind),
    queryFn: ({ pageParam, signal }) => listHistory({ kind, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/**
 * Starts a transformation. On success the result seeds the detail query
 * (so polling starts from it) and is prepended to cached history lists.
 * Never retried: the server submits to a paid API that has no idempotency key.
 */
export function useCreateTransformation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TransformRequest) => createTransformation(input),
    retry: false,
    onSuccess: (transformation) => {
      queryClient.setQueryData(queryKeys.transformations.detail(transformation.id), transformation);
      prependHistoryItem(queryClient, transformation);
    },
  });
}
