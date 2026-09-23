import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'History' };

export default function HistoryPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-3xl font-semibold tracking-tight">History</h1>
      <p className="text-muted-foreground">Your past transformations will appear here.</p>
    </div>
  );
}
