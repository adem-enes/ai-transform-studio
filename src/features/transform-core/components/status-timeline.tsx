'use client';

import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MediaKind, TransformationStatus } from '@/schemas';
import { useNow } from '../hooks/use-now';
import { formatElapsed } from '../lib/format';

type TimelineStep = 'submitting' | 'queued' | 'processing' | 'finalizing' | 'done';

const STEPS: readonly { step: TimelineStep; label: string }[] = [
  { step: 'submitting', label: 'Submitting' },
  { step: 'queued', label: 'Queued' },
  { step: 'processing', label: 'Processing' },
  { step: 'finalizing', label: 'Finalizing' },
  { step: 'done', label: 'Done' },
];

/** The timeline step for a transformation status. Failures are not steps — they replace the timeline. */
export function stepForStatus(status: TransformationStatus): TimelineStep {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'processing':
      return 'processing';
    case 'finalizing':
      return 'finalizing';
    default:
      return 'done';
  }
}

function describeStep(step: TimelineStep, kind: MediaKind): string {
  switch (step) {
    case 'submitting':
      return `Sending your ${kind} to the AI service…`;
    case 'queued':
      return kind === 'image'
        ? 'Waiting for the AI service to start. This usually takes a few seconds.'
        : 'Waiting for the AI service to start. Video jobs can queue for a little while.';
    case 'processing':
      return kind === 'image'
        ? 'The AI is transforming your image. Most images take under a minute.'
        : 'The AI is restyling your video, frame by frame. Video jobs usually take a few minutes.';
    case 'finalizing':
      return kind === 'image'
        ? 'Almost there — saving your result.'
        : 'Almost there — saving your video. Larger clips take a moment to copy.';
    case 'done':
      return 'Your result is ready.';
  }
}

type StatusTimelineProps = {
  step: TimelineStep;
  kind: MediaKind;
  /** When the work began (ISO timestamp or epoch ms), for the elapsed-time counter. */
  startedAt: string | number;
  className?: string;
};

/**
 * Where a transformation is, as a list of steps. Deliberately shows no
 * percentage — the provider reports none, so any number would be invented.
 * Only the status line is a live region, so screen readers hear each change
 * of step once, not every tick of the timer.
 */
export function StatusTimeline({ step, kind, startedAt, className }: StatusTimelineProps) {
  const currentIndex = STEPS.findIndex((item) => item.step === step);
  const running = step !== 'done';
  const now = useNow(1000, running);
  const startedMs = typeof startedAt === 'number' ? startedAt : Date.parse(startedAt);
  const elapsed = formatElapsed((now - startedMs) / 1000);
  const description = describeStep(step, kind);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-baseline justify-between gap-4">
        <p aria-live="polite" className="text-sm font-medium">
          {description}
        </p>
        {running ? (
          <p className="shrink-0 text-sm text-muted-foreground tabular-nums">
            <span className="sr-only">Elapsed time: </span>
            {elapsed}
          </p>
        ) : null}
      </div>

      {running ? (
        <div
          role="progressbar"
          aria-label="Transformation in progress"
          className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted"
        >
          {/* Reduced motion: a static segment instead of the sweep. */}
          <div className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-primary motion-safe:animate-indeterminate" />
        </div>
      ) : null}

      <ol className="space-y-2" aria-label="Progress">
        {STEPS.map(({ step: itemStep, label }, index) => {
          const state =
            index < currentIndex || step === 'done'
              ? 'complete'
              : index === currentIndex
                ? 'current'
                : 'upcoming';
          return (
            <li
              key={itemStep}
              aria-current={state === 'current' ? 'step' : undefined}
              className={cn(
                'flex items-center gap-3 text-sm',
                state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground',
                state === 'current' && 'font-medium',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full border',
                  state === 'complete' && 'border-primary bg-primary text-primary-foreground',
                  state === 'current' && 'border-primary',
                  state === 'upcoming' && 'border-border',
                )}
              >
                {state === 'complete' ? <CheckIcon className="size-3" /> : null}
                {state === 'current' ? (
                  <span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" />
                ) : null}
              </span>
              <span>
                {label}
                <span className="sr-only">
                  {state === 'complete' ? ' (done)' : state === 'current' ? ' (in progress)' : ''}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
