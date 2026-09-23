'use client';

import { AlertCircleIcon, CoinsIcon } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { ClientErrorCode } from '@/lib/api/errors';
import { cn } from '@/lib/utils';
import {
  CREDITS_SPENT_NOTE,
  ERROR_ACTION_LABELS,
  type ErrorAction,
  getErrorPresentation,
  mayHaveSpentCredits,
} from '../lib/error-presentation';

type ActionHandlers = Partial<Record<Exclude<ErrorAction, 'check-history' | 'none'>, () => void>>;

type TransformationErrorProps = {
  code: ClientErrorCode;
  /**
   * Handlers for the recommended actions this screen supports. The
   * recommended action's button is shown only when its handler is given;
   * `check-history` is always a link.
   */
  actions?: ActionHandlers;
  /** Extra copy under the description, e.g. context only this screen knows. */
  note?: React.ReactNode;
  /** Secondary actions rendered after the recommended one. */
  children?: React.ReactNode;
  /** `false` where a link to History would point at the current page. */
  showHistoryLink?: boolean;
  className?: string;
};

/** An error in plain language with its one recommended next step, from `getErrorPresentation`. */
export function TransformationError({
  code,
  actions = {},
  note,
  children,
  showHistoryLink = true,
  className,
}: TransformationErrorProps) {
  const { title, description, action } = getErrorPresentation(code);
  const historyLink = action === 'check-history' && showHistoryLink;
  const handler = action === 'check-history' || action === 'none' ? undefined : actions[action];

  return (
    <div className={cn('space-y-3', className)}>
      <Alert variant="destructive">
        <AlertCircleIcon aria-hidden="true" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          <p>{description}</p>
          {note ? <p>{note}</p> : null}
        </AlertDescription>
      </Alert>
      {mayHaveSpentCredits(code) ? (
        <p className="flex gap-2 text-sm text-muted-foreground">
          <CoinsIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {CREDITS_SPENT_NOTE}
        </p>
      ) : null}
      {handler || historyLink || children ? (
        <div className="flex flex-wrap gap-2">
          {handler ? (
            <Button type="button" onClick={handler}>
              {ERROR_ACTION_LABELS[action]}
            </Button>
          ) : null}
          {historyLink ? (
            <Button asChild variant={handler ? 'outline' : 'default'}>
              <Link href="/history">{ERROR_ACTION_LABELS['check-history']}</Link>
            </Button>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
