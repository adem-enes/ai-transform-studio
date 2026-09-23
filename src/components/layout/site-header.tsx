import Link from 'next/link';
import { Container } from './container';
import { MainNav } from './main-nav';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <Container className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
        <Link
          href="/"
          className="rounded-md text-base font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          AI Transform Studio
        </Link>
        <MainNav />
      </Container>
    </header>
  );
}
