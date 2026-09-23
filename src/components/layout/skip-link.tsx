/** The id the skip link targets, and the one `<main>` in the root layout carries. */
export const MAIN_CONTENT_ID = 'main-content';

/**
 * The first thing in the tab order, invisible until focused. `sr-only` rather
 * than `display: none`, which would remove it from the tab order entirely.
 * `focus:fixed` so it is on screen even when the page is scrolled.
 */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring"
    >
      Skip to content
    </a>
  );
}
