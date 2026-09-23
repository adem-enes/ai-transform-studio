import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-9 w-2/3 max-w-sm" />
      <Skeleton className="h-4 w-full max-w-xl" />
      <Skeleton className="h-4 w-5/6 max-w-lg" />
      <div className="grid gap-4 pt-4 md:grid-cols-3">
        <Skeleton className="h-48 md:col-span-2" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
