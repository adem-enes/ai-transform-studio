'use client';

import { ImageOffIcon } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';

type MediaFrameProps = {
  src: string;
  alt: string;
  /** Width ÷ height of the frame. Reserved up front, so nothing shifts when the image arrives. */
  aspectRatio: number;
  /** The `sizes` attribute: how wide the frame renders, so the loader picks a sensible width. */
  sizes: string;
  fit?: 'contain' | 'cover';
  preload?: boolean;
  /** Local previews (`blob:` URLs) skip the loader. */
  unoptimized?: boolean;
  className?: string;
  children?: React.ReactNode;
};

/**
 * An image in a fixed-ratio frame with a muted placeholder while it loads
 * and a plain fallback if it cannot (e.g. a storage URL that no longer works).
 */
export function MediaFrame({
  src,
  alt,
  aspectRatio,
  sizes,
  fit = 'contain',
  preload,
  unoptimized,
  className,
  children,
}: MediaFrameProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;

  return (
    <div
      className={cn('relative w-full overflow-hidden rounded-lg bg-muted', className)}
      style={{ aspectRatio: String(aspectRatio) }}
    >
      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
          <ImageOffIcon aria-hidden="true" className="size-6" />
          <span>Image couldn’t be loaded.</span>
          <span className="sr-only">{alt}</span>
        </div>
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          preload={preload}
          unoptimized={unoptimized}
          onError={() => setFailedSrc(src)}
          className={fit === 'contain' ? 'object-contain' : 'object-cover'}
        />
      )}
      {children}
    </div>
  );
}

/** Width ÷ height, or `fallback` when either dimension is unknown. */
export function ratioOf(
  width: number | null | undefined,
  height: number | null | undefined,
  fallback = 1,
): number {
  return width && height ? width / height : fallback;
}
