import {
  ArrowRightIcon,
  ImageIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  UploadIcon,
  VideoIcon,
} from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const linkCardClass =
  'group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

const STEPS = [
  { icon: UploadIcon, title: 'Upload', text: 'Choose, drop or paste an image from your device.' },
  {
    icon: SlidersHorizontalIcon,
    title: 'Choose parameters',
    text: 'Describe the change and pick a model and size.',
  },
  {
    icon: SparklesIcon,
    title: 'Get your result',
    text: 'Compare it with the original, then download or share it.',
  },
] as const;

export default function HomePage() {
  return (
    <div className="space-y-12">
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Transform your media with AI</h1>
          <p className="max-w-2xl text-muted-foreground">
            Pick a starting point. Image transformations are the fastest way to try it out.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/image" className={cn(linkCardClass, 'md:col-span-2')}>
            <Card className="h-full bg-primary text-primary-foreground ring-0 transition-shadow group-hover:shadow-lg">
              <CardHeader className="gap-3">
                <Badge variant="secondary" className="w-fit">
                  Recommended
                </Badge>
                <ImageIcon aria-hidden="true" className="size-10" />
                <h2 className="text-2xl font-semibold sm:text-3xl">Image to Image</h2>
              </CardHeader>
              <CardContent className="flex items-end justify-between gap-4">
                <p>Upload an image and edit it with a text prompt.</p>
                <span className="inline-flex shrink-0 items-center gap-1.5 font-medium">
                  Start
                  <ArrowRightIcon
                    aria-hidden="true"
                    className="size-5 transition-transform motion-safe:group-hover:translate-x-1"
                  />
                </span>
              </CardContent>
            </Card>
          </Link>

          <Link href="/video" className={linkCardClass}>
            <Card className="h-full transition-shadow group-hover:shadow-lg">
              <CardHeader className="gap-3">
                <Badge variant="outline" className="w-fit">
                  Coming soon
                </Badge>
                <VideoIcon aria-hidden="true" className="size-8 text-muted-foreground" />
                <h2 className="text-xl font-semibold">Video to Video</h2>
              </CardHeader>
              <CardContent className="flex items-end justify-between gap-4">
                <CardDescription>Apply an AI style to a short video clip.</CardDescription>
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium">
                  Learn more
                  <ArrowRightIcon
                    aria-hidden="true"
                    className="size-4 transition-transform motion-safe:group-hover:translate-x-1"
                  />
                </span>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      <section aria-labelledby="how-it-works" className="space-y-4">
        <h2 id="how-it-works" className="text-xl font-semibold tracking-tight">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, index) => (
            <li key={title} className="flex gap-3 rounded-xl border p-4">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
              >
                <Icon className="size-4" />
              </span>
              <div className="space-y-1">
                <h3 className="font-medium">
                  <span className="sr-only">Step {index + 1}: </span>
                  {title}
                </h3>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
