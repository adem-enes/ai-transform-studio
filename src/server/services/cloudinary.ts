import 'server-only';
import { v2 as cloudinary } from 'cloudinary';
import * as z from 'zod';
import { requireServerEnv } from '@/lib/env/server';
import type { MediaKind } from '@/schemas';
import { AppError } from '@/server/errors';

const ROOT_FOLDER = 'ai-transform-studio';

export type StorageFolder = 'sources' | 'outputs';

let configured = false;

function client(): typeof cloudinary {
  if (!configured) {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = requireServerEnv(
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    );
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

/** The fields we rely on from an upload response (whose SDK type is an open `any` bag). */
const uploadResult = z.object({
  public_id: z.string(),
  secure_url: z.url(),
  bytes: z.number().int().nonnegative(),
  format: z.string(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().nonnegative().optional(),
  frame_rate: z.number().positive().optional(),
});

export type StoredAsset = {
  publicId: string;
  /** Always ends in the file extension — Magic Hour requires that of input URLs. */
  secureUrl: string;
  bytes: number;
  format: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  /** Videos only. */
  frameRate: number | null;
};

/**
 * How long one copy may take before the SDK gives up (its own default is 60 s).
 * A video is fetched and probed by Cloudinary before the call returns, so it
 * gets longer — but still well inside the routes' `maxDuration` (300 s), so a
 * slow copy ends as a clean, retryable `STORAGE_FAILED` rather than the
 * function being killed mid-request.
 */
const UPLOAD_TIMEOUT_MS = { image: 60_000, video: 180_000 } as const satisfies Record<MediaKind, number>;

export type UploadFromUrlOptions = {
  kind: MediaKind;
  folder: StorageFolder;
  /**
   * Fixed name within the folder. When set, an existing asset with the same
   * name is overwritten, which makes repeating the copy idempotent (used for
   * outputs, named after their transformation). Otherwise Cloudinary picks a
   * unique name and never overwrites.
   */
  publicId?: string;
};

/**
 * Copies a remote file into Cloudinary by URL: Cloudinary fetches it, so this
 * server never streams the bytes itself.
 */
export async function uploadFromUrl(
  url: string,
  { kind, folder, publicId }: UploadFromUrlOptions,
): Promise<StoredAsset> {
  let response: unknown;
  try {
    response = await client().uploader.upload(url, {
      resource_type: kind,
      timeout: UPLOAD_TIMEOUT_MS[kind],
      folder: `${ROOT_FOLDER}/${folder}/${kind}`,
      ...(publicId
        ? { public_id: publicId, overwrite: true, invalidate: true }
        : { unique_filename: true, overwrite: false }),
    });
  } catch (error) {
    throw new AppError('STORAGE_FAILED', { cause: cloudinaryFailure(error) });
  }

  const parsed = uploadResult.safeParse(response);
  if (!parsed.success) {
    throw new AppError('STORAGE_FAILED', { cause: parsed.error });
  }
  const { public_id, secure_url, bytes, format, width, height, duration, frame_rate } = parsed.data;
  return {
    publicId: public_id,
    secureUrl: secure_url,
    bytes,
    format,
    width: width ?? null,
    height: height ?? null,
    durationSeconds: duration ?? null,
    frameRate: frame_rate ?? null,
  };
}

/** Admin API ping — free, read-only. For the service check script. */
export async function pingCloudinary(): Promise<void> {
  try {
    await client().api.ping();
  } catch (error) {
    throw new AppError('STORAGE_FAILED', { cause: cloudinaryFailure(error) });
  }
}

const cloudinaryErrorFields = z.object({
  message: z.string().optional(),
  http_code: z.number().optional(),
});
const cloudinaryRejection = cloudinaryErrorFields.extend({ error: cloudinaryErrorFields.optional() });

/**
 * The SDK rejects with plain objects, not Errors: `{ message, http_code }` from
 * the upload API, `{ error: { message, http_code }, request_options }` from the
 * admin API. `request_options.auth` holds `api_key:api_secret`, so only the
 * message and status are kept — the raw rejection must never reach a log.
 */
export function cloudinaryFailure(error: unknown): { httpCode: number | null; message: string } {
  if (error instanceof Error) {
    return { httpCode: null, message: error.message };
  }
  const parsed = cloudinaryRejection.safeParse(error);
  if (!parsed.success) {
    return { httpCode: null, message: 'Unrecognized Cloudinary error' };
  }
  const { message, http_code, error: nested } = parsed.data;
  return {
    httpCode: nested?.http_code ?? http_code ?? null,
    message: nested?.message ?? message ?? 'Unrecognized Cloudinary error',
  };
}
