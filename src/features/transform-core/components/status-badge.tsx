import { CheckCircle2Icon, ClockIcon, Loader2Icon, XCircleIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { TransformationStatus } from '@/schemas';

const LABELS: Record<TransformationStatus, string> = {
  queued: 'Queued',
  processing: 'Processing',
  finalizing: 'Finalizing',
  completed: 'Completed',
  failed: 'Failed',
  timed_out: 'Timed out',
};

export function statusLabel(status: TransformationStatus): string {
  return LABELS[status];
}

/** Status as text plus an icon — never colour alone. */
export function StatusBadge({ status, className }: { status: TransformationStatus; className?: string }) {
  switch (status) {
    case 'completed':
      return (
        <Badge variant="secondary" className={className}>
          <CheckCircle2Icon aria-hidden="true" />
          {LABELS[status]}
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="destructive" className={className}>
          <XCircleIcon aria-hidden="true" />
          {LABELS[status]}
        </Badge>
      );
    case 'timed_out':
      return (
        <Badge variant="outline" className={className}>
          <ClockIcon aria-hidden="true" />
          {LABELS[status]}
        </Badge>
      );
    default:
      return (
        <Badge variant="default" className={className}>
          <Loader2Icon aria-hidden="true" className="motion-safe:animate-spin" />
          {LABELS[status]}
        </Badge>
      );
  }
}
