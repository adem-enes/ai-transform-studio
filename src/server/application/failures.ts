import 'server-only';
import { ERROR_MESSAGES, type ErrorCode } from '@/schemas';
import type { TransformationError } from '@/server/db/models';

/** The client-facing error stored on a failed or timed-out transformation. */
export function storedError(code: ErrorCode, message: string = ERROR_MESSAGES[code]): TransformationError {
  return { code, message };
}
