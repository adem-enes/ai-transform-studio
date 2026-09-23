import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { VideoTransformView } from '@/features/video-transform';
import { MEDIA_LIMITS } from '@/schemas';

export const metadata: Metadata = { title: 'Video to Video' };

export default function VideoPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Video to Video</h1>
        <p className="max-w-2xl text-muted-foreground">
          Upload a short video, pick up to {MEDIA_LIMITS.video.maxClipSeconds} seconds of it and an art style,
          and get a restyled clip. Video jobs usually take a few minutes.
        </p>
      </div>
      {/* The view reads `?t=` with useSearchParams, which needs a Suspense boundary to prerender the rest. */}
      <Suspense fallback={<VideoPageFallback />}>
        <VideoTransformView />
      </Suspense>
    </div>
  );
}

function VideoPageFallback() {
  return (
    <div role="status" className="grid gap-8 lg:grid-cols-2">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-96 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
