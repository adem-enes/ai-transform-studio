import { z } from 'zod';
import { apiError } from './errors';
import { mediaKind } from './media';
import { imageTransformSpec, videoTransformSpec } from './transform-params';
import { transformationStatus } from './transformation';

/** A MongoDB ObjectId as it travels over the API. */
export const entityId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id.');

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

/** Client → server once the Uploadcare widget reports a finished upload. */
export const uploadRequest = z.object({
  uploadcareUuid: z.uuid(),
  kind: mediaKind,
});
export type UploadRequest = z.infer<typeof uploadRequest>;

export const uploadView = z.object({
  id: entityId,
  kind: mediaKind,
  filename: z.string(),
  mime: z.string(),
  bytes: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
  url: z.url(),
  createdAt: z.iso.datetime(),
});
export type UploadView = z.infer<typeof uploadView>;

export const uploadResponse = z.object({ upload: uploadView });
export type UploadResponse = z.infer<typeof uploadResponse>;

// ---------------------------------------------------------------------------
// Transformations
// ---------------------------------------------------------------------------

export const transformRequest = z.discriminatedUnion('kind', [
  imageTransformSpec.extend({ uploadId: entityId }),
  videoTransformSpec.extend({ uploadId: entityId }),
]);
export type TransformRequest = z.infer<typeof transformRequest>;

const transformationViewBase = z.object({
  id: entityId,
  status: transformationStatus,
  source: z.object({
    url: z.url(),
    mime: z.string(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    durationSeconds: z.number().nonnegative().nullable(),
  }),
  output: z.object({ url: z.url() }).nullable(),
  error: apiError.nullable(),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});

/** What the UI sees of a transformation — no provider ids, raw errors or storage keys. */
export const transformationView = z.discriminatedUnion('kind', [
  transformationViewBase.extend(imageTransformSpec.shape),
  transformationViewBase.extend(videoTransformSpec.shape),
]);
export type TransformationView = z.infer<typeof transformationView>;

export const transformResponse = z.object({ transformation: transformationView });
export type TransformResponse = z.infer<typeof transformResponse>;

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export const HISTORY_PAGE_SIZE = { default: 20, max: 50 } as const;

export const historyQuery = z.object({
  cursor: z.string().min(1).optional(),
  kind: mediaKind.optional(),
  limit: z.coerce.number().int().min(1).max(HISTORY_PAGE_SIZE.max).default(HISTORY_PAGE_SIZE.default),
});
export type HistoryQuery = z.infer<typeof historyQuery>;

export const historyResponse = z.object({
  items: z.array(transformationView),
  /** Opaque; pass back as `cursor` for the next page. `null` on the last page. */
  nextCursor: z.string().nullable(),
});
export type HistoryResponse = z.infer<typeof historyResponse>;
