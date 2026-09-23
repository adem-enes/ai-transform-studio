import 'server-only';
import { createHmac } from 'node:crypto';

/**
 * Long enough for a 50 MB multipart upload on a slow connection (the
 * signature is checked when each request starts, including the last part's),
 * short enough that a leaked one is soon useless.
 */
export const UPLOAD_SIGNATURE_TTL_SECONDS = 30 * 60;

/**
 * Uploadcare signed uploads (https://uploadcare.com/docs/security/secure-uploads/):
 *
 *   signature = hex( HMAC-SHA256( secret key, String(expire) ) )
 *
 * with `expire` in Unix seconds. Pure: the clock and key are parameters.
 */
export function signUpload(secretKey: string, nowMs: number): { signature: string; expire: number } {
  const expire = Math.floor(nowMs / 1000) + UPLOAD_SIGNATURE_TTL_SECONDS;
  const signature = createHmac('sha256', secretKey).update(String(expire)).digest('hex');
  return { signature, expire };
}
