import { type TransformResponse, transformRequest } from '@/schemas';
import { appDeps, createTransformation } from '@/server/application';
import { json, parseInput, readJson, withErrorHandling } from '@/server/http/responses';
import { getOrCreateUserId } from '@/server/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Starts a transformation. 202 `{ transformation }`; the result arrives asynchronously. */
export const POST = withErrorHandling(async (request: Request) => {
  const userId = await getOrCreateUserId();
  const input = parseInput(transformRequest, await readJson(request));
  const transformation = await createTransformation({ userId, ...input }, appDeps());
  return json({ transformation } satisfies TransformResponse, 202);
});
