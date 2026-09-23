import { describe, expect, it } from 'vitest';
import { type CookieOptions, type CookieStore, getOrCreateUserId, USER_ID_COOKIE } from './identity';

function store(initial?: string) {
  const values = new Map<string, string>(initial === undefined ? [] : [[USER_ID_COOKIE, initial]]);
  const sets: { name: string; value: string; options: CookieOptions }[] = [];
  const jar: CookieStore = {
    get: (name) => {
      const value = values.get(name);
      return value === undefined ? undefined : { value };
    },
    set: (name, value, options) => {
      values.set(name, value);
      sets.push({ name, value, options });
    },
  };
  return { jar, sets };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('getOrCreateUserId', () => {
  it('creates and sets a random UUID when the cookie is missing', async () => {
    const { jar, sets } = store();
    const userId = await getOrCreateUserId(jar);
    expect(userId).toMatch(UUID);
    expect(sets).toEqual([
      {
        name: 'uid',
        value: userId,
        options: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 31_536_000 },
      },
    ]);
  });

  it('reuses a valid cookie without setting one', async () => {
    const existing = '6f1c2f8e-4a4b-4c1e-9d7a-1f2e3d4c5b6a';
    const { jar, sets } = store(existing);
    await expect(getOrCreateUserId(jar)).resolves.toBe(existing);
    expect(sets).toHaveLength(0);
  });

  it.each(['', 'admin', '../../etc/passwd', '6f1c2f8e-4a4b-4c1e-9d7a', '{"$ne":null}'])(
    'replaces an invalid cookie value (%j) instead of trusting it',
    async (invalid) => {
      const { jar, sets } = store(invalid);
      const userId = await getOrCreateUserId(jar);
      expect(userId).not.toBe(invalid);
      expect(userId).toMatch(UUID);
      expect(sets).toHaveLength(1);
    },
  );
});
