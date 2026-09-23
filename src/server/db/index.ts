import 'server-only';

export { closeMongoClient, getDb } from './client';
export { ensureIndexes } from './collections';
export type * from './models';
