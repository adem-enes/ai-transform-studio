import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl space-y-4 text-center">
      {/* not-found.tsx cannot export `metadata`; React 19 hoists this into <head>. */}
      <title>Page not found · AI Transform Studio</title>
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">The page you are looking for does not exist or has moved.</p>
      <Button asChild>
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
