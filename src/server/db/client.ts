import 'server-only';
import { type Db, MongoClient } from 'mongodb';
import { requireServerEnv } from '@/lib/env/server';

/**
 * One MongoClient per process. It lives on `globalThis` so dev-mode HMR, which
 * re-evaluates this module, reuses the pool instead of opening a new one per
 * edit; in production the same cache keeps a warm serverless instance from
 * reconnecting per request. `connect()` is lazy and concurrent callers share
 * one promise.
 */
const cache = globalThis as typeof globalThis & {
  __mongoClientPromise?: Promise<MongoClient>;
};

/** The database name from the URI path. Required so writes never land in the driver's default `test` db. */
export function databaseNameFromUri(uri: string): string | null {
  const match = /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?/]+)/.exec(uri);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function getMongoClient(): Promise<MongoClient> {
  if (!cache.__mongoClientPromise) {
    const { MONGODB_URI } = requireServerEnv('MONGODB_URI');
    const promise = new MongoClient(MONGODB_URI, { appName: 'ai-transform-studio' }).connect();
    // A failed connect must not poison the cache for every later request.
    promise.catch(() => {
      if (cache.__mongoClientPromise === promise) {
        cache.__mongoClientPromise = undefined;
      }
    });
    cache.__mongoClientPromise = promise;
  }
  return cache.__mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const { MONGODB_URI } = requireServerEnv('MONGODB_URI');
  const name = databaseNameFromUri(MONGODB_URI);
  if (!name) {
    throw new Error('MONGODB_URI must include a database name, e.g. mongodb+srv://host/ai-transform-studio');
  }
  return (await getMongoClient()).db(name);
}

/** For scripts: closes the cached client so the process can exit. */
export async function closeMongoClient(): Promise<void> {
  const promise = cache.__mongoClientPromise;
  cache.__mongoClientPromise = undefined;
  if (promise) {
    await (await promise).close();
  }
}
