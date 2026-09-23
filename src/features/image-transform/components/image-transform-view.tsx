'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon, SparklesIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Resolver, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { FileDropzone } from '@/features/transform-core/components/file-dropzone';
import { ratioOf } from '@/features/transform-core/components/media-frame';
import { TransformationError } from '@/features/transform-core/components/transformation-error';
import { type SourceMedia, sourceFromTransformation } from '@/features/transform-core/lib/source';
import { type ClientErrorCode, errorCodeOf, isApiError } from '@/lib/api/errors';
import { useCreateTransformation, useTransformation } from '@/lib/api/hooks';
import { shouldPoll } from '@/lib/api/polling';
import {
  entityId,
  type ImageTransformParams,
  imageTransformParams,
  type TransformationView,
} from '@/schemas';
import { describeCost } from '../config/models';
import {
  AspectRatioField,
  type ImageFormValues,
  ModelField,
  PromptField,
  ResolutionField,
  resolutionResetNote,
} from './params-fields';
import { type PanelState, ResultPanel } from './result-panel';

const DEFAULT_VALUES: ImageFormValues = {
  prompt: '',
  model: 'default',
  aspect_ratio: 'auto',
  resolution: '1k',
};

const FORM_FIELDS = new Set<string>(Object.keys(DEFAULT_VALUES));

/**
 * The Image-to-Image page: upload → parameters → submit → live status →
 * result. The transformation id lives in the URL (`?t=`), so a refresh or a
 * shared link restores the job instead of losing it.
 */
