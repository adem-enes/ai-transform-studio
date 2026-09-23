import type { UploadSignatureResponse } from '@/schemas';
import { assertSameOrigin } from '@/server/http/origin';
import { json, withErrorHandling } from '@/server/http/responses';
import { createUploadSignature } from '@/server/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A short-lived Uploadcare signature for one browser upload, so the project
 * can require signed uploads and the public key alone cannot store files.
 * The secret key never leaves the server. 200 `{ signature, expire }`.
 */
export const GET = withErrorHandling(async (request: Request) => {
  assertSameOrigin(request);
  return json(createUploadSignature(Date.now()) satisfies UploadSignatureResponse);
});
