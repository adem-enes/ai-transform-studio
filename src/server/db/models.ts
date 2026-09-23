import 'server-only';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import {
  errorCode,
  imageTransformParams,
  mediaKind,
  transformationStatus,
  videoTransformParams,
} from '@/schemas';

/**
 * Stored document shapes. These schemas are the single source of truth: the
 * TypeScript types are inferred from them and repositories parse every
 * document they read, so a drifted document fails loudly rather than
 * rendering half-populated.
 */

const objectId = z.instanceof(ObjectId);
const dimension = z.number().int().positive().nullable();
const durationSeconds = z.number().nonnegative().nullable();
/** Frames per second of a video. Added after launch, so older documents read as `null`. */
const frameRate = z.number().positive().nullable().default(null);

// ---------------------------------------------------------------------------
// uploads
// ---------------------------------------------------------------------------

export const uploadDoc = z.object({
  _id: objectId,
  userId: z.string().min(1),
  kind: mediaKind,
  uploadcareUuid: z.string(),
  originalFilename: z.string(),
  mime: z.string(),
  bytes: z.number().int().nonnegative(),
  width: dimension,
  height: dimension,
  durationSeconds,
  frameRate,
  cloudinary: z.object({
    publicId: z.string(),
    secureUrl: z.url(),
    resourceType: mediaKind,
  }),
  createdAt: z.date(),
});
export type UploadDoc = z.infer<typeof uploadDoc>;

// ---------------------------------------------------------------------------
// transformations
// ---------------------------------------------------------------------------

export const transformationProvider = z.object({
  /** Magic Hour project id. `null` until the create call returns. */
  projectId: z.string().nullable(),
  creditsCharged: z.number().int().nullable(),
  /** Whatever Magic Hour reported on failure, kept for debugging. Never sent to clients. */
  rawError: z.record(z.string(), z.unknown()).nullable(),
});
export type TransformationProvider = z.infer<typeof transformationProvider>;

/**
 * The stored result. Dimensions and duration are Cloudinary's figures for the
 * copied file; outputs finalized before they were recorded read as `null`.
 */
export const transformationOutput = z.object({
  publicId: z.string(),
  secureUrl: z.url(),
  width: dimension.default(null),
  height: dimension.default(null),
  durationSeconds: durationSeconds.default(null),
});
export type TransformationOutput = z.infer<typeof transformationOutput>;

export const transformationError = z.object({
  code: errorCode,
  message: z.string(),
});
export type TransformationError = z.infer<typeof transformationError>;

const transformationBase = z.object({
  _id: objectId,
  userId: z.string().min(1),
  uploadId: objectId,
  /** Snapshot of the source at submission, so history survives the upload being deleted. */
  source: z.object({
    secureUrl: z.url(),
    mime: z.string(),
    width: dimension,
    height: dimension,
    durationSeconds,
    frameRate,
  }),
  status: transformationStatus,
  provider: transformationProvider,
  output: transformationOutput.nullable(),
  error: transformationError.nullable(),
  createdAt: z.date(),
  submittedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  /**
   * Last time a status poll claimed a provider check for this document (see
   * `claimReconciliation`). Documents written before the field existed read as `null`.
   */
  lastReconciledAt: z.date().nullable().default(null),
  updatedAt: z.date(),
});

export const transformationDoc = z.discriminatedUnion('kind', [
  transformationBase.extend({ kind: z.literal('image'), params: imageTransformParams }),
  transformationBase.extend({ kind: z.literal('video'), params: videoTransformParams }),
]);
export type TransformationDoc = z.infer<typeof transformationDoc>;
