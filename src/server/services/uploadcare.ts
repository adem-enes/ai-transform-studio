import 'server-only';
import { deleteFile, fileInfo, isRestClientError, UploadcareSimpleAuthSchema } from '@uploadcare/rest-client';
import * as z from 'zod';
import { clientEnv } from '@/lib/env/client';
import { requireServerEnv } from '@/lib/env/server';
import type { MediaKind } from '@/schemas';
import { AppError } from '@/server/errors';
import { type VerifiedFile, verifyFileInfo } from './uploadcare-file-check';
import { signUpload } from './uploadcare-signature';

export type { VerifiedFile } from './uploadcare-file-check';

/** Signed-upload parameters for one browser upload, valid for `UPLOAD_SIGNATURE_TTL_SECONDS`. */
export function createUploadSignature(nowMs: number): { signature: string; expire: number } {
  return signUpload(requireServerEnv('UPLOADCARE_SECRET_KEY').UPLOADCARE_SECRET_KEY, nowMs);
}

export function uploadcareAuthSchema(): UploadcareSimpleAuthSchema {
  const { UPLOADCARE_SECRET_KEY } = requireServerEnv('UPLOADCARE_SECRET_KEY');
  const { NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY } = clientEnv();
  if (!NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY) {
    throw new Error(
      'Missing required environment variable(s): NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY. See .env.example.',
    );
  }
  // Simple auth sends the secret over TLS; the signed schema would add an MD5 of every request for no gain here.
  return new UploadcareSimpleAuthSchema({
    publicKey: NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY,
    secretKey: UPLOADCARE_SECRET_KEY,
  });
}

/**
 * Fetches a client-uploaded file's info with the secret key and checks it is
 * stored, ready, of an allowed type for `kind` and within the size limit.
 */
export async function getVerifiedFile(uuid: string, kind: MediaKind): Promise<VerifiedFile> {
  if (!z.uuid().safeParse(uuid).success) {
    throw new AppError('UPLOAD_NOT_FOUND');
  }
  try {
    const info = await fileInfo({ uuid }, { authSchema: uploadcareAuthSchema() });
    return verifyFileInfo(info, kind);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (isRestClientError(error) && error.status === 404) {
      throw new AppError('UPLOAD_NOT_FOUND', { cause: restErrorSummary(error) });
    }
    throw new AppError('STORAGE_FAILED', {
      message: 'The upload could not be verified.',
      cause: restErrorSummary(error),
    });
  }
}

/**
 * Deletes a file from Uploadcare. A file that is already gone counts as
 * deleted; anything else is thrown with a sanitized cause (the REST client's
 * error carries the request, secret included).
 */
export async function deleteUploadcareFile(uuid: string): Promise<void> {
  try {
    await deleteFile({ uuid }, { authSchema: uploadcareAuthSchema() });
  } catch (error) {
    if (isRestClientError(error) && error.status === 404) {
      return;
    }
    throw new AppError('STORAGE_FAILED', {
      message: 'The Uploadcare file could not be deleted.',
      cause: restErrorSummary(error),
    });
  }
}

/** The REST client's error carries the request, secret key included: keep only its status and message. */
function restErrorSummary(error: unknown): { status: number | null; message: string } {
  return {
    status: isRestClientError(error) ? (error.status ?? null) : null,
    message: error instanceof Error ? error.message : 'Unrecognized Uploadcare error',
  };
}
