'use client';

import { ImageIcon, PlayIcon, VideoIcon } from 'lucide-react';
import { useRef } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { MediaFrame } from '@/features/transform-core/components/media-frame';
import { StatusBadge, statusLabel } from '@/features/transform-core/components/status-badge';
import {
  formatDuration,
  formatRelativeTime,
  formatTimestamp,
  truncate,
} from '@/features/transform-core/lib/format';
import { useTransformation } from '@/lib/api/hooks';
import type { TransformationView } from '@/schemas';
import { keyParams, promptOf, thumbnailUrl, videoDurationOf } from '../lib/describe';
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
  const titleRef = useRef<HTMLHeadingElement>(null);
  const transformation = data ?? item;
  const { kind, status, output } = transformation;
  const prompt = promptOf(transformation);
  const duration = videoDurationOf(transformation);
  const noun = kind === 'image' ? 'image' : 'video';
  const alt = output
    ? prompt
      ? `Result for prompt: ${truncate(prompt, 120)}`
      : `Result ${noun}`
    : `Source ${noun}`;
  const title = prompt
    ? truncate(prompt, 60)
    : transformation.kind === 'video'
      ? `${transformation.params.art_style} style`
      : 'Image transformation';

  return (
    <Sheet>
      <article className="relative flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-shadow focus-within:ring-3 focus-within:ring-ring/50 hover:shadow-md">
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
          {/* Solid backing: some badge variants are translucent tints, unreadable over a photo. */}
          <span className="absolute top-2 left-2 rounded-4xl bg-background shadow-sm">
            <StatusBadge status={status} />
          </span>
          {duration === null ? null : (
            <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-4xl bg-black/75 px-2 py-0.5 text-xs font-medium text-white tabular-nums">
              <PlayIcon aria-hidden="true" className="size-3 fill-current" />
              <span className="sr-only">Video, </span>
              {formatDuration(duration)}
            </span>
          )}
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
      <SheetContent
        side="right"
        className="w-full gap-0 sm:max-w-lg"
        onOpenAutoFocus={(event) => {
          // Radix would focus the first button (Copy); start at the title instead.
          event.preventDefault();
          titleRef.current?.focus();
        }}
      >
        <HistoryDetails transformation={transformation} titleRef={titleRef} />
      </SheetContent>
    </Sheet>
  );
}

export function HistoryCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card" aria-hidden="true">
      <Skeleton className="aspect-[4/3] rounded-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-3 w-1/2 rounded" />
        <Skeleton className="h-4 w-4/5 rounded" />
        <Skeleton className="h-3 w-1/4 rounded" />
      </div>
    </div>
  );
}
