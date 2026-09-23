import 'server-only';
import { fileInfo, isRestClientError, UploadcareSimpleAuthSchema } from '@uploadcare/rest-client';
import { z } from 'zod';
import { clientEnv } from '@/lib/env/client';
import { requireServerEnv } from '@/lib/env/server';
import type { MediaKind } from '@/schemas';
import { AppError } from '@/server/errors';
import { type VerifiedFile, verifyFileInfo } from './uploadcare-file-check';

export type { VerifiedFile } from './uploadcare-file-check';

function authSchema(): UploadcareSimpleAuthSchema {
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
    const info = await fileInfo({ uuid }, { authSchema: authSchema() });
    return verifyFileInfo(info, kind);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (isRestClientError(error) && error.status === 404) {
      throw new AppError('UPLOAD_NOT_FOUND', { cause: error });
    }
    throw new AppError('STORAGE_FAILED', { message: 'The upload could not be verified.', cause: error });
  }
}
