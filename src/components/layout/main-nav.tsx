'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/image', label: 'Image' },
  { href: '/video', label: 'Video' },
  { href: '/history', label: 'History' },
] as const;

/** Primary navigation. Client-side only to mark the current section with `aria-current`. */
export function MainNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main">
      <ul className="flex items-center gap-1">
        {NAV_ITEMS.map(({ href, label }) => {
          const isCurrent = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isCurrent ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isCurrent && 'bg-muted text-foreground',
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
