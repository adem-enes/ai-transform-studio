'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { type ClientErrorCode, errorCodeOf, isApiError } from '@/lib/api/errors';
import { useCreateTransformation, useTransformation } from '@/lib/api/hooks';
import { entityId, type MediaKind, type TransformationView, type TransformRequest } from '@/schemas';
import { applyFieldErrors, derivePanelState } from '../lib/panel-state';
import { type SourceMedia, sourceFromTransformation } from '../lib/source';

type TransformationOf<K extends MediaKind> = Extract<TransformationView, { kind: K }>;
type ParamsOf<K extends MediaKind> = Extract<TransformRequest, { kind: K }>['params'];

type TransformFlowOptions<K extends MediaKind, V extends FieldValues> = {
  kind: K;
  // biome-ignore lint/suspicious/noExplicitAny: the form's context and output types are the page's own.
  form: UseFormReturn<V, any, ParamsOf<K>>;
  /** Form field names, for mapping server validation errors onto fields. */
  fields: ReadonlySet<string>;
  defaultValues: V;
  /** A transformation's params as form values, for restoring from `?t=`. */
  toFormValues: (transformation: TransformationOf<K>) => V;
  /** The field "Try another …" puts focus on. */
  firstField: Path<V>;
};

/**
 * Everything a transform page does around its form, generic over the media kind:
 *
 * - the transformation id lives in the URL (`?t=`), so a refresh or a shared
 *   link restores the job — and its source and settings — instead of losing it;
 * - submit → the job is created, the URL updated and the job polled;
 * - the result panel's state, and focus: the panel heading when work starts
 *   and when it settles, the error when a submit fails;
 * - "try another", "start over" and "check again".
 */
export function useTransformFlow<K extends MediaKind, V extends FieldValues>({
  kind,
  form,
  fields,
  defaultValues,
  toFormValues,
  firstField,
}: TransformFlowOptions<K, V>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawId = searchParams.get('t');
  const validId = rawId !== null && entityId.safeParse(rawId).success;
  const transformationId = validId ? rawId : null;

  const [source, setSourceState] = useState<SourceMedia | null>(null);
  const [dropzoneKey, setDropzoneKey] = useState(0);
  const [submitError, setSubmitError] = useState<ClientErrorCode | null>(null);
  const [submitStartedAt, setSubmitStartedAt] = useState<number | null>(null);
  const { handleSubmit, setError, reset, setFocus } = form;

  const create = useCreateTransformation();
  const query = useTransformation(transformationId);
  const transformation = query.data?.kind === kind ? (query.data as TransformationOf<K>) : undefined;

  // Restoring from `?t=`: bring back the source and the settings it used, once per id.
  const restoredId = useRef<string | null>(null);
  const toFormValuesRef = useRef(toFormValues);
  toFormValuesRef.current = toFormValues;
  useEffect(() => {
    if (!transformation || restoredId.current === transformation.id) {
      return;
    }
    restoredId.current = transformation.id;
    setSourceState((current) => current ?? sourceFromTransformation(transformation));
    if (!form.formState.isDirty) {
      reset(toFormValuesRef.current(transformation));
    }
  }, [transformation, form.formState.isDirty, reset]);

  const panel = derivePanelState({
    kind,
    transformationId,
    invalidId: rawId !== null && !validId,
    submitStartedAt: create.isPending ? submitStartedAt : null,
    data: query.data,
    error: query.error,
    isPending: query.isPending,
    nowMs: Date.now(),
  });

  const headingRef = useRef<HTMLHeadingElement>(null);
  const submitErrorRef = useRef<HTMLDivElement>(null);
  // A failed submit replaces the "working" panel with nothing, so focus follows the error to the form.
  useEffect(() => {
    if (submitError) {
      submitErrorRef.current?.focus();
    }
  }, [submitError]);
  const lastPanelKind = useRef(panel.kind);
  useEffect(() => {
    const previous = lastPanelKind.current;
    lastPanelKind.current = panel.kind;
    if (previous === panel.kind) {
      return;
    }
    const started = panel.kind === 'submitting';
    const settled =
      (previous === 'submitting' || previous === 'active') &&
      (panel.kind === 'completed' || panel.kind === 'failed' || panel.kind === 'timed_out');
    if (started || settled) {
      headingRef.current?.focus();
    }
  }, [panel.kind]);

  const setSource = useCallback((next: SourceMedia | null) => {
    setSourceState(next);
    setSubmitError(null);
  }, []);

  const onSubmit = handleSubmit(async (params) => {
    if (!source || create.isPending) {
      return;
    }
    setSubmitError(null);
    setSubmitStartedAt(Date.now());
    try {
      const created = await create.mutateAsync({
        kind,
        uploadId: source.uploadId,
        params,
      } as TransformRequest);
      restoredId.current = created.id;
      router.replace(`${pathname}?t=${created.id}`, { scroll: false });
    } catch (error) {
      setSubmitStartedAt(null);
      if (isApiError(error) && error.code === 'VALIDATION_FAILED' && error.details) {
        const unmapped = applyFieldErrors(error.details, fields, (field, message) =>
          setError(field as Path<V>, { type: 'server', message }, { shouldFocus: true }),
        );
        if (unmapped === 0) {
          return;
        }
      }
      if (isApiError(error) && error.code === 'UPLOAD_NOT_FOUND') {
        setSourceState(null);
        setDropzoneKey((key) => key + 1);
      }
      setSubmitError(errorCodeOf(error));
    }
  });

  const clearResult = useCallback(() => {
    create.reset();
    setSubmitError(null);
    setSubmitStartedAt(null);
    router.replace(pathname, { scroll: false });
  }, [create, router, pathname]);

  const tryAnother = useCallback(() => {
    clearResult();
    // After the panel re-renders; the field is in the left column.
    requestAnimationFrame(() => setFocus(firstField));
  }, [clearResult, setFocus, firstField]);

  const startOver = useCallback(() => {
    clearResult();
    setSourceState(null);
    setDropzoneKey((key) => key + 1);
    reset(defaultValues);
    requestAnimationFrame(() => document.getElementById('upload-heading')?.focus());
  }, [clearResult, reset, defaultValues]);

  const busy = create.isPending || form.formState.isSubmitting;
  const stillChecking = panel.kind === 'timed_out' && panel.stillChecking;

  return {
    transformation,
    query,
    panel,
    source,
    setSource,
    dropzoneKey,
    submitError,
    onSubmit,
    headingRef,
    submitErrorRef,
    tryAnother,
    startOver,
    busy,
    /** Inputs are locked while a job is being created or is running. */
    locked: busy || panel.kind === 'active',
    connectionProblem: query.isRefetchError && query.data !== undefined,
    checkAgain: () => void query.refetch(),
    checkingAgain: query.isFetching && !stillChecking,
  };
}
