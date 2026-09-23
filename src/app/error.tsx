'use client';

import { AlertCircleIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <Alert variant="destructive">
        <AlertCircleIcon aria-hidden="true" />
        <AlertTitle>This page failed to load.</AlertTitle>
        <AlertDescription>
          {error.digest ? `Reference: ${error.digest}` : 'Please try again in a moment.'}
        </AlertDescription>
      </Alert>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
