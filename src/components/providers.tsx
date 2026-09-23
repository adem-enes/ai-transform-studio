'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from '@/components/ui/sonner';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Above zero so data fetched during a server render is not refetched
        // the instant the client hydrates.
        staleTime: 60_000,
      },
    },
  });
}

/**
 * Client-side providers for the whole app. The `QueryClient` lives in state so
 * each browser session gets exactly one, and a server render never shares one
 * between requests.
 */
export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster richColors closeButton />
    </QueryClientProvider>
  );
}
