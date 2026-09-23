'use client';

import { SplitIcon } from 'lucide-react';
import Image from 'next/image';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MediaFrame } from './media-frame';

type CompareImage = { url: string; alt: string };

type CompareViewProps = {
  before: CompareImage;
  after: CompareImage;
  /** Width ÷ height of both frames — the result's ratio where known, so the result is never letterboxed twice. */
  aspectRatio: number;
};

const FRAME_SIZES = '(min-width: 1024px) 480px, (min-width: 640px) 50vw, 100vw';

/**
 * Before and after, side by side where there is room (stacked on narrow
 * containers), with an optional slider overlay. The slider is a native range
 * input, so it works with arrow keys, Home/End and assistive technology.
 */
export function CompareView({ before, after, aspectRatio }: CompareViewProps) {
  const [sliderMode, setSliderMode] = useState(false);
  const [position, setPosition] = useState(50);
  const sliderId = useId();
  const hintId = useId();

  return (
    <div className="@container space-y-3">
      {sliderMode ? (
        <div className="space-y-3">
          <div
            className="relative w-full overflow-hidden rounded-lg bg-muted"
            style={{ aspectRatio: String(aspectRatio) }}
          >
            <Image src={before.url} alt={before.alt} fill sizes={FRAME_SIZES} className="object-contain" />
            <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
              <Image src={after.url} alt={after.alt} fill sizes={FRAME_SIZES} className="object-contain" />
            </div>
            <div
              aria-hidden="true"
              className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-background shadow-[0_0_0_1px_var(--color-foreground)]"
              style={{ left: `${position}%` }}
            />
            <span
              aria-hidden="true"
              className="absolute top-2 left-2 rounded bg-background/90 px-1.5 py-0.5 text-xs font-medium"
            >
              Before
            </span>
            <span
              aria-hidden="true"
              className="absolute top-2 right-2 rounded bg-background/90 px-1.5 py-0.5 text-xs font-medium"
            >
              After
            </span>
          </div>
          <div className="space-y-1">
            <label htmlFor={sliderId} className="text-sm font-medium">
              Comparison position
            </label>
            <input
              id={sliderId}
              type="range"
              min={0}
              max={100}
              step={1}
              value={position}
              onChange={(event) => setPosition(Number(event.target.value))}
              aria-describedby={hintId}
              aria-valuetext={`${position}% original, ${100 - position}% result`}
              className="block w-full accent-primary"
            />
            <p id={hintId} className="text-xs text-muted-foreground">
              Original on the left, result on the right. Use the arrow keys or drag to move the divider.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 @md:grid-cols-2">
          <figure className="space-y-1.5">
            <MediaFrame src={before.url} alt={before.alt} aspectRatio={aspectRatio} sizes={FRAME_SIZES} />
            <figcaption className="text-sm text-muted-foreground">Before</figcaption>
          </figure>
          <figure className="space-y-1.5">
            <MediaFrame
              src={after.url}
              alt={after.alt}
              aspectRatio={aspectRatio}
              sizes={FRAME_SIZES}
              preload
            />
            <figcaption className="text-sm text-muted-foreground">After</figcaption>
          </figure>
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-pressed={sliderMode}
        onClick={() => setSliderMode((on) => !on)}
      >
        <SplitIcon aria-hidden="true" />
        Compare with slider
      </Button>
    </div>
  );
}
