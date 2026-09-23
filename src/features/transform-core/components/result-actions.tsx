'use client';

import { CopyIcon, DownloadIcon, ExternalLinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { attachmentUrl } from '@/lib/media/cloudinary';
import { cn } from '@/lib/utils';

type ResultActionsProps = {
  url: string;
  /** Suggested download file name, without extension. */
  downloadName: string;
  className?: string;
};

/** Download, open in a new tab, and copy link for a stored result. */
export function ResultActions({ url, downloadName, className }: ResultActionsProps) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <Button asChild>
        {/* `fl_attachment` makes Cloudinary send Content-Disposition: attachment — `download` alone is ignored cross-origin. */}
        <a href={attachmentUrl(url, downloadName)} download>
          <DownloadIcon aria-hidden="true" />
          Download
        </a>
      </Button>
      <Button asChild variant="outline">
        <a href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLinkIcon aria-hidden="true" />
          Open<span className="sr-only"> result in a new tab</span>
        </a>
      </Button>
      <CopyLinkButton url={url} label="Copy link" />
    </div>
  );
}

export function CopyLinkButton({
  url,
  label,
  size,
  variant = 'outline',
}: {
  url: string;
  label: React.ReactNode;
  size?: 'default' | 'sm' | 'icon-sm';
  variant?: 'outline' | 'ghost';
}) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Couldn’t copy the link. Select it and copy it manually.');
    }
  }
  return (
    <Button type="button" variant={variant} size={size} onClick={copy}>
      <CopyIcon aria-hidden="true" />
      {label}
    </Button>
  );
}
