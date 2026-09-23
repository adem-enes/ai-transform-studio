import type { MediaKind, TransformationView, UploadView } from '@/schemas';

/**
 * The source a transformation will use: a fresh upload, or — when a page is
 * restored from `?t=` — the source of an earlier transformation, whose file
 * name and size are no longer known.
 */
export type SourceMedia = {
  uploadId: string;
  kind: MediaKind;
  url: string;
  width: number | null;
  height: number | null;
  /** Videos only; `null` for images and when unknown. */
  durationSeconds: number | null;
  frameRate: number | null;
  filename: string | null;
  bytes: number | null;
};

export function sourceFromUpload(upload: UploadView): SourceMedia {
  return {
    uploadId: upload.id,
    kind: upload.kind,
    url: upload.url,
    width: upload.width,
    height: upload.height,
    durationSeconds: upload.durationSeconds,
    frameRate: upload.frameRate,
    filename: upload.filename,
    bytes: upload.bytes,
  };
}

export function sourceFromTransformation(transformation: TransformationView): SourceMedia {
  return {
    uploadId: transformation.uploadId,
    kind: transformation.kind,
    url: transformation.source.url,
    width: transformation.source.width,
    height: transformation.source.height,
    durationSeconds: transformation.source.durationSeconds,
    frameRate: transformation.source.frameRate,
    filename: null,
    bytes: null,
  };
}
