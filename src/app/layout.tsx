import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { Container } from '@/components/layout/container';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/layout/skip-link';
import { Providers } from '@/components/providers';
import { cn } from '@/lib/utils';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: {
    default: 'AI Transform Studio',
    template: '%s · AI Transform Studio',
  },
  description: 'Transform images and videos with AI.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn('font-sans', geist.variable)}>
      <body className="flex min-h-dvh flex-col antialiased">
        <Providers>
          <SkipLink />
          <SiteHeader />
          {/* tabIndex -1 lets the skip link move keyboard focus here, not just scroll. */}
          <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 focus:outline-none">
            <Container className="py-8 sm:py-12">{children}</Container>
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
