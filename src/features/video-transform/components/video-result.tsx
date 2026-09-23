'use client';

import { PlayIcon } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { CompletedTransformation } from '@/features/transform-core/components/result-panel';
import { VideoPlayer } from '@/features/transform-core/components/video-player';
import { resultRatio } from '@/features/transform-core/lib/result-ratio';
import { videoClipUrl, videoPosterUrl } from '@/lib/media/cloudinary';
import { formatSeconds } from '../lib/clip';

/**
 * The source clip next to its transformation — side by side where the panel
 * is wide enough, stacked otherwise. Both frames take the output's real shape
 * (so neither jumps when it loads). The source is trimmed on Cloudinary to
 * the clip that was sent, so "Play both" starts them on the same frame.
 */
export function VideoResult({ transformation }: { transformation: CompletedTransformation }) {
  const sourceRef = useRef<HTMLVideoElement>(null);
  const outputRef = useRef<HTMLVideoElement>(null);
  if (transformation.kind !== 'video') {
    return null;
  }
  const { source, output, params } = transformation;
  const ratio = resultRatio(transformation);
  const clipUrl = videoClipUrl(source.url, params.start_seconds, params.end_seconds);
  const clipLabel = `${formatSeconds(params.start_seconds)} to ${formatSeconds(params.end_seconds)}`;

  const playBoth = () => {
    for (const video of [sourceRef.current, outputRef.current]) {
      if (video) {
        video.currentTime = 0;
        void video.play().catch(() => undefined);
      }
    }
  };

  return (
    <div className="@container space-y-3">
      <div className="grid gap-3 @sm:grid-cols-2">
        <figure className="space-y-1.5">
          <VideoPlayer
            ref={sourceRef}
            src={clipUrl}
            poster={videoPosterUrl(source.url, params.start_seconds)}
            label={`Original clip, ${clipLabel}`}
            aspectRatio={ratio}
          />
          <figcaption className="text-sm text-muted-foreground">Before · {clipLabel}</figcaption>
        </figure>
        <figure className="space-y-1.5">
          <VideoPlayer
            ref={outputRef}
            src={output.url}
            poster={videoPosterUrl(output.url)}
            label={`Result in the ${params.art_style} style`}
            aspectRatio={ratio}
          />
          <figcaption className="text-sm text-muted-foreground">
            After · {params.art_style}
            {output.width && output.height ? (
              <span className="tabular-nums">
                {' '}
                · {output.width} × {output.height}
              </span>
            ) : null}
          </figcaption>
        </figure>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={playBoth}>
        <PlayIcon aria-hidden="true" />
        Play both
      </Button>
    </div>
  );
}
