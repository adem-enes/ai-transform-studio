import type { TransformResponse } from '@/schemas';
import { appDeps, getTransformation } from '@/server/application';
import { json, withErrorHandling } from '@/server/http/responses';
import { getOrCreateUserId } from '@/server/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** May finalize a completed job (a Cloudinary copy) while answering. */
export const maxDuration = 60;

/** One transformation, reconciled with Magic Hour when still active. What the UI polls. */
export const GET = withErrorHandling(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await getOrCreateUserId();
    const { id } = await params;
    const transformation = await getTransformation({ userId, id }, appDeps());
    return json({ transformation } satisfies TransformResponse);
  },
);
