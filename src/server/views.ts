import 'server-only';
import type { TransformationView, UploadView } from '@/schemas';
import type { TransformationDoc, UploadDoc } from '@/server/db/models';

/** Document → client view models. The only path by which stored data reaches the UI. */

export function toUploadView(doc: UploadDoc): UploadView {
  return {
    id: doc._id.toHexString(),
    kind: doc.kind,
    filename: doc.originalFilename,
    mime: doc.mime,
    bytes: doc.bytes,
    width: doc.width,
    height: doc.height,
    durationSeconds: doc.durationSeconds,
    frameRate: doc.frameRate,
    url: doc.cloudinary.secureUrl,
    createdAt: doc.createdAt.toISOString(),
  };
}

export function toTransformationView(doc: TransformationDoc): TransformationView {
  const base = {
    id: doc._id.toHexString(),
    uploadId: doc.uploadId.toHexString(),
    status: doc.status,
    source: {
      url: doc.source.secureUrl,
      mime: doc.source.mime,
      width: doc.source.width,
      height: doc.source.height,
      durationSeconds: doc.source.durationSeconds,
      frameRate: doc.source.frameRate,
    },
    output: doc.output
      ? {
          url: doc.output.secureUrl,
          width: doc.output.width,
          height: doc.output.height,
          durationSeconds: doc.output.durationSeconds,
        }
      : null,
    error: doc.error ? { code: doc.error.code, message: doc.error.message } : null,
    createdAt: doc.createdAt.toISOString(),
    completedAt: doc.completedAt?.toISOString() ?? null,
  };
  return doc.kind === 'image'
    ? { ...base, kind: 'image', params: doc.params }
    : { ...base, kind: 'video', params: doc.params };
}
