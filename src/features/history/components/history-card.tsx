'use client';

import { ImageIcon, VideoIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { MediaFrame } from '@/features/transform-core/components/media-frame';
import { StatusBadge, statusLabel } from '@/features/transform-core/components/status-badge';
import { formatRelativeTime, formatTimestamp, truncate } from '@/features/transform-core/lib/format';
import { useTransformation } from '@/lib/api/hooks';
import type { TransformationView } from '@/schemas';
import { keyParams, promptOf, thumbnailUrl } from '../lib/describe';
import { HistoryDetails } from './history-details';

type HistoryCardProps = {
  item: TransformationView;
  /** Shared clock for the relative times, so every card ticks together. */
  now: number;
  preload?: boolean;
};

/**
 * One history entry. An active entry polls its own status (settled ones
 * don't), so the grid updates live without refetching the list.
 */
export function HistoryCard({ item, now, preload }: HistoryCardProps) {
  const { data } = useTransformation(item.id, { initialData: item });
  const transformation = data ?? item;
  const { kind, status, output } = transformation;
  const prompt = promptOf(transformation);
  const noun = kind === 'image' ? 'image' : 'video';
  const alt = output
    ? prompt
      ? `Result for prompt: ${truncate(prompt, 120)}`
      : `Result ${noun}`
    : `Source ${noun}`;
  const title = prompt ? truncate(prompt, 60) : `${kind === 'image' ? 'Image' : 'Video'} transformation`;

  return (
    <Sheet>
      <article className="relative flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow focus-within:ring-3 focus-within:ring-ring/50 hover:shadow-md">
        <div className="relative">
          <MediaFrame
            src={thumbnailUrl(transformation)}
            alt={alt}
            aspectRatio={4 / 3}
            fit="cover"
            sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
            preload={preload}
            className="rounded-none"
          />
          <StatusBadge status={status} className="absolute top-2 left-2 shadow-sm" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {kind === 'image' ? (
              <ImageIcon aria-hidden="true" className="size-3.5" />
            ) : (
              <VideoIcon aria-hidden="true" className="size-3.5" />
            )}
            <span>{kind === 'image' ? 'Image' : 'Video'}</span>
            {keyParams(transformation).map((part) => (
              <span key={part} className="truncate">
                · {part}
              </span>
            ))}
          </p>
          <h3 className="line-clamp-2 text-sm font-medium break-words">
            <SheetTrigger className="text-left after:absolute after:inset-0 focus-visible:outline-none">
              {title}
              <span className="sr-only">, {statusLabel(status)}. View details</span>
            </SheetTrigger>
          </h3>
          <p className="mt-auto text-xs text-muted-foreground">
            <time dateTime={transformation.createdAt} title={formatTimestamp(transformation.createdAt)}>
              {formatRelativeTime(transformation.createdAt, now)}
            </time>
          </p>
        </div>
      </article>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
        <HistoryDetails transformation={transformation} />
      </SheetContent>
    </Sheet>
  );
}

export function HistoryCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card" aria-hidden="true">
      <div className="aspect-[4/3] animate-pulse bg-muted motion-reduce:animate-none" />
      <div className="space-y-2 p-3">
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="h-3 w-1/4 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
    </div>
  );
}
