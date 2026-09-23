import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ImageTransformView } from '@/features/image-transform';

export const metadata: Metadata = { title: 'Image to Image' };

export default function ImagePage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Image to Image</h1>
        <p className="max-w-2xl text-muted-foreground">
          Upload an image, describe the change you want, and get an AI-edited version in about a minute.
        </p>
      </div>
      {/* The view reads `?t=` with useSearchParams, which needs a Suspense boundary to prerender the rest. */}
      <Suspense fallback={<ImagePageFallback />}>
        <ImageTransformView />
      </Suspense>
    </div>
  );
}

function ImagePageFallback() {
  return (
    <div role="status" className="grid gap-8 lg:grid-cols-2">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-96 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
