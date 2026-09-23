import { NetworkError, uploadFile } from '@uploadcare/upload-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { registerUpload } from '@/lib/api/endpoints';
import { ApiError, type ClientErrorCode, errorCodeOf } from '@/lib/api/errors';
import { clientEnv } from '@/lib/env/client';
import type { MediaKind, UploadView } from '@/schemas';
import { validateFile } from '../lib/file-validation';

/**
 * The in-flight part of an upload. "Ready" is not a phase here: once stored,
 * the upload is handed to the parent, which owns the chosen source.
 */
export type UploadPhase =
  | { phase: 'idle' }
  | { phase: 'uploading'; file: File; previewUrl: string | null; progress: number | null }
  | { phase: 'storing'; file: File; previewUrl: string | null }
  | {
      phase: 'error';
      code: ClientErrorCode;
      /** A more specific line than the presentation, e.g. the client-side size check. */
      detail: string | null;
      file: File | null;
      previewUrl: string | null;
      /** Repeats the step that failed — re-upload, or just re-register an already uploaded file. */
      retry: (() => void) | null;
    };

type Callbacks = {
  onUploaded: (upload: UploadView) => void;
  /** A new file was chosen: the previous source no longer applies. */
  onStart: () => void;
  /** The user cancelled: whatever was chosen before may apply again. */
  onCancel: () => void;
};

/**
 * Validate → upload to Uploadcare (real byte progress, cancellable) →
 * register with POST /api/upload, which copies the file into Cloudinary.
 * Starting a new file aborts whatever is in flight; a superseded request's
 * result is ignored.
 */
export function useFileUpload(kind: MediaKind, callbacks: Callbacks) {
  const [state, setState] = useState<UploadPhase>({ phase: 'idle' });
  const controllerRef = useRef<AbortController | null>(null);
  const previewRef = useRef<string | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const releasePreview = useCallback(() => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      releasePreview();
    },
    [releasePreview],
  );

  const register = useCallback(
    async (file: File, previewUrl: string | null, uploadcareUuid: string) => {
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ phase: 'storing', file, previewUrl });
      try {
        const upload = await registerUpload({ uploadcareUuid, kind }, controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        setState({ phase: 'idle' });
        releasePreview();
        callbacksRef.current.onUploaded(upload);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setState({
          phase: 'error',
          code: errorCodeOf(error),
          detail: null,
          file,
          previewUrl,
          retry: () => void register(file, previewUrl, uploadcareUuid),
        });
      }
    },
    [kind, releasePreview],
  );

  const upload = useCallback(
    async (file: File, previewUrl: string | null) => {
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ phase: 'uploading', file, previewUrl, progress: 0 });

      let uuid: string;
      try {
        const publicKey = clientEnv().NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY;
        if (!publicKey) {
          throw new ApiError(
            'INTERNAL',
            'Uploads are not configured (NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY is missing).',
          );
        }
        const result = await uploadFile(file, {
          publicKey,
          store: 'auto',
          fileName: file.name,
          contentType: file.type,
          signal: controller.signal,
          onProgress: (progress) => {
            if (controller.signal.aborted) {
              return;
            }
            setState((current) =>
              current.phase === 'uploading'
                ? { ...current, progress: progress.isComputable ? progress.value : null }
                : current,
            );
          },
        });
        uuid = result.uuid;
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setState({
          phase: 'error',
          code: uploadErrorCode(error),
          detail: null,
          file,
          previewUrl,
          retry: () => void upload(file, previewUrl),
        });
        return;
      }
      if (!controller.signal.aborted) {
        await register(file, previewUrl, uuid);
      }
    },
    [register],
  );

  const start = useCallback(
    (file: File) => {
      controllerRef.current?.abort();
      releasePreview();
      callbacksRef.current.onStart();

      const check = validateFile(file, kind);
      if (!check.ok) {
        setState({
          phase: 'error',
          code: check.code,
          detail: check.message,
          file,
          previewUrl: null,
          retry: null,
        });
        return;
      }
      const previewUrl = kind === 'image' ? URL.createObjectURL(file) : null;
      previewRef.current = previewUrl;
      void upload(file, previewUrl);
    },
    [kind, releasePreview, upload],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    releasePreview();
    setState({ phase: 'idle' });
    callbacksRef.current.onCancel();
  }, [releasePreview]);

  /** Back to idle without restoring anything — e.g. after an error the user dismisses. */
  const reset = useCallback(() => {
    controllerRef.current?.abort();
    releasePreview();
    setState({ phase: 'idle' });
  }, [releasePreview]);

  return { state, start, cancel, reset };
}

function uploadErrorCode(error: unknown): ClientErrorCode {
  if (error instanceof ApiError) {
    return error.code;
  }
  return error instanceof NetworkError ? 'NETWORK_ERROR' : 'UPLOAD_FAILED';
}
