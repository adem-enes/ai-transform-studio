'use client';

import { PlayIcon, SquareIcon } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FieldDescription, FieldError, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  CLIP_STEP,
  type Clip,
  type ClipBounds,
  clipLength,
  formatSeconds,
  moveClip,
  timelineEnd,
} from '../lib/clip';

type ClipSelectorProps = {
  clip: Clip;
  bounds: ClipBounds;
  onChange: (clip: Clip) => void;
  /** The source's player, which "Preview clip" drives. `null` while there is no source. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  disabled?: boolean;
  error?: string;
};

/**
 * Which part of the video to transform: a two-thumb slider (arrow keys move a
 * thumb by 0.1 s, Page Up/Down by 1 s) plus two numeric inputs for exact
 * values. Every change goes through `moveClip`, so the selection is always
 * valid: dragging past the maximum length pulls the other end along.
 */
export function ClipSelector({ clip, bounds, onChange, videoRef, disabled, error }: ClipSelectorProps) {
  const hintId = useId();
  const lengthId = useId();
  const errorId = useId();
  const end = timelineEnd(bounds);
  const length = clipLength(clip);

  const onSliderChange = useCallback(
    ([start, stop]: number[]) => {
      if (start === undefined || stop === undefined) {
        return;
      }
      // Radix reports both thumbs; the one that differs is the one that moved.
      const changed = start !== clip.start ? 'start' : 'end';
      onChange(moveClip(clip, changed, changed === 'start' ? start : stop, bounds));
    },
    [clip, bounds, onChange],
  );

  return (
    <FieldSet data-invalid={Boolean(error)}>
      <FieldLegend variant="label">Clip</FieldLegend>
      <FieldDescription id={hintId}>
        Choose up to {formatSeconds(bounds.maxLength)} to transform. Drag the handles, use the arrow keys, or
        type exact times.
      </FieldDescription>

      <div className="px-2.5 py-3">
        <Slider
          min={0}
          max={end}
          step={CLIP_STEP}
          minStepsBetweenThumbs={1}
          value={[clip.start, clip.end]}
          onValueChange={onSliderChange}
          disabled={disabled}
          thumbLabels={['Clip start', 'Clip end']}
          thumbValueText={(value) => `${formatSeconds(value).replace(' s', ' seconds')}`}
          aria-describedby={hintId}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <TimeInput
          label="Start"
          value={clip.start}
          max={end}
          disabled={disabled}
          describedBy={error ? `${lengthId} ${errorId}` : lengthId}
          onCommit={(value) => onChange(moveClip(clip, 'start', value, bounds))}
        />
        <TimeInput
          label="End"
          value={clip.end}
          max={end}
          disabled={disabled}
          invalid={Boolean(error)}
          describedBy={error ? `${lengthId} ${errorId}` : lengthId}
          onCommit={(value) => onChange(moveClip(clip, 'end', value, bounds))}
        />
        <PreviewClipButton clip={clip} videoRef={videoRef} disabled={disabled} />
      </div>

      <p id={lengthId} aria-live="polite" className="text-sm tabular-nums">
        <span className="font-medium">{formatSeconds(length)}</span>
        <span className="text-muted-foreground">
          {' '}
          of {bounds.duration === null ? 'the video' : formatSeconds(bounds.duration)} selected
        </span>
      </p>
      {error ? <FieldError id={errorId} errors={[{ message: error }]} /> : null}
    </FieldSet>
  );
}

/**
 * A seconds input that commits on blur, Enter, or a spinner/arrow step — not
 * on every keystroke, so typing "12" does not first move the clip to 1 s.
 */
function TimeInput({
  label,
  value,
  max,
  disabled,
  invalid,
  describedBy,
  onCommit,
}: {
  label: string;
  value: number;
  max: number;
  disabled?: boolean;
  invalid?: boolean;
  describedBy: string;
  onCommit: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (text: string) => {
    setDraft(null);
    const parsed = Number.parseFloat(text.replace(',', '.'));
    if (Number.isFinite(parsed)) {
      onCommit(parsed);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label} (seconds)</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        max={max}
        step={CLIP_STEP}
        value={draft ?? String(value)}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          // Spinner buttons and arrow keys fire no text input type; commit those at once.
          const inputType = (event.nativeEvent as InputEvent).inputType;
          if (inputType === undefined) {
            commit(event.target.value);
          } else {
            setDraft(event.target.value);
          }
        }}
        onBlur={(event) => {
          if (draft !== null) {
            commit(event.target.value);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            // Commit instead of submitting the form mid-edit.
            event.preventDefault();
            commit(event.currentTarget.value);
          } else if (event.key === 'Escape' && draft !== null) {
            setDraft(null);
          }
        }}
        className="h-10 tabular-nums"
      />
    </div>
  );
}

/**
 * Plays the source from the clip's start and pauses at its end. Only ever on
 * request — nothing autoplays. Pressing it again (or pausing the player) stops.
 */
function PreviewClipButton({
  clip,
  videoRef,
  disabled,
}: {
  clip: Clip;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  disabled?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setPlaying(false);
  }, []);

  // A changed clip or an unmount ends the preview.
  useEffect(() => stop, [stop]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: restart only when the clip itself changes.
  useEffect(() => {
    if (stopRef.current) {
      stop();
    }
  }, [clip.start, clip.end]);

  const start = async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    stop();
    let frame = 0;
    // Checked every animation frame: `timeupdate` fires only ~4 times a second and would overshoot the end.
    const watch = () => {
      if (video.currentTime >= clip.end || video.ended) {
        video.pause();
        return;
      }
      frame = requestAnimationFrame(watch);
    };
    const onPause = () => {
      cancelAnimationFrame(frame);
      stopRef.current = null;
      setPlaying(false);
    };
    video.addEventListener('pause', onPause, { once: true });
    stopRef.current = () => {
      video.removeEventListener('pause', onPause);
      cancelAnimationFrame(frame);
      video.pause();
    };
    video.currentTime = clip.start;
    setPlaying(true);
    try {
      await video.play();
      frame = requestAnimationFrame(watch);
    } catch {
      stop();
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="col-span-2 h-10 sm:col-span-1"
      disabled={disabled}
      aria-pressed={playing}
      onClick={() => (playing ? stop() : void start())}
    >
      {playing ? <SquareIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}
      {playing ? 'Stop preview' : 'Preview clip'}
    </Button>
  );
}
