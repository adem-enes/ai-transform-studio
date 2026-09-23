'use client';

import {
  ImageIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  VideoIcon,
  WandSparklesIcon,
  WifiOffIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { MediaKind, TransformationView } from '@/schemas';
import type { PanelState } from '../lib/panel-state';
import { CostSummary } from './cost-summary';
import { StatusTimeline, stepForStatus } from './status-timeline';
import { TransformationError } from './transformation-error';

/** A finished transformation, with its output guaranteed. */
export type CompletedTransformation = TransformationView & {
  output: NonNullable<TransformationView['output']>;
};

type ResultPanelProps = {
  kind: MediaKind;
  state: PanelState;
  /** Width ÷ height of the empty placeholder — the expected shape of the result. */
  placeholderRatio: number;
  /** The empty placeholder's line, e.g. "Upload an image to get started." */
  emptyMessage: string;
  /** "Try another prompt" / "Try another style". */
  tryAnotherLabel: string;
  /** The pre-submit cost estimate for a submitted job's parameters, shown beside the actual charge. */
  estimateOf: (transformation: TransformationView) => string;
  /** The finished result, followed by `afterActions` (try another / start over). */
  renderCompleted: (
    transformation: CompletedTransformation,
    afterActions: React.ReactNode,
  ) => React.ReactNode;
  /** The source, shown above a timed-out job's explanation. */
  renderTimedOutSource: (transformation: TransformationView) => React.ReactNode;
  /** A poll failed but earlier data is still shown. */
  connectionProblem: boolean;
  onTryAnother: () => void;
  onStartOver: () => void;
  onCheckAgain: () => void;
  checkingAgain: boolean;
};

const HEADINGS: Record<PanelState['kind'], string> = {
  empty: 'Result',
  submitting: 'Working on it',
  loading: 'Loading…',
  'load-error': 'Couldn’t load this transformation',
  active: 'Working on it',
  completed: 'Your result',
  failed: 'Transformation failed',
  timed_out: 'Still waiting',
};

/** What to expect while a job runs, per kind. */
const ACTIVE_NOTES: Record<MediaKind, string> = {
  image: 'You can leave this page — the result is saved to History when it’s ready.',
  video:
    'Video jobs usually take a few minutes. You can leave this page — the result will be in History when it’s ready.',
};

/**
 * The right-hand panel of a transform page: placeholder → progress → result
 * or error. The heading is focusable so the page can move focus to it when
 * the panel appears and when the result arrives. What a finished result looks
 * like is the page's own (`renderCompleted`).
 */
export function ResultPanel({
  ref: headingRef,
  connectionProblem,
  estimateOf,
  state,
  ...props
}: ResultPanelProps & { ref?: React.Ref<HTMLHeadingElement> }) {
  const submitted = 'transformation' in state ? state.transformation : null;
  return (
    <section
      aria-labelledby="result-heading"
      className="min-h-[26rem] scroll-mt-24 space-y-4 rounded-xl border bg-card p-4 sm:p-5"
    >
      <h2
        id="result-heading"
        ref={headingRef}
        tabIndex={-1}
        className="text-lg font-semibold tracking-tight focus:outline-none"
      >
        {HEADINGS[state.kind]}
      </h2>

      {connectionProblem ? (
        <p role="status" className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
          <WifiOffIcon aria-hidden="true" className="size-4 shrink-0" />
          Connection problem — still trying to get the latest status.
        </p>
      ) : null}

      {submitted ? <CostSummary estimate={estimateOf(submitted)} transformation={submitted} /> : null}

      <PanelBody state={state} {...props} />
    </section>
  );
}

function PanelBody({
  kind,
  state,
  placeholderRatio,
  emptyMessage,
  tryAnotherLabel,
  renderCompleted,
  renderTimedOutSource,
  onTryAnother,
  onStartOver,
  onCheckAgain,
  checkingAgain,
}: Omit<ResultPanelProps, 'connectionProblem' | 'estimateOf'>) {
  const afterActions = (
    <>
      <Button type="button" variant="outline" onClick={onTryAnother}>
        <WandSparklesIcon aria-hidden="true" />
        {tryAnotherLabel}
      </Button>
      <Button type="button" variant="ghost" onClick={onStartOver}>
        <RotateCcwIcon aria-hidden="true" />
        Start over
      </Button>
    </>
  );
  const PlaceholderIcon = kind === 'image' ? ImageIcon : VideoIcon;

  switch (state.kind) {
    case 'empty':
      return (
        <div className="space-y-3">
          <div
            className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm text-muted-foreground"
            style={{ aspectRatio: String(Math.min(Math.max(placeholderRatio, 0.75), 16 / 9)) }}
          >
            <PlaceholderIcon aria-hidden="true" className="size-8" />
            <p>{emptyMessage}</p>
          </div>
          <p className="text-sm text-muted-foreground">Your result will appear here, next to the original.</p>
        </div>
      );

    case 'submitting':
      return <StatusTimeline step="submitting" kind={kind} startedAt={state.startedAt} />;

    case 'loading':
      return (
        <div role="status" className="space-y-3">
          <span className="sr-only">Loading transformation…</span>
          <Skeleton className="h-4 w-2/3 rounded" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      );

    case 'load-error':
      return (
        <TransformationError code={state.code} actions={{ retry: onCheckAgain }}>
          <Button type="button" variant="ghost" onClick={onStartOver}>
            <RotateCcwIcon aria-hidden="true" />
            Start over
          </Button>
        </TransformationError>
      );

    case 'active':
      return (
        <div className="space-y-4">
          <StatusTimeline
            step={stepForStatus(state.transformation.status)}
            kind={kind}
            startedAt={state.transformation.createdAt}
          />
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm text-muted-foreground">{ACTIVE_NOTES[kind]}</p>
            <Button type="button" variant="outline" onClick={onTryAnother}>
              <WandSparklesIcon aria-hidden="true" />
              Start another
            </Button>
          </div>
        </div>
      );

    case 'completed': {
      const { transformation } = state;
      const { output } = transformation;
      if (!output || transformation.kind !== kind) {
        return <TransformationError code="INTERNAL">{afterActions}</TransformationError>;
      }
      return renderCompleted({ ...transformation, output }, afterActions);
    }

    case 'failed':
      return (
        <TransformationError
          code={state.transformation.error?.code ?? 'TRANSFORMATION_FAILED'}
          actions={{ 'edit-params': onTryAnother, retry: onTryAnother }}
        >
          <Button type="button" variant="ghost" onClick={onStartOver}>
            <RotateCcwIcon aria-hidden="true" />
            Start over
          </Button>
        </TransformationError>
      );

    case 'timed_out':
      return (
        <div className="space-y-4">
          {renderTimedOutSource(state.transformation)}
          <TransformationError
            code="WEBHOOK_TIMEOUT"
            note={
              state.stillChecking
                ? 'We’re still checking automatically for a couple of minutes.'
                : 'You can check again now, or find it in History later.'
            }
          >
            <Button type="button" variant="outline" onClick={onCheckAgain} disabled={checkingAgain}>
              <RefreshCwIcon
                aria-hidden="true"
                className={checkingAgain ? 'motion-safe:animate-spin' : undefined}
              />
              {checkingAgain ? 'Checking…' : 'Check again'}
            </Button>
            {afterActions}
          </TransformationError>
        </div>
      );
  }
}
