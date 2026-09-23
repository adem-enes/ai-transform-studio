import 'server-only';
import type { MediaKind, UploadView } from '@/schemas';
import { toUploadView } from '@/server/views';
import type { AppDeps } from './deps';

type UploadMediaInput = { userId: string; kind: MediaKind; uploadcareUuid: string };

/**
 * Registers a finished Uploadcare upload: re-checks the file server-side,
 * copies it into Cloudinary (whose URL Magic Hour will fetch) and records it.
 *
 * Uploadcare is only the transit step, so once the copy is recorded the
 * file is deleted there. That delete is best effort: a failure is logged and
 * never fails the request — `npm run cleanup:uploadcare` sweeps leftovers.
 */
export async function uploadMedia(
  { userId, kind, uploadcareUuid }: UploadMediaInput,
  { uploadcare, storage, uploads, logger }: Pick<AppDeps, 'uploadcare' | 'storage' | 'uploads' | 'logger'>,
): Promise<UploadView> {
  const file = await uploadcare.getVerifiedFile(uploadcareUuid, kind);
  const stored = await storage.uploadFromUrl(file.cdnUrl, { kind, folder: 'sources' });

  const upload = await uploads.create({
    userId,
    kind,
    uploadcareUuid: file.uuid,
    originalFilename: file.originalFilename,
    mime: file.mime,
    bytes: stored.bytes,
    width: stored.width ?? file.width,
    height: stored.height ?? file.height,
    // Cloudinary's figure (always seconds), not Uploadcare's, whose unit has to be inferred.
    durationSeconds: kind === 'video' ? stored.durationSeconds : null,
    frameRate: kind === 'video' ? stored.frameRate : null,
    cloudinary: { publicId: stored.publicId, secureUrl: stored.secureUrl, resourceType: kind },
  });

  try {
    await uploadcare.deleteFile(file.uuid);
  } catch (error) {
    logger.warn('Could not delete a copied file from Uploadcare', {
      uploadId: upload._id,
      uploadcareUuid: file.uuid,
      error,
    });
  }
  return toUploadView(upload);
}
