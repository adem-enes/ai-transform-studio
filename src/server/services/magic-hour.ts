import 'server-only';
import { ApiError, Client } from 'magic-hour';
import { requireServerEnv } from '@/lib/env/server';
import type { ImageTransformParams, MediaKind, VideoTransformParams } from '@/schemas';
import { mapProviderFailure, providerFailure } from './magic-hour-errors';

/**
 * Magic Hour, through the official SDK.
 *
 * Everything is fire-and-forget: create calls return a project id and results
 * arrive by webhook (registered once in the Developer Hub — the API has no
 * per-request callback URL). `generate()` / `waitForCompletion` are never used.
 *
 * The SDK retries nothing by default, and that is deliberate here: a create
 * call spends credits and the API has no idempotency key, so a retried POST
 * after a lost response could bill twice.
 */

const REQUEST_TIMEOUT_MS = 30_000;

let instance: Client | undefined;

function client(): Client {
  if (!instance) {
    const { MAGIC_HOUR_API_KEY } = requireServerEnv('MAGIC_HOUR_API_KEY');
    instance = new Client({ token: MAGIC_HOUR_API_KEY, timeout: REQUEST_TIMEOUT_MS });
  }
  return instance;
}

/**
 * Runs an SDK call, converting provider failures into an `AppError`. The client
 * is built outside the `try`, so missing configuration surfaces as itself
 * rather than as a provider outage.
 */
async function call<T>(request: (mh: Client) => Promise<T>): Promise<T> {
  const mh = client();
  try {
    return await request(mh);
  } catch (error) {
    // Never keep the SDK error itself as the cause: `ApiError.request` carries the bearer token.
    const summary = error instanceof Error ? { name: error.name, message: error.message } : null;
    if (error instanceof ApiError) {
      const body: unknown = await error.response.json().catch(() => null);
      throw mapProviderFailure(providerFailure(error.response.status, body), summary);
    }
    // No HTTP response at all: DNS, connection reset, or our timeout aborting the request.
    throw mapProviderFailure(providerFailure(null, null), summary);
  }
}

export type SubmittedProject = {
  projectId: string;
  /** Charged up front; refunded (and this figure updated) if rendering fails. An estimate for video. */
  creditsCharged: number;
};

export type SubmitInput<P> = {
  /** Public URL of the source, with a file extension (a Cloudinary `secure_url` qualifies). */
  sourceUrl: string;
  params: P;
  /** Shown in the Magic Hour dashboard; handy for tracing a project back to a document. */
  name?: string;
};

export async function submitImageTransformation({
  sourceUrl,
  params,
  name,
}: SubmitInput<ImageTransformParams>): Promise<SubmittedProject> {
  const result = await call((mh) =>
    mh.v1.aiImageEditor.create({
      name,
      assets: { imageFilePaths: [sourceUrl] },
      style: { prompt: params.prompt },
      model: params.model,
      aspectRatio: params.aspect_ratio,
      resolution: params.resolution,
      // One source in, one result out: history stores a single output per transformation.
      imageCount: 1,
    }),
  );
  return { projectId: result.id, creditsCharged: result.creditsCharged };
}

export async function submitVideoTransformation({
  sourceUrl,
  params,
  name,
}: SubmitInput<VideoTransformParams>): Promise<SubmittedProject> {
  const result = await call((mh) =>
    mh.v1.videoToVideo.create({
      name,
      assets: { videoSource: 'file', videoFilePath: sourceUrl },
      startSeconds: params.start_seconds,
      endSeconds: params.end_seconds,
      fpsResolution: params.fps_resolution,
      style: {
        artStyle: params.art_style,
        model: params.model,
        version: params.version,
        promptType: params.prompt_type,
        // Magic Hour ignores `prompt` when `prompt_type` is `default`; don't send a stale one.
        prompt: params.prompt_type === 'default' ? undefined : params.prompt,
      },
    }),
  );
  return { projectId: result.id, creditsCharged: result.creditsCharged };
}

/** Magic Hour's own project statuses (GET /v1/{image,video}-projects/{id}). */
export type ProviderProjectStatus = 'draft' | 'queued' | 'rendering' | 'complete' | 'error' | 'canceled';

export type ProjectStatus = {
  projectId: string;
  status: ProviderProjectStatus;
  creditsCharged: number;
  /** Populated once `complete`. The URLs expire (about 24 hours per the docs); copy them promptly. */
  downloads: { url: string; expiresAt: string }[];
  error: { code: string; message: string } | null;
};

/**
 * Current state of a project. Used to reconcile when a webhook never arrives —
 * notably cancellation, which Magic Hour reports by status only, with no event.
 */
export async function getProjectStatus(kind: MediaKind, projectId: string): Promise<ProjectStatus> {
  const project =
    kind === 'image'
      ? await call((mh) => mh.v1.imageProjects.get({ id: projectId }))
      : await call((mh) => mh.v1.videoProjects.get({ id: projectId }));
  return {
    projectId: project.id,
    status: project.status,
    creditsCharged: project.creditsCharged,
    downloads: project.downloads.map(({ url, expiresAt }) => ({ url, expiresAt })),
    error: project.error ? { code: project.error.code, message: project.error.message } : null,
  };
}

/** GET /v1/account — free and read-only. For the service check script. */
export async function getAccount(): Promise<{ tier: string; credits: number }> {
  const account = await call((mh) => mh.v1.account.list());
  return { tier: account.tier, credits: account.credits };
}
