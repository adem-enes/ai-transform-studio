import { requireServerEnv } from '@/lib/env/server';
import { appDeps, handleWebhookEvent } from '@/server/application';
import { createWebhookHandler } from '@/server/http/webhook-handler';
import { logger } from '@/server/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** A `*.completed` event copies the result into Cloudinary before answering. */
export const maxDuration = 60;

/** Magic Hour webhook receiver. Authenticated by signature; never touches cookies. */
export const POST = createWebhookHandler({
  secret: () => requireServerEnv('MAGIC_HOUR_WEBHOOK_SECRET').MAGIC_HOUR_WEBHOOK_SECRET,
  nowMs: () => Date.now(),
  handle: (event) => handleWebhookEvent(event, appDeps()),
  logger,
});
