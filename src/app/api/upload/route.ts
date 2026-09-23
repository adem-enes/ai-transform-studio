import { type UploadResponse, uploadRequest } from '@/schemas';
import { appDeps, uploadMedia } from '@/server/application';
import { json, parseInput, readJson, withErrorHandling } from '@/server/http/responses';
import { getOrCreateUserId } from '@/server/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * Cloudinary fetches the file (up to 50 MB of video) from Uploadcare before
 * this returns. The Cloudinary SDK gives a video copy up to 180 s
 * (`UPLOAD_TIMEOUT_MS`), so the function needs more than that: 300 s is the
 * most Vercel's Hobby plan allows (with Fluid compute, the default) and well
 * within Pro's 800 s. Must be a literal — Next reads it statically.
 */
export const maxDuration = 300;

/** Registers a finished Uploadcare upload. 201 `{ upload }`. */
export const POST = withErrorHandling(async (request: Request) => {
  const userId = await getOrCreateUserId();
  const input = parseInput(uploadRequest, await readJson(request));
  const upload = await uploadMedia({ userId, ...input }, appDeps());
  return json({ upload } satisfies UploadResponse, 201);
});
