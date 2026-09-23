import 'server-only';
import { z } from 'zod';
import type { WebhookOutcome } from '@/server/application';
import { AppError, isAppError, isRetryable, toErrorResponse } from '@/server/errors';
import type { Logger } from '@/server/logger';
import { isHandledEventType, type WebhookEvent, webhookEvent } from '@/server/webhooks/event';
import { verifyWebhookSignature } from '@/server/webhooks/verify-signature';
import { errorJson, json, parseInput } from './responses';

/** Magic Hour payloads are a few KB; anything near this is not one. */
export const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

export type WebhookHandlerDeps = {
  /** Read per request so a missing secret fails the request (500), not the module import. */
  secret(): string;
  nowMs(): number;
  handle(event: WebhookEvent): Promise<WebhookOutcome>;
  logger: Logger;
};

const envelope = z.object({ type: z.string() });

/**
 * POST /api/webhook, built from its dependencies so tests can drive it
 * without a database or network.
 *
 * Status codes are chosen for Magic Hour's redelivery, which retries any
 * non-2xx: 200 for anything handled or deliberately ignored (including
 * duplicates), 503 for retryable conditions such as an event that beat its
 * project id into the database, 401/413/400 for requests that are not
 * legitimate events.
 */
export function createWebhookHandler(deps: WebhookHandlerDeps): (request: Request) => Promise<Response> {
  const { logger } = deps;
  return async (request) => {
    try {
      const declaredLength = Number(request.headers.get('content-length') ?? 0);
      if (declaredLength > MAX_WEBHOOK_BODY_BYTES) {
        throw new AppError('PAYLOAD_TOO_LARGE');
      }
      // The raw text, before any parsing: the signature covers the exact bytes sent.
      const rawBody = await request.text();
      if (Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BODY_BYTES) {
        throw new AppError('PAYLOAD_TOO_LARGE');
      }

      if (!verifyWebhookSignature(rawBody, request.headers, deps.secret(), deps.nowMs())) {
        throw new AppError('INVALID_SIGNATURE');
      }

      let data: unknown;
      try {
        data = JSON.parse(rawBody);
      } catch (error) {
        throw new AppError('VALIDATION_FAILED', {
          message: 'The webhook body is not valid JSON.',
          cause: error,
        });
      }

      const { type } = parseInput(envelope, data);
      if (!isHandledEventType(type)) {
        logger.info('Ignoring unhandled webhook event type', { type });
        return json({ received: true, result: 'ignored' });
      }

      const event = parseInput(webhookEvent, data);
      const outcome = await deps.handle(event);
      logger.info('Webhook processed', { type, projectId: event.payload.id, ...outcome });
      return json({ received: true, ...outcome });
    } catch (error) {
      if (isRetryable(error)) {
        logger.warn('Webhook deferred for redelivery', { error });
        return json(toErrorResponse(error).body, 503);
      }
      if (isAppError(error) && error.httpStatus < 500) {
        logger.warn('Webhook rejected', { code: error.code, message: error.message });
      }
      return errorJson(error, logger);
    }
  };
}
