import type { ClientErrorCode } from '@/lib/api/errors';

/** What the user is pointed to do next. The component rendering the error decides how to do it. */
export type ErrorAction = 'retry' | 'choose-file' | 'edit-params' | 'check-history' | 'none';

export type ErrorPresentation = {
  title: string;
  description: string;
  action: ErrorAction;
};

export const ERROR_ACTION_LABELS = {
  retry: 'Try again',
  'choose-file': 'Choose another file',
  'edit-params': 'Edit settings',
  'check-history': 'Open History',
  none: '',
} as const satisfies Record<ErrorAction, string>;

/**
 * User-facing copy for every error code. Keyed by `Record<ClientErrorCode, …>`
 * so a code added to the shared list fails the typecheck until it has copy
 * here. The server's own message is never shown: it may be terser, and a
 * provider's raw text never reaches the client anyway.
 */
const PRESENTATIONS = {
  INVALID_FILE_TYPE: {
    title: 'Unsupported file type',
    description: 'This file type isn’t supported. Choose a file in one of the formats listed.',
    action: 'choose-file',
  },
  FILE_TOO_LARGE: {
    title: 'File too large',
    description: 'This file is over the size limit. Choose a smaller file, or compress this one first.',
    action: 'choose-file',
  },
  FILE_NOT_READY: {
    title: 'Upload still processing',
    description: 'Your file is uploaded but not ready yet. Try again in a few seconds.',
    action: 'retry',
  },
  UPLOAD_NOT_FOUND: {
    title: 'Upload not found',
    description: 'We couldn’t find your uploaded file any more. Please upload it again.',
    action: 'choose-file',
  },
  STORAGE_FAILED: {
    title: 'Couldn’t save your file',
    description: 'Something went wrong while saving your file to storage. Please try again.',
    action: 'retry',
  },
  PROVIDER_REJECTED: {
    title: 'Request not accepted',
    description: 'The AI service didn’t accept these settings. Try a different prompt, model or resolution.',
    action: 'edit-params',
  },
  INSUFFICIENT_CREDITS: {
    title: 'Service out of credits',
    description:
      'The AI service this app uses has run out of credits. This isn’t something you can fix — please try again later.',
    action: 'none',
  },
  PLAN_UPGRADE_REQUIRED: {
    title: 'Option not available',
    description:
      'This model or resolution isn’t available on the AI service plan this app uses. Choose a different model or a lower resolution.',
    action: 'edit-params',
  },
  PROVIDER_UNAVAILABLE: {
    title: 'AI service unavailable',
    description: 'The AI service is temporarily unavailable. Please try again in a moment.',
    action: 'retry',
  },
  TOO_MANY_ACTIVE_JOBS: {
    title: 'Too many transformations running',
    description:
      'You already have the maximum number of transformations in progress. Wait for one to finish — you can follow them in History.',
    action: 'check-history',
  },
  TRANSFORMATION_FAILED: {
    title: 'Transformation failed',
    description: 'The AI service couldn’t complete this transformation. Try a different prompt or model.',
    action: 'edit-params',
  },
  WEBHOOK_TIMEOUT: {
    title: 'Taking longer than expected',
    description:
      'We stopped waiting for this transformation, but it may still finish. If it does, the result will appear in History.',
    action: 'check-history',
  },
  VALIDATION_FAILED: {
    title: 'Check your settings',
    description: 'Some of the values aren’t valid. Fix the highlighted fields and try again.',
    action: 'edit-params',
  },
  INVALID_SIGNATURE: {
    title: 'Request not trusted',
    description: 'This request couldn’t be verified. Reload the page and try again.',
    action: 'retry',
  },
  PAYLOAD_TOO_LARGE: {
    title: 'Request too large',
    description: 'What you submitted is too large. Shorten the prompt and try again.',
    action: 'edit-params',
  },
  NOT_FOUND: {
    title: 'Not found',
    description:
      'We couldn’t find this transformation. It may belong to another browser, or the link may be wrong.',
    action: 'none',
  },
  INTERNAL: {
    title: 'Something went wrong',
    description: 'Something went wrong on our side. Please try again.',
    action: 'retry',
  },
  NETWORK_ERROR: {
    title: 'You seem to be offline',
    description: 'We couldn’t reach the server. Check your internet connection and try again.',
    action: 'retry',
  },
  UPLOAD_FAILED: {
    title: 'Upload failed',
    description: 'Your file couldn’t be uploaded. Please try again.',
    action: 'retry',
  },
} as const satisfies Record<ClientErrorCode, ErrorPresentation>;

/**
 * Failures that happen after Magic Hour accepted the job — so its credits may
 * already have been charged. (Magic Hour refunds renders that fail on its
 * side, but the app cannot confirm that for the user.)
 */
const CREDITS_MAY_BE_SPENT: ReadonlySet<ClientErrorCode> = new Set<ClientErrorCode>([
  'TRANSFORMATION_FAILED',
  'WEBHOOK_TIMEOUT',
]);

export const CREDITS_SPENT_NOTE =
  'Credits may already have been used for this attempt, because the AI service had accepted the job.';

export function getErrorPresentation(code: ClientErrorCode): ErrorPresentation {
  return PRESENTATIONS[code];
}

export function mayHaveSpentCredits(code: ClientErrorCode): boolean {
  return CREDITS_MAY_BE_SPENT.has(code);
}
