'use client';

import { VideoOffIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

type VideoPlayerProps = {
  src: string;
  /** A still frame shown before playback (a Cloudinary poster URL). */
  poster?: string;
  /** Accessible name for the player, e.g. "Uploaded video: clip.mp4". */
  label: string;
  /** Width ÷ height of the frame, reserved up front so nothing shifts when the video loads. */
  aspectRatio: number;
  className?: string;
  ref?: React.Ref<HTMLVideoElement>;
};

/**
 * A native video player in a fixed-ratio frame: controls, muted, inline on
 * phones, and only metadata preloaded. Never autoplays. Falls back to a plain
 * message when the file cannot be played.
 */
export function VideoPlayer({ src, poster, label, aspectRatio, className, ref }: VideoPlayerProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;

  return (
    <div
      className={cn('relative w-full overflow-hidden rounded-lg bg-black', className)}
      style={{ aspectRatio: String(aspectRatio) }}
    >
      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted p-4 text-center text-sm text-muted-foreground">
          <VideoOffIcon aria-hidden="true" className="size-6" />
          <span>Video couldn’t be loaded.</span>
          <span className="sr-only">{label}</span>
        </div>
      ) : (
        <video
          ref={ref}
          src={src}
          poster={poster}
          aria-label={label}
          controls
          muted
          playsInline
          preload="metadata"
          onError={() => setFailedSrc(src)}
          className="absolute inset-0 size-full object-contain"
        />
      )}
    </div>
  );
}
