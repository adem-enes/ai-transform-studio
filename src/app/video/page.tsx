import { ArrowRightIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Video to Video' };

export default function VideoPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Video to Video</h1>
      <p className="text-muted-foreground">
        Restyling short video clips with AI is coming soon. In the meantime, try transforming an image.
      </p>
      <Button asChild size="lg">
        <Link href="/image">
          Go to Image to Image
          <ArrowRightIcon aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
