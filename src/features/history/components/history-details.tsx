'use client';

import { ExternalLinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { MediaFrame, ratioOf } from '@/features/transform-core/components/media-frame';
import { CopyLinkButton, ResultActions } from '@/features/transform-core/components/result-actions';
import { StatusBadge } from '@/features/transform-core/components/status-badge';
import { TransformationError } from '@/features/transform-core/components/transformation-error';
import { formatTimestamp } from '@/features/transform-core/lib/format';
import { resultRatio } from '@/features/transform-core/lib/result-ratio';
import { shouldPoll } from '@/lib/api/polling';
import type { TransformationView } from '@/schemas';
import { parameterRows, promptOf, thumbnailUrl } from '../lib/describe';

/** Everything recorded about one transformation: status, source and generated URLs, every parameter, timestamps. */
export function HistoryDetails({
  transformation,
  titleRef,
}: {
  transformation: TransformationView;
  /** The sheet focuses its title on open, so screen readers start from the top. */
  titleRef?: React.Ref<HTMLHeadingElement>;
}) {
  const { kind, status, source, output, error } = transformation;
  const prompt = promptOf(transformation);
  const noun = kind === 'image' ? 'image' : 'video';

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <SheetTitle ref={titleRef} tabIndex={-1} className="focus:outline-none">
          Transformation details
        </SheetTitle>
        <SheetDescription>
          {kind === 'image' ? 'Image to Image' : 'Video to Video'} ·{' '}
          {formatTimestamp(transformation.createdAt)}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-6">
        <MediaFrame
          src={thumbnailUrl(transformation)}
          alt={output ? (prompt ? `Result for prompt: ${prompt}` : `Result ${noun}`) : `Source ${noun}`}
          aspectRatio={output ? resultRatio(transformation) : ratioOf(source.width, source.height, 4 / 3)}
          sizes="(min-width: 640px) 480px, 100vw"
          className="max-h-72"
        />

        <section aria-labelledby="details-status" className="space-y-3">
          <h3 id="details-status" className="text-sm font-semibold">
            Status
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            {shouldPoll(transformation, Date.now()) ? (
              <span className="text-sm text-muted-foreground">Updates automatically</span>
            ) : null}
          </div>
          {error && (status === 'failed' || status === 'timed_out') ? (
            <TransformationError code={error.code} showHistoryLink={false} />
          ) : null}
          {output ? (
            <ResultActions url={output.url} downloadName={`ai-transform-${transformation.id}`} />
          ) : null}
        </section>

        <section aria-labelledby="details-urls" className="space-y-4">
          <h3 id="details-urls" className="text-sm font-semibold">
            Links
          </h3>
          <UrlRow label="Source URL" url={source.url} />
          {output ? (
            <UrlRow label="Generated URL" url={output.url} />
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-medium">Generated URL</p>
              <p className="text-sm text-muted-foreground">
                {status === 'failed' ? 'None — the transformation failed.' : 'Not available yet.'}
              </p>
            </div>
          )}
        </section>

        <section aria-labelledby="details-params" className="space-y-3">
          <h3 id="details-params" className="text-sm font-semibold">
            Transformation parameters
          </h3>
          <dl className="divide-y rounded-lg border text-sm">
            {parameterRows(transformation).map(({ label, value }) => (
              <div key={label} className="grid gap-1 px-3 py-2 sm:grid-cols-[8rem_1fr] sm:gap-3">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="break-words whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="details-times" className="space-y-3">
          <h3 id="details-times" className="text-sm font-semibold">
            Timestamps
          </h3>
          <dl className="divide-y rounded-lg border text-sm">
            <div className="grid gap-1 px-3 py-2 sm:grid-cols-[8rem_1fr] sm:gap-3">
              <dt className="text-muted-foreground">Created</dt>
              <dd>
                <time dateTime={transformation.createdAt}>{formatTimestamp(transformation.createdAt)}</time>
              </dd>
            </div>
            <div className="grid gap-1 px-3 py-2 sm:grid-cols-[8rem_1fr] sm:gap-3">
              <dt className="text-muted-foreground">{status === 'completed' ? 'Completed' : 'Finished'}</dt>
              <dd>
                {transformation.completedAt ? (
                  <time dateTime={transformation.completedAt}>
                    {formatTimestamp(transformation.completedAt)}
                  </time>
                ) : (
                  'Not yet'
                )}
              </dd>
            </div>
            <div className="grid gap-1 px-3 py-2 sm:grid-cols-[8rem_1fr] sm:gap-3">
              <dt className="text-muted-foreground">ID</dt>
              <dd className="font-mono text-xs break-all">{transformation.id}</dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  );
}

function UrlRow({ label, url }: { label: string; url: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <p className="rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all">{url}</p>
      <div className="flex flex-wrap gap-2">
        <CopyLinkButton
          url={url}
          size="sm"
          label={
            <>
              Copy<span className="sr-only"> {label}</span>
            </>
          }
        />
        <Button asChild variant="outline" size="sm">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLinkIcon aria-hidden="true" />
            Open<span className="sr-only"> {label} in a new tab</span>
          </a>
        </Button>
      </div>
    </div>
  );
}
