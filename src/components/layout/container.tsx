import { cn } from '@/lib/utils';

/** Horizontal page gutter and max width, shared by the header, main and footer. */
export function Container({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mx-auto w-full max-w-5xl px-4 sm:px-6', className)} {...props} />;
}
