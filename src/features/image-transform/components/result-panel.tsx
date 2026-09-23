'use client';

import { ImageIcon, RefreshCwIcon, RotateCcwIcon, WandSparklesIcon, WifiOffIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CompareView } from '@/features/transform-core/components/compare-view';
import { MediaFrame, ratioOf } from '@/features/transform-core/components/media-frame';
import { ResultActions } from '@/features/transform-core/components/result-actions';
import { StatusTimeline, stepForStatus } from '@/features/transform-core/components/status-timeline';
import { TransformationError } from '@/features/transform-core/components/transformation-error';
import { truncate } from '@/features/transform-core/lib/format';
import type { SourceMedia } from '@/features/transform-core/lib/source';
import type { ClientErrorCode } from '@/lib/api/errors';
import type { TransformationView } from '@/schemas';

export type PanelState =
  | { kind: 'empty' }
  | { kind: 'submitting'; startedAt: number }
  | { kind: 'loading' }
  | { kind: 'load-error'; code: ClientErrorCode }
  | { kind: 'active'; transformation: TransformationView }
  | { kind: 'completed'; transformation: TransformationView }
  | { kind: 'failed'; transformation: TransformationView }
  | { kind: 'timed_out'; transformation: TransformationView; stillChecking: boolean };

type ResultPanelProps = {
  state: PanelState;
  source: SourceMedia | null;
  /** Width ÷ height the result is expected to have — the chosen ratio, else the source's. */
  resultRatio: number;
  /** A poll failed but earlier data is still shown. */
  connectionProblem: boolean;
  onTryAnotherPrompt: () => void;
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

/**
 * The right-hand panel of the image page: placeholder → progress → result
 * or error. The heading is focusable so the page can move focus to it when
 * the panel appears and when the result arrives.
 */
export function ResultPanel({
  ref: headingRef,
  state,
  source,
  resultRatio,
  connectionProblem,
  onTryAnotherPrompt,
  onStartOver,
  onCheckAgain,
  checkingAgain,
}: ResultPanelProps & { ref?: React.Ref<HTMLHeadingElement> }) {
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

      <PanelBody
        state={state}
        source={source}
        resultRatio={resultRatio}
        onTryAnotherPrompt={onTryAnotherPrompt}
        onStartOver={onStartOver}
        onCheckAgain={onCheckAgain}
        checkingAgain={checkingAgain}
      />
    </section>
  );
}

function PanelBody({
  state,
  source,
  resultRatio,
  onTryAnotherPrompt,
  onStartOver,
  onCheckAgain,
  checkingAgain,
}: Omit<ResultPanelProps, 'connectionProblem'>) {
  const afterActions = (
    <>
      <Button type="button" variant="outline" onClick={onTryAnotherPrompt}>
        <WandSparklesIcon aria-hidden="true" />
        Try another prompt
      </Button>
      <Button type="button" variant="ghost" onClick={onStartOver}>
        <RotateCcwIcon aria-hidden="true" />
        Start over
      </Button>
    </>
  );

  switch (state.kind) {
    case 'empty':
      return (
        <div className="space-y-3">
          <div
            className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm text-muted-foreground"
            style={{ aspectRatio: String(Math.min(Math.max(resultRatio, 0.75), 16 / 9)) }}
          >
            <ImageIcon aria-hidden="true" className="size-8" />
            <p>{source ? 'Describe the change and select Transform.' : 'Upload an image to get started.'}</p>
          </div>
          <p className="text-sm text-muted-foreground">Your result will appear here, next to the original.</p>
        </div>
      );

    case 'submitting':
      return <StatusTimeline step="submitting" kind="image" startedAt={state.startedAt} />;

    case 'loading':
      return (
        <div role="status" className="space-y-3">
          <span className="sr-only">Loading transformation…</span>
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="h-40 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
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
            kind="image"
            startedAt={state.transformation.createdAt}
          />
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              You can leave this page — the result is saved to History when it’s ready.
            </p>
            <Button type="button" variant="outline" onClick={onTryAnotherPrompt}>
              <WandSparklesIcon aria-hidden="true" />
              Start another
            </Button>
          </div>
        </div>
      );

    case 'completed': {
      const { transformation } = state;
      if (!transformation.output || transformation.kind !== 'image') {
        return <TransformationError code="INTERNAL">{afterActions}</TransformationError>;
      }
      return (
        <div className="space-y-4">
          <CompareView
            before={{ url: transformation.source.url, alt: 'Original image' }}
            after={{
              url: transformation.output.url,
              alt: `Result for prompt: ${truncate(transformation.params.prompt, 140)}`,
            }}
            aspectRatio={resultRatio}
          />
          <ResultActions url={transformation.output.url} downloadName={`ai-transform-${transformation.id}`} />
          <div className="flex flex-wrap gap-2 border-t pt-4">{afterActions}</div>
        </div>
      );
    }

    case 'failed':
      return (
        <TransformationError
          code={state.transformation.error?.code ?? 'TRANSFORMATION_FAILED'}
          actions={{ 'edit-params': onTryAnotherPrompt, retry: onTryAnotherPrompt }}
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
          <MediaFrame
            src={state.transformation.source.url}
            alt="Original image"
            aspectRatio={ratioOf(state.transformation.source.width, state.transformation.source.height)}
            sizes="(min-width: 1024px) 480px, 100vw"
            className="max-h-64"
          />
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
