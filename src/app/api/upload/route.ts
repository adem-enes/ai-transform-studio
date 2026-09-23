import { type UploadResponse, uploadRequest } from '@/schemas';
import { appDeps, uploadMedia } from '@/server/application';
import { json, parseInput, readJson, withErrorHandling } from '@/server/http/responses';
import { getOrCreateUserId } from '@/server/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Cloudinary fetches the file from Uploadcare before this returns; videos take a while. */
export const maxDuration = 60;

/** Registers a finished Uploadcare upload. 201 `{ upload }`. */
export const POST = withErrorHandling(async (request: Request) => {
  const userId = await getOrCreateUserId();
  const input = parseInput(uploadRequest, await readJson(request));
  const upload = await uploadMedia({ userId, ...input }, appDeps());
  return json({ upload } satisfies UploadResponse, 201);
});
