import type { TransformResponse } from '@/schemas';
import { appDeps, getTransformation } from '@/server/application';
import { json, withErrorHandling } from '@/server/http/responses';
import { getOrCreateUserId } from '@/server/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * May finalize a completed job (a Cloudinary copy) while answering. The
 * Cloudinary SDK gives a video copy up to 180 s (`UPLOAD_TIMEOUT_MS`), so the
 * function needs more than that: 300 s is the most Vercel's Hobby plan allows
 * (with Fluid compute, the default) and well within Pro's 800 s. Must be a
 * literal — Next reads it statically.
 */
export const maxDuration = 300;

/** One transformation, reconciled with Magic Hour when still active. What the UI polls. */
export const GET = withErrorHandling(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await getOrCreateUserId();
    const { id } = await params;
    const transformation = await getTransformation({ userId, id }, appDeps());
    return json({ transformation } satisfies TransformResponse);
  },
);
