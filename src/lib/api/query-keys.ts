import type { MediaKind } from '@/schemas';

/** Every TanStack Query key the app uses, so invalidation and cache updates cannot drift from the queries. */
export const queryKeys = {
  transformations: {
    all: ['transformations'] as const,
    detail: (id: string) => ['transformations', 'detail', id] as const,
  },
  history: {
    all: ['history'] as const,
    list: (kind: MediaKind | undefined) => ['history', 'list', kind ?? 'all'] as const,
  },
};
