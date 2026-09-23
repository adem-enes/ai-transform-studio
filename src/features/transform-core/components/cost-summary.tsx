import { isTerminalStatus, type TransformationView } from '@/schemas';

/**
 * The pre-submit estimate next to what Magic Hour actually charged. The
 * charge is set at submission and corrected when the job settles (a video's
 * frame count, a refund for a failed render), so while the job runs it is
 * marked as not yet final.
 */
export function CostSummary({
  estimate,
  transformation: { creditsCharged, status },
}: {
  /** "from 5 credits", "~240 credits". */
  estimate: string;
  transformation: TransformationView;
}) {
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      <div className="flex gap-1">
        <dt className="text-muted-foreground">Estimated:</dt>
        <dd>{estimate}</dd>
      </div>
      <div className="flex gap-1">
        <dt className="text-muted-foreground">Charged:</dt>
        <dd>
          {creditsCharged === null ? (
            'not yet'
          ) : (
            <>
              <span className="font-medium">{formatCredits(creditsCharged)}</span>
              {isTerminalStatus(status) ? null : (
                <span className="text-muted-foreground"> (final once it finishes)</span>
              )}
            </>
          )}
        </dd>
      </div>
    </dl>
  );
}

function formatCredits(credits: number): string {
  return `${credits.toLocaleString('en')} ${credits === 1 ? 'credit' : 'credits'}`;
}
