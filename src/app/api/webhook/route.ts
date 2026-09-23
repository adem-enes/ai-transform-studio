import { requireServerEnv } from '@/lib/env/server';
import { appDeps, handleWebhookEvent } from '@/server/application';
import { createWebhookHandler } from '@/server/http/webhook-handler';
import { logger } from '@/server/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * A `*.completed` event copies the result into Cloudinary before answering.
 * The Cloudinary SDK gives a video copy up to 180 s (`UPLOAD_TIMEOUT_MS`), so
 * the function needs more than that: 300 s is the most Vercel's Hobby plan
 * allows (with Fluid compute, the default) and well within Pro's 800 s. Must
 * be a literal — Next reads it statically.
 */
export const maxDuration = 300;

/** Magic Hour webhook receiver. Authenticated by signature; never touches cookies. */
export const POST = createWebhookHandler({
  secret: () => requireServerEnv('MAGIC_HOUR_WEBHOOK_SECRET').MAGIC_HOUR_WEBHOOK_SECRET,
  nowMs: () => Date.now(),
  handle: (event) => handleWebhookEvent(event, appDeps()),
  logger,
});
