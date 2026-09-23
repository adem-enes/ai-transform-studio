'use client';

import { Loader2Icon, RefreshCwIcon, SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ClientErrorCode } from '@/lib/api/errors';
import type { MediaKind } from '@/schemas';
import type { ErrorAction } from '../lib/error-presentation';
import { TransformationError } from './transformation-error';

type SubmitBarProps = {
  kind: MediaKind;
  /** Short cost wording: "from 5 credits", "~240 credits". */
  costLabel: string;
  /** Extra line under the cost, e.g. how it is worked out. */
  costNote?: React.ReactNode;
  submitError: ClientErrorCode | null;
  submitErrorRef: React.Ref<HTMLDivElement>;
  errorActions: Partial<Record<Exclude<ErrorAction, 'check-history' | 'none'>, () => void>>;
  hasSource: boolean;
  busy: boolean;
  locked: boolean;
  /** A job is running: say why the settings are locked. */
  active: boolean;
  /** A finished result is on screen: submitting again starts a new job. */
  rerun: boolean;
};

/**
 * The foot of a transform form: cost, the submit error (focusable, so the
 * page can move focus to it), and the submit button.
 *
 * While a result is shown the button reads "Transform again", with a line
 * saying that this is a new job and what it costs — the form stays editable,
 * so it is a fresh submission, not a retry of the one shown.
 */
export function SubmitBar({
  kind,
  costLabel,
  costNote,
  submitError,
  submitErrorRef,
  errorActions,
  hasSource,
  busy,
  locked,
  active,
  rerun,
}: SubmitBarProps) {
  const noun = kind === 'image' ? 'image' : 'video';
  const hintId = `submit-hint-${kind}`;
  return (
    <div className="space-y-3 border-t pt-6">
      <div className="space-y-1">
        <p className="text-sm">
          <span className="text-muted-foreground">Estimated cost: </span>
          <span className="font-medium">{costLabel}</span>
        </p>
        {costNote ? <p className="text-xs text-muted-foreground">{costNote}</p> : null}
      </div>
      {submitError ? (
        <div ref={submitErrorRef} tabIndex={-1} className="scroll-mt-24 focus:outline-none">
          <TransformationError code={submitError} actions={errorActions} />
        </div>
      ) : null}
      <Button
        type="submit"
        size="lg"
        className="h-11 w-full sm:w-auto sm:px-6"
        disabled={!hasSource || locked}
        aria-describedby={!hasSource || rerun ? hintId : undefined}
      >
        {busy ? (
          <>
            <Loader2Icon aria-hidden="true" className="motion-safe:animate-spin" />
            Starting…
          </>
        ) : rerun ? (
          <>
            <RefreshCwIcon aria-hidden="true" />
            Transform again
          </>
        ) : (
          <>
            <SparklesIcon aria-hidden="true" />
            Transform {noun}
          </>
        )}
      </Button>
      {!hasSource ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          Upload {noun === 'image' ? 'an image' : 'a video'} first.
        </p>
      ) : rerun && !busy ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          Starts a new job · {costLabel}
        </p>
      ) : null}
      {active ? (
        <p className="text-sm text-muted-foreground">Settings are locked while this transformation runs.</p>
      ) : null}
    </div>
  );
}
