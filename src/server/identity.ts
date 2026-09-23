import 'server-only';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';

/**
 * Anonymous user identity — NOT authentication.
 *
 * Each browser gets a random UUID in an httpOnly cookie, and every upload and
 * transformation is scoped to it. The value is unguessable (122 random bits),
 * so one visitor cannot enumerate another's history, but anyone who obtains
 * the cookie *is* that user, and clearing cookies loses the history. There is
 * no account, password or session behind it.
 *
 * Only route handlers may call this: it may set a cookie, which Next allows
 * only there (and in Server Functions). The webhook route never calls it.
 */
export const USER_ID_COOKIE = 'uid';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** The subset of Next's cookie store this module uses — so tests can pass a fake. */
export type CookieStore = {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options: CookieOptions): unknown;
};

export type CookieOptions = {
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge: number;
};

export function userIdCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  };
}

/**
 * The caller's user id: the `uid` cookie when it holds a valid UUID,
 * otherwise a new random one, set on the response. A malformed value is
 * replaced, never trusted.
 */
export async function getOrCreateUserId(store?: CookieStore): Promise<string> {
  const jar = store ?? (await cookies());
  const existing = jar.get(USER_ID_COOKIE)?.value;
  if (existing !== undefined && z.uuid().safeParse(existing).success) {
    return existing.toLowerCase();
  }
  const userId = randomUUID();
  jar.set(USER_ID_COOKIE, userId, userIdCookieOptions());
  return userId;
}
