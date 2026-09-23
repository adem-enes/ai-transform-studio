import 'server-only';
import type { MediaKind, UploadView } from '@/schemas';
import { toUploadView } from '@/server/views';
import type { AppDeps } from './deps';

export type UploadMediaInput = { userId: string; kind: MediaKind; uploadcareUuid: string };

/**
 * Registers a finished Uploadcare upload: re-checks the file server-side,
 * copies it into Cloudinary (whose URL Magic Hour will fetch) and records it.
 */
export async function uploadMedia(
  { userId, kind, uploadcareUuid }: UploadMediaInput,
  { uploadcare, storage, uploads }: Pick<AppDeps, 'uploadcare' | 'storage' | 'uploads'>,
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
    cloudinary: { publicId: stored.publicId, secureUrl: stored.secureUrl, resourceType: kind },
  });
  return toUploadView(upload);
}
