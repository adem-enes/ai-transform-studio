import { Container } from './container';

export function SiteFooter() {
  return (
    <footer className="border-t">
      <Container className="flex flex-col gap-1 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>AI Transform Studio — powered by the Magic Hour API.</p>
        <p>
          Developed by <span className="font-medium text-foreground">Adem Enes Polat</span> ·{' '}
          <a
            href="mailto:ademenespolat@gmail.com"
            className="rounded-sm underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ademenespolat@gmail.com
          </a>
        </p>
      </Container>
    </footer>
  );
}
