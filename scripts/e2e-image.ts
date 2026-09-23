/**
 * `npm run e2e:image -- --file <path> [--base <url>] [--model <model>] [--resolution <res>]
 *   [--prompt <text>] --spend-credits`
 *
 * End-to-end check of the image flow against a running deployment — the
 * same calls the UI will make:
 *
 *   Uploadcare upload → POST /api/upload → POST /api/transform
 *   → GET /api/transformations/[id] every 3 s until a terminal status.
 *
 * SPENDS MAGIC HOUR CREDITS, so it refuses to run without `--spend-credits`.
 * Defaults to the cheapest AI Image Editor option: `flux-2-klein` at `640px`
 * ("from 5 credits/image" per the API reference).
 *
 * The `uid` cookie from the first response is sent on every later request,
 * as a browser would, so all calls act as one anonymous user.
 *
 * The file goes up through Uploadcare's Upload API (the REST client cannot
 * upload); the REST client then confirms it is stored and ready.
 */
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { parseArgs } from 'node:util';
import { fileInfo, UploadcareSimpleAuthSchema } from '@uploadcare/rest-client';

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;
const TERMINAL = new Set(['completed', 'failed', 'timed_out']);
const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    base: { type: 'string', default: 'http://localhost:3000' },
    model: { type: 'string', default: 'flux-2-klein' },
    resolution: { type: 'string', default: '640px' },
    prompt: { type: 'string', default: 'Turn this into a watercolor painting.' },
    'spend-credits': { type: 'boolean', default: false },
  },
  strict: true,
});

function fail(message: string): never {
  console.error(`✘ ${message}`);
  process.exit(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (!values['spend-credits']) {
  fail(
    'This script submits a real Magic Hour job and spends credits. Re-run with --spend-credits to confirm.',
  );
}
if (!values.file) {
  fail('--file <path to a .png, .jpg or .webp image> is required');
}
const publicKey = process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY;
const secretKey = process.env.UPLOADCARE_SECRET_KEY;
if (!publicKey || !secretKey) {
  fail('NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY and UPLOADCARE_SECRET_KEY must be set (expected in .env.local)');
}

// --- Uploadcare ---------------------------------------------------------------

async function uploadToUploadcare(path: string): Promise<string> {
  const mime = MIME_BY_EXTENSION[extname(path).toLowerCase()];
  if (!mime) {
    fail(`Unsupported file extension "${extname(path)}". Use .png, .jpg, .jpeg or .webp.`);
  }
  const bytes = await readFile(path);
  const form = new FormData();
  form.set('UPLOADCARE_PUB_KEY', publicKey as string);
  form.set('UPLOADCARE_STORE', '1');
  // A signature is accepted whether or not the project requires signed uploads.
  const expire = String(Math.floor(Date.now() / 1000) + 10 * 60);
  form.set('expire', expire);
  form.set(
    'signature',
    createHmac('sha256', secretKey as string)
      .update(expire)
      .digest('hex'),
  );
  form.set('file', new Blob([bytes], { type: mime }), basename(path));

  const response = await fetch('https://upload.uploadcare.com/base/', { method: 'POST', body: form });
  const body = (await response.json().catch(() => null)) as { file?: string } | null;
  if (!response.ok || !body?.file) {
    fail(`Uploadcare upload failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body.file;
}

async function waitUntilStored(uuid: string): Promise<void> {
  const authSchema = new UploadcareSimpleAuthSchema({
    publicKey: publicKey as string,
    secretKey: secretKey as string,
  });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const info = await fileInfo({ uuid }, { authSchema });
    if (info.isReady && info.datetimeStored !== null) {
      return;
    }
    await sleep(1_000);
  }
  fail(`Uploadcare file ${uuid} did not become ready and stored within 20 s`);
}

// --- App API ------------------------------------------------------------------

let cookie: string | null = null;

async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await fetch(new URL(path, values.base), {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const uid = response.headers.getSetCookie().find((header) => header.startsWith('uid='));
  if (uid) {
    cookie = uid.split(';')[0] ?? null;
  }
  const json = (await response.json().catch(() => null)) as T | { error?: unknown } | null;
  if (!response.ok) {
    fail(`${method} ${path} → ${response.status} ${JSON.stringify(json)}`);
  }
  return json as T;
}

type Transformation = {
  id: string;
  status: string;
  output: { url: string } | null;
  error: { code: string; message: string } | null;
};

async function main(): Promise<void> {
  const started = Date.now();
  const elapsed = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;
  console.log(`Base URL: ${values.base}`);
  console.log(`Model: ${values.model} @ ${values.resolution}\n`);

  const uuid = await uploadToUploadcare(values.file as string);
  console.log(`[${elapsed()}] Uploadcare upload: ${uuid}`);
  await waitUntilStored(uuid);
  console.log(`[${elapsed()}] Uploadcare file stored and ready`);

  const { upload } = await api<{ upload: { id: string; url: string } }>('POST', '/api/upload', {
    kind: 'image',
    uploadcareUuid: uuid,
  });
  console.log(`[${elapsed()}] POST /api/upload → upload ${upload.id} (${upload.url})`);

  const { transformation } = await api<{ transformation: Transformation }>('POST', '/api/transform', {
    uploadId: upload.id,
    kind: 'image',
    params: {
      prompt: values.prompt,
      model: values.model,
      resolution: values.resolution,
      aspect_ratio: 'auto',
    },
  });
  console.log(`[${elapsed()}] POST /api/transform → transformation ${transformation.id}`);
  console.log(`[${elapsed()}] status: ${transformation.status}`);

  let current = transformation;
  let lastStatus = current.status;
  while (!TERMINAL.has(current.status)) {
    if (Date.now() - started > POLL_TIMEOUT_MS) {
      fail(`Gave up polling after ${POLL_TIMEOUT_MS / 60_000} minutes; last status "${current.status}"`);
    }
    await sleep(POLL_INTERVAL_MS);
    current = (await api<{ transformation: Transformation }>('GET', `/api/transformations/${current.id}`))
      .transformation;
    if (current.status !== lastStatus) {
      console.log(`[${elapsed()}] status: ${current.status}`);
      lastStatus = current.status;
    }
  }

  if (current.status === 'completed' && current.output) {
    console.log(`\n✔ Completed in ${elapsed()}\nOutput: ${current.output.url}`);
    return;
  }
  fail(`Ended as "${current.status}": ${JSON.stringify(current.error)}`);
}

await main();
