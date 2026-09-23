import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HistoryView } from '@/features/history';

export const metadata: Metadata = { title: 'History' };

export default function HistoryPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">History</h1>
        <p className="max-w-2xl text-muted-foreground">
          Transformations made in this browser, newest first. Running ones update on their own.
        </p>
      </div>
      {/* The filter lives in `?kind=`, read with useSearchParams, which needs a Suspense boundary. */}
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <HistoryView />
      </Suspense>
    </div>
  );
}
