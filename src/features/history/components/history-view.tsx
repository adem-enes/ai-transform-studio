'use client';

import { HistoryIcon, Loader2Icon } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { TransformationError } from '@/features/transform-core/components/transformation-error';
import { useNow } from '@/features/transform-core/hooks/use-now';
import { errorCodeOf } from '@/lib/api/errors';
import { useHistory } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';
import { type MediaKind, mediaKind } from '@/schemas';
import { HistoryCard, HistoryCardSkeleton } from './history-card';

const FILTERS: readonly { kind: MediaKind | undefined; label: string }[] = [
  { kind: undefined, label: 'All' },
  { kind: 'image', label: 'Image' },
  { kind: 'video', label: 'Video' },
];

const GRID = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';

/** The history page: a filter kept in the URL (`?kind=`), a card grid and "Load more". */
export function HistoryView() {
  const searchParams = useSearchParams();
  const parsedKind = mediaKind.safeParse(searchParams.get('kind'));
  const kind = parsedKind.success ? parsedKind.data : undefined;
  const history = useHistory({ kind });
  const now = useNow(60_000);

  const items = history.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-6">
      <nav aria-label="Filter by type">
        <ul className="inline-flex rounded-lg border bg-muted p-1">
          {FILTERS.map((filter) => {
            const current = filter.kind === kind;
            return (
              <li key={filter.label}>
                <Link
                  href={filter.kind ? `/history?kind=${filter.kind}` : '/history'}
                  replace
                  scroll={false}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-8 min-w-16 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    current
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {filter.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {history.isPending ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading your history…</span>
          <div className={GRID}>
            {Array.from({ length: 6 }, (_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
              <HistoryCardSkeleton key={index} />
            ))}
          </div>
        </div>
      ) : history.isError && items.length === 0 ? (
        <div className="max-w-xl">
          <TransformationError
            code={errorCodeOf(history.error)}
            actions={{ retry: () => void history.refetch() }}
          />
        </div>
      ) : items.length === 0 ? (
        <EmptyState kind={kind} />
      ) : (
        <>
          <p className="sr-only" aria-live="polite">
            Showing {items.length} {items.length === 1 ? 'transformation' : 'transformations'}.
          </p>
          <ul className={GRID}>
            {items.map((item, index) => (
              <li key={item.id}>
                <HistoryCard item={item} now={now} preload={index < 3} />
              </li>
            ))}
          </ul>

          {history.isFetchNextPageError ? (
            <div className="max-w-xl">
              <TransformationError
                code={errorCodeOf(history.error)}
                actions={{ retry: () => void history.fetchNextPage() }}
              />
            </div>
          ) : null}

          {history.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => void history.fetchNextPage()}
                disabled={history.isFetchingNextPage}
              >
                {history.isFetchingNextPage ? (
                  <>
                    <Loader2Icon aria-hidden="true" className="motion-safe:animate-spin" />
                    Loading…
                  </>
                ) : (
                  'Load more'
                )}
              </Button>
            </div>
          ) : items.length > 0 ? (
            <p className="text-center text-sm text-muted-foreground">That’s everything.</p>
          ) : null}
        </>
      )}
    </div>
  );
}

function EmptyState({ kind }: { kind: MediaKind | undefined }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed px-6 py-12 text-center">
      <HistoryIcon aria-hidden="true" className="size-10 text-muted-foreground" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">
          {kind === 'video'
            ? 'No video transformations yet'
            : kind === 'image'
              ? 'No image transformations yet'
              : 'No transformations yet'}
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Everything you transform in this browser shows up here, with its settings and results.
        </p>
      </div>
      <Button asChild size="lg">
        {kind === 'video' ? (
          <Link href="/video">Transform a video</Link>
        ) : (
          <Link href="/image">Transform an image</Link>
        )}
      </Button>
    </div>
  );
}
