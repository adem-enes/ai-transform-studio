import { type HistoryResponse, historyQuery } from '@/schemas';
import { appDeps, listHistory } from '@/server/application';
import { json, parseInput, withErrorHandling } from '@/server/http/responses';
import { getOrCreateUserId } from '@/server/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The caller's transformations, newest first. Query: `cursor`, `limit` (≤ 50), `kind`. */
export const GET = withErrorHandling(async (request: Request) => {
  const userId = await getOrCreateUserId();
  const query = parseInput(historyQuery, Object.fromEntries(new URL(request.url).searchParams));
  const page = await listHistory({ userId, ...query }, appDeps());
  return json(page satisfies HistoryResponse);
});
