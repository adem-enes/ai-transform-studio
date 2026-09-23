/**
 * `npm run webhook:replay -- --event image.completed --project <projectId> [--url <downloadUrl>]
 *   [--base http://localhost:3000] [--bad-signature]`
 *
 * Sends a Magic Hour-style webhook to this app, signed exactly as Magic Hour
 * signs them: hex(HMAC-SHA256(MAGIC_HOUR_WEBHOOK_SECRET, `${timestamp}.${rawBody}`)).
 * Useful for exercising /api/webhook locally, where Magic Hour cannot reach.
 *
 * - `--url` sets the completed event's download; without it the payload has
 *   none and the app fetches it from the Magic Hour API.
 * - `--bad-signature` signs with a wrong secret; expect 401.
 *
 * Exit code 0 when the response is what was expected (2xx, or 401 with
 * `--bad-signature`), 1 otherwise.
 */
import { createHmac } from 'node:crypto';
import { parseArgs } from 'node:util';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER } from '@/server/webhooks/verify-signature';

const EVENTS = [
  'image.started',
  'image.completed',
  'image.errored',
  'video.started',
  'video.completed',
  'video.errored',
] as const;
type ReplayEvent = (typeof EVENTS)[number];

function fail(message: string): never {
  console.error(`✘ ${message}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    event: { type: 'string' },
    project: { type: 'string' },
    url: { type: 'string' },
    base: { type: 'string', default: 'http://localhost:3000' },
    'bad-signature': { type: 'boolean', default: false },
  },
  strict: true,
});

const event = values.event as ReplayEvent | undefined;
if (!event || !EVENTS.includes(event)) {
  fail(`--event must be one of: ${EVENTS.join(', ')}`);
}
if (!values.project) {
  fail('--project <projectId> is required');
}
const secret = process.env.MAGIC_HOUR_WEBHOOK_SECRET;
if (!secret) {
  fail('MAGIC_HOUR_WEBHOOK_SECRET is not set (expected in .env.local)');
}

function payload(type: ReplayEvent, projectId: string, downloadUrl: string | undefined) {
  const action = type.split('.')[1];
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return {
    type,
    payload: {
      id: projectId,
      status: action === 'started' ? 'rendering' : action === 'completed' ? 'complete' : 'error',
      credits_charged: action === 'errored' ? 0 : 5,
      downloads: action === 'completed' && downloadUrl ? [{ url: downloadUrl, expires_at: expiresAt }] : [],
      error: action === 'errored' ? { code: 'replayed_error', message: 'Replayed errored event' } : null,
    },
  };
}

async function main(): Promise<void> {
  const rawBody = JSON.stringify(payload(event as ReplayEvent, values.project as string, values.url));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signingSecret = values['bad-signature'] ? `${secret}-wrong` : (secret as string);
  const signature = createHmac('sha256', signingSecret).update(`${timestamp}.${rawBody}`).digest('hex');

  const target = new URL('/api/webhook', values.base).toString();
  console.log(
    `→ POST ${target}  ${event}  project=${values.project}${values['bad-signature'] ? '  (bad signature)' : ''}`,
  );

  const response = await fetch(target, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [SIGNATURE_HEADER]: signature,
      [TIMESTAMP_HEADER]: timestamp,
    },
    body: rawBody,
  });
  const text = await response.text();
  console.log(`← ${response.status} ${response.statusText}\n${text}`);

  const expected = values['bad-signature'] ? response.status === 401 : response.ok;
  process.exitCode = expected ? 0 : 1;
}

await main();
