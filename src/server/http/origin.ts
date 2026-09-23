import 'server-only';
import { requireServerEnv } from '@/lib/env/server';
import { AppError } from '@/server/errors';

/**
 * CSRF guard for the cookie-authenticated routes. Browsers send `Origin` on
 * every cross-origin request and on same-origin non-GET ones, so a request
 * carrying some other site's origin (or the opaque `null`) is refused. One
 * without the header — curl, the e2e script, a server — passes: the check is
 * about stopping other pages from riding the visitor's `uid` cookie, not about
 * who may call the API.
 *
 * Not used by the webhook route, which Magic Hour calls server-to-server and
 * which is authenticated by its signature instead.
 */
export function assertSameOrigin(
  request: Request,
  appOrigin: string = requireServerEnv('APP_URL').APP_URL,
): void {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== appOrigin) {
    throw new AppError('FORBIDDEN_ORIGIN', { cause: { origin } });
  }
}
