import 'server-only';
import * as z from 'zod';

/**
 * Magic Hour webhook envelope (https://docs.magichour.ai/integration/webhook/event-types).
 * `payload` has the shape of GET /v1/{image,video}-projects/{id} — raw
 * snake_case JSON, not the SDK's camelCase. Only the fields this app reads
 * are declared; unknown keys pass through untouched.
 *
 * There is no `*.canceled` event: a canceled job only shows up via polling.
 */
const WEBHOOK_EVENT_TYPES = [
  'image.started',
  'image.completed',
  'image.errored',
  'video.started',
  'video.completed',
  'video.errored',
] as const;

export const webhookEvent = z.object({
  // Audio events exist too; they are accepted here and ignored by the handler.
  type: z.string(),
  payload: z.looseObject({
    id: z.string().min(1),
    status: z.enum(['draft', 'queued', 'rendering', 'complete', 'error', 'canceled']),
    credits_charged: z.number().optional(),
    downloads: z.array(z.looseObject({ url: z.url(), expires_at: z.string() })).default([]),
    error: z.looseObject({ code: z.string(), message: z.string() }).nullable().default(null),
  }),
});
export type WebhookEvent = z.infer<typeof webhookEvent>;

type HandledEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export function isHandledEventType(type: string): type is HandledEventType {
  const handled: readonly string[] = WEBHOOK_EVENT_TYPES;
  return handled.includes(type);
}
