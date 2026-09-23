import 'server-only';
import type { ObjectId } from 'mongodb';
import type { ImageTransformParams, MediaKind, TransformationStatus, VideoTransformParams } from '@/schemas';
import type { TransformationDoc, UploadDoc } from '@/server/db/models';
import type { Logger } from '@/server/logger';
import type {
  NewTransformation,
  NewUpload,
  TransformationPage,
  TransitionPatch,
} from '@/server/repositories';
import type {
  ProjectStatus,
  StoredAsset,
  SubmitInput,
  SubmittedProject,
  UploadFromUrlOptions,
  VerifiedFile,
} from '@/server/services';

/**
 * Everything the workflow touches outside its own logic. Application
 * functions take these as a parameter; `appDeps()` wires the real
 * implementations and tests pass in-memory fakes (see `./testing`).
 */

export type TransformationStore = {
  create(input: NewTransformation): Promise<TransformationDoc>;
  delete(id: ObjectId): Promise<void>;
  findById(id: ObjectId): Promise<TransformationDoc | null>;
  findByIdForUser(id: string, userId: string): Promise<TransformationDoc | null>;
  findByProjectId(projectId: string): Promise<TransformationDoc | null>;
  markSubmitted(
    id: ObjectId,
    submission: { projectId: string; creditsCharged: number; submittedAt: Date },
  ): Promise<TransformationDoc | null>;
  transition(
    id: ObjectId,
    from: readonly TransformationStatus[],
    to: TransformationStatus,
    patch?: TransitionPatch,
  ): Promise<TransformationDoc | null>;
  listActiveByUser(userId: string): Promise<TransformationDoc[]>;
  countActiveByUser(userId: string): Promise<number>;
  claimReconciliation(id: ObjectId, now: Date, minIntervalMs: number): Promise<TransformationDoc | null>;
  listByUser(query: {
    userId: string;
    kind?: MediaKind;
    cursor?: string;
    limit: number;
  }): Promise<TransformationPage>;
};

export type UploadStore = {
  create(input: NewUpload): Promise<UploadDoc>;
  findByIdForUser(id: string, userId: string): Promise<UploadDoc | null>;
};

export type MediaStorage = {
  uploadFromUrl(url: string, options: UploadFromUrlOptions): Promise<StoredAsset>;
};

/** Uploadcare, the transit step between the browser and Cloudinary. */
export type UploadInbox = {
  getVerifiedFile(uuid: string, kind: MediaKind): Promise<VerifiedFile>;
  /** Removes a file once it has been copied to Cloudinary, the storage of record. */
  deleteFile(uuid: string): Promise<void>;
};

export type TransformProvider = {
  /** Spends credits. Never retried — the API has no idempotency key. */
  submitImage(input: SubmitInput<ImageTransformParams>): Promise<SubmittedProject>;
  /** Spends credits. Never retried — the API has no idempotency key. */
  submitVideo(input: SubmitInput<VideoTransformParams>): Promise<SubmittedProject>;
  getProjectStatus(kind: MediaKind, projectId: string): Promise<ProjectStatus>;
};

export type Clock = { now(): Date };

export type AppDeps = {
  transformations: TransformationStore;
  uploads: UploadStore;
  storage: MediaStorage;
  uploadcare: UploadInbox;
  provider: TransformProvider;
  clock: Clock;
  logger: Logger;
};
