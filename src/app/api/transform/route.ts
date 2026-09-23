import { type TransformResponse, transformRequest } from '@/schemas';
import { appDeps, createTransformation } from '@/server/application';
import { json, parseInput, readJson, withErrorHandling } from '@/server/http/responses';
import { getOrCreateUserId } from '@/server/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * At the active-job limit, running jobs are reconciled first, which may
 * finalize one (a Cloudinary copy). The Cloudinary SDK gives a video copy up
 * to 180 s (`UPLOAD_TIMEOUT_MS`), so the function needs more than that: 300 s
 * is the most Vercel's Hobby plan allows (with Fluid compute, the default) and
 * well within Pro's 800 s. Must be a literal — Next reads it statically.
 */
export const maxDuration = 300;

/** Starts a transformation. 202 `{ transformation }`; the result arrives asynchronously. */
export const POST = withErrorHandling(async (request: Request) => {
  const userId = await getOrCreateUserId();
  const input = parseInput(transformRequest, await readJson(request));
  const transformation = await createTransformation({ userId, ...input }, appDeps());
  return json({ transformation } satisfies TransformResponse, 202);
});
