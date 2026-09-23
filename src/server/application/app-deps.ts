import 'server-only';
import { logger } from '@/server/logger';
import * as repositories from '@/server/repositories';
import * as services from '@/server/services';
import type { AppDeps } from './deps';

let instance: AppDeps | undefined;

/** The production wiring: MongoDB repositories, the real SDK services, the system clock. */
export function appDeps(): AppDeps {
  instance ??= {
    transformations: {
      create: repositories.createTransformation,
      delete: repositories.deleteTransformation,
      findById: repositories.findTransformationById,
      findByIdForUser: repositories.findTransformationByIdForUser,
      findByProjectId: repositories.findTransformationByProjectId,
      markSubmitted: repositories.markTransformationSubmitted,
      transition: repositories.transition,
      listActiveByUser: repositories.listActiveTransformationsByUser,
      countActiveByUser: repositories.countActiveTransformationsByUser,
      claimReconciliation: repositories.claimReconciliation,
      listByUser: repositories.listTransformationsByUser,
    },
    uploads: {
      create: repositories.createUpload,
      findByIdForUser: repositories.findUploadByIdForUser,
    },
    storage: { uploadFromUrl: services.uploadFromUrl },
    uploadcare: { getVerifiedFile: services.getVerifiedFile, deleteFile: services.deleteUploadcareFile },
    provider: {
      submitImage: services.submitImageTransformation,
      submitVideo: services.submitVideoTransformation,
      getProjectStatus: services.getProjectStatus,
    },
    clock: { now: () => new Date() },
    logger,
  };
  return instance;
}