export function ImageTransformView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawId = searchParams.get('t');
  const validId = rawId !== null && entityId.safeParse(rawId).success;
  const transformationId = validId ? rawId : null;

  const [source, setSource] = useState<SourceMedia | null>(null);
  const [dropzoneKey, setDropzoneKey] = useState(0);
  const [resetNote, setResetNote] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<ClientErrorCode | null>(null);
  const [submitStartedAt, setSubmitStartedAt] = useState<number | null>(null);

  const form = useForm<ImageFormValues, unknown, ImageTransformParams>({
    // The schema's input type has optional (defaulted) fields; the form always holds all of them.
    resolver: zodResolver(imageTransformParams) as Resolver<ImageFormValues, unknown, ImageTransformParams>,
    defaultValues: DEFAULT_VALUES,
    mode: 'onTouched',
  });
  const { control, setValue, getValues, handleSubmit, setError, reset, setFocus } = form;

  const create = useCreateTransformation();
  const query = useTransformation(transformationId);
  const transformation = query.data?.kind === 'image' ? query.data : undefined;

  // Restoring from `?t=`: bring back the source and the settings it used, once per id.
  const restoredId = useRef<string | null>(null);
  useEffect(() => {
    if (!transformation || restoredId.current === transformation.id) {
      return;
    }
    restoredId.current = transformation.id;
    setSource((current) => current ?? sourceFromTransformation(transformation));
    if (!form.formState.isDirty) {
      reset(transformation.params);
    }
  }, [transformation, form.formState.isDirty, reset]);

  const panel = panelState({
    transformationId,
    invalidId: rawId !== null && !validId,
    submitting: create.isPending && submitStartedAt !== null,
    submitStartedAt,
    transformation,
    wrongKind: query.data !== undefined && query.data.kind !== 'image',
    error: query.error,
    isPending: query.isPending,
  });

  // Focus: the panel heading when work starts, and again when it settles.
  const headingRef = useRef<HTMLHeadingElement>(null);
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

  const onModelChange = useCallback(
    (model: ImageFormValues['model']) => {
      const { next, note } = resolutionResetNote(model, getValues('resolution'));
      if (note) {
        setValue('resolution', next, { shouldValidate: true, shouldDirty: true });
      }
      setResetNote(note);
    },
    [getValues, setValue],
  );

  const onSubmit = handleSubmit(async (params) => {
    if (!source || create.isPending) {
      return;
    }
    setSubmitError(null);
    setSubmitStartedAt(Date.now());
    try {
      const created = await create.mutateAsync({ kind: 'image', uploadId: source.uploadId, params });
      restoredId.current = created.id;
      router.replace(`${pathname}?t=${created.id}`, { scroll: false });
    } catch (error) {
      setSubmitStartedAt(null);
      if (isApiError(error) && error.code === 'VALIDATION_FAILED' && error.details) {
        const unmapped = applyFieldErrors(error.details, (field, message) =>
          setError(field, { type: 'server', message }, { shouldFocus: true }),
        );
        if (unmapped === 0) {
          return;
        }
      }
      if (isApiError(error) && error.code === 'UPLOAD_NOT_FOUND') {
        setSource(null);
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

  const onTryAnotherPrompt = useCallback(() => {
    clearResult();
    // After the panel re-renders; the textarea is in the left column.
    requestAnimationFrame(() => setFocus('prompt'));
  }, [clearResult, setFocus]);

  const onStartOver = useCallback(() => {
    clearResult();
    setSource(null);
    setDropzoneKey((key) => key + 1);
    setResetNote(null);
    reset(DEFAULT_VALUES);
    requestAnimationFrame(() => document.getElementById('upload-heading')?.focus());
  }, [clearResult, reset]);

  const busy = create.isPending || form.formState.isSubmitting;
  const locked = busy || panel.kind === 'active';
  const model = form.watch('model');
  const aspectRatio = form.watch('aspect_ratio');
  const resultRatio = expectedRatio(transformation ?? null, aspectRatio, source);
  const stillChecking = panel.kind === 'timed_out' && panel.stillChecking;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <form onSubmit={onSubmit} noValidate className="min-w-0 space-y-8" aria-label="Image transformation">
        <section aria-labelledby="upload-heading" className="space-y-3">
          <h2
            id="upload-heading"
            tabIndex={-1}
            className="text-lg font-semibold tracking-tight focus:outline-none"
          >
            1. Upload an image
          </h2>
          <FileDropzone
            key={dropzoneKey}
            kind="image"
            value={source}
            labelledBy="upload-heading"
            disabled={locked}
            onChange={(next) => {
              setSource(next);
              setSubmitError(null);
            }}
          />
        </section>

        <section aria-labelledby="params-heading" className="space-y-4">
          <h2 id="params-heading" className="text-lg font-semibold tracking-tight">
            2. Describe the change
          </h2>
          <FieldGroup>
            <PromptField control={control} setValue={setValue} disabled={locked} />
            <ModelField control={control} disabled={locked} onModelChange={onModelChange} />
            <AspectRatioField control={control} disabled={locked} />
            <ResolutionField control={control} disabled={locked} resetNote={resetNote} />
          </FieldGroup>
        </section>

        <div className="space-y-3 border-t pt-6">
          <p className="text-sm">
            <span className="text-muted-foreground">Estimated cost: </span>
            <span className="font-medium">{describeCost(model)}</span>
          </p>
          {submitError ? (
            <TransformationError
              code={submitError}
              actions={{
                retry: () => void onSubmit(),
                'edit-params': () => setFocus('prompt'),
                'choose-file': () => document.getElementById('upload-heading')?.focus(),
              }}
            />
          ) : null}
          <Button
            type="submit"
            size="lg"
            className="h-11 w-full sm:w-auto sm:px-6"
            disabled={!source || locked}
            aria-describedby={source ? undefined : 'submit-hint'}
          >
            {busy ? (
              <>
                <Loader2Icon aria-hidden="true" className="motion-safe:animate-spin" />
                Starting…
              </>
            ) : (
              <>
                <SparklesIcon aria-hidden="true" />
                Transform image
              </>
            )}
          </Button>
          {source ? null : (
            <p id="submit-hint" className="text-sm text-muted-foreground">
              Upload an image first.
            </p>
          )}
          {panel.kind === 'active' ? (
            <p className="text-sm text-muted-foreground">
              Settings are locked while this transformation runs.
            </p>
          ) : null}
        </div>
      </form>

      <div className="min-w-0 lg:sticky lg:top-20">
        <ResultPanel
          ref={headingRef}
          state={panel}
          source={source}
          resultRatio={resultRatio}
          connectionProblem={query.isRefetchError && query.data !== undefined}
          onTryAnotherPrompt={onTryAnotherPrompt}
          onStartOver={onStartOver}
          onCheckAgain={() => void query.refetch()}
          checkingAgain={query.isFetching && !stillChecking}
        />
      </div>
    </div>
  );
}

function panelState({
  transformationId,
  invalidId,
  submitting,
  submitStartedAt,
  transformation,
  wrongKind,
  error,
  isPending,
}: {
  transformationId: string | null;
  invalidId: boolean;
  submitting: boolean;
  submitStartedAt: number | null;
  transformation: TransformationView | undefined;
  wrongKind: boolean;
  error: unknown;
  isPending: boolean;
}): PanelState {
  if (submitting && submitStartedAt !== null) {
    return { kind: 'submitting', startedAt: submitStartedAt };
  }
  if (invalidId) {
    return { kind: 'load-error', code: 'NOT_FOUND' };
  }
  if (!transformationId) {
    return { kind: 'empty' };
  }
  if (wrongKind) {
    return { kind: 'load-error', code: 'NOT_FOUND' };
  }
  if (!transformation) {
    return isPending && !error ? { kind: 'loading' } : { kind: 'load-error', code: errorCodeOf(error) };
  }
  switch (transformation.status) {
    case 'completed':
      return { kind: 'completed', transformation };
    case 'failed':
      return { kind: 'failed', transformation };
    case 'timed_out':
      return { kind: 'timed_out', transformation, stillChecking: shouldPoll(transformation, Date.now()) };
    default:
      return { kind: 'active', transformation };
  }
}

/**
 * Server field errors (`params.prompt` → `prompt`) onto the form. Returns how
 * many messages had no matching field, which the caller shows as a general error.
 */
function applyFieldErrors(
  details: Record<string, string[]>,
  apply: (field: keyof ImageFormValues, message: string) => void,
): number {
  let unmapped = 0;
  for (const [path, messages] of Object.entries(details)) {
    const field = path.replace(/^params\./, '');
    const message = messages[0];
    if (FORM_FIELDS.has(field) && message) {
      apply(field as keyof ImageFormValues, message);
    } else {
      unmapped += 1;
    }
  }
  return unmapped;
}

/** The result's expected shape: the requested ratio, else the source's; 1:1 when neither is known. */
function expectedRatio(
  transformation: TransformationView | null,
  formRatio: ImageFormValues['aspect_ratio'],
  source: SourceMedia | null,
): number {
  const ratio = transformation?.kind === 'image' ? transformation.params.aspect_ratio : formRatio;
  if (ratio !== 'auto') {
    const [w = 1, h = 1] = ratio.split(':').map(Number);
    return w / h;
  }
  const width = transformation?.source.width ?? source?.width;
  const height = transformation?.source.height ?? source?.height;
  return ratioOf(width, height, 1);
}
