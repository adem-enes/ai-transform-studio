import { ArrowRightIcon, ImageIcon, VideoIcon } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const linkCardClass =
  'group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export default function HomePage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Transform your media with AI</h1>
        <p className="max-w-2xl text-muted-foreground">
          Pick a starting point. Image transformations are the fastest way to try it out.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/image" className={cn(linkCardClass, 'md:col-span-2')}>
          <Card className="h-full bg-primary text-primary-foreground transition-shadow group-hover:shadow-lg">
            <CardHeader className="gap-3">
              <Badge variant="secondary" className="w-fit">
                Recommended
              </Badge>
              <ImageIcon aria-hidden="true" className="size-10" />
              <h2 className="text-2xl font-semibold sm:text-3xl">Image to Image</h2>
            </CardHeader>
            <CardContent className="flex items-end justify-between gap-4">
              <p className="text-primary-foreground/80">Upload an image and restyle it with an AI prompt.</p>
              <ArrowRightIcon
                aria-hidden="true"
                className="size-6 shrink-0 transition-transform group-hover:translate-x-1"
              />
            </CardContent>
          </Card>
        </Link>

        <Link href="/video" className={linkCardClass}>
          <Card className="h-full transition-shadow group-hover:shadow-lg">
            <CardHeader className="gap-3">
              <VideoIcon aria-hidden="true" className="size-8 text-muted-foreground" />
              <h2 className="text-xl font-semibold">Video to Video</h2>
            </CardHeader>
            <CardContent className="flex items-end justify-between gap-4">
              <CardDescription>Apply an AI style to a short video clip.</CardDescription>
              <ArrowRightIcon
                aria-hidden="true"
                className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1"
              />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
