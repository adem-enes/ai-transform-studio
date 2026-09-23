'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useState } from 'react';
import { type Resolver, useForm } from 'react-hook-form';
import { FieldGroup } from '@/components/ui/field';
import { CompareView } from '@/features/transform-core/components/compare-view';
import { FileDropzone } from '@/features/transform-core/components/file-dropzone';
import { MediaFrame, ratioOf } from '@/features/transform-core/components/media-frame';
import { ResultActions } from '@/features/transform-core/components/result-actions';
import { ResultPanel } from '@/features/transform-core/components/result-panel';
import { SubmitBar } from '@/features/transform-core/components/submit-bar';
import { useTransformFlow } from '@/features/transform-core/hooks/use-transform-flow';
import { truncate } from '@/features/transform-core/lib/format';
import { resultRatio } from '@/features/transform-core/lib/result-ratio';
import type { SourceMedia } from '@/features/transform-core/lib/source';
import { type ImageTransformParams, imageTransformParams } from '@/schemas';
import { describeCost } from '../config/models';
import {
  AspectRatioField,
  type ImageFormValues,
  ModelField,
  PromptField,
  ResolutionField,
  resolutionResetNote,
} from './params-fields';

const DEFAULT_VALUES: ImageFormValues = {
  prompt: '',
  model: 'default',
  aspect_ratio: 'auto',
  resolution: '1k',
};

const FORM_FIELDS: ReadonlySet<string> = new Set(Object.keys(DEFAULT_VALUES));

/**
 * The Image-to-Image page: upload → parameters → submit → live status →
 * result. The transformation id lives in the URL (`?t=`), so a refresh or a
 * shared link restores the job instead of losing it.
 */
export function ImageTransformView() {
  const [resetNote, setResetNote] = useState<string | null>(null);

  const form = useForm<ImageFormValues, unknown, ImageTransformParams>({
    // The schema's input type has optional (defaulted) fields; the form always holds all of them.
    resolver: zodResolver(imageTransformParams) as Resolver<ImageFormValues, unknown, ImageTransformParams>,
    defaultValues: DEFAULT_VALUES,
    mode: 'onTouched',
  });
  const { control, setValue, getValues, setFocus } = form;

  const flow = useTransformFlow({
    kind: 'image',
    form,
    fields: FORM_FIELDS,
    defaultValues: DEFAULT_VALUES,
    toFormValues: (transformation) => transformation.params,
    firstField: 'prompt',
  });
  const { panel, source } = flow;

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

  const onStartOver = useCallback(() => {
    setResetNote(null);
    flow.startOver();
  }, [flow.startOver]);

  const model = form.watch('model');
  const aspectRatio = form.watch('aspect_ratio');

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <form
        onSubmit={flow.onSubmit}
        noValidate
        className="min-w-0 space-y-8"
        aria-label="Image transformation"
      >
        <section aria-labelledby="upload-heading" className="space-y-3">
          <h2
            id="upload-heading"
            tabIndex={-1}
            className="text-lg font-semibold tracking-tight focus:outline-none"
          >
            1. Upload an image
          </h2>
          <FileDropzone
            key={flow.dropzoneKey}
            kind="image"
            value={source}
            labelledBy="upload-heading"
            disabled={flow.locked}
            onChange={flow.setSource}
          />
        </section>

        <section aria-labelledby="params-heading" className="space-y-4">
          <h2 id="params-heading" className="text-lg font-semibold tracking-tight">
            2. Describe the change
          </h2>
          <FieldGroup>
            <PromptField control={control} setValue={setValue} disabled={flow.locked} />
            <ModelField control={control} disabled={flow.locked} onModelChange={onModelChange} />
            <AspectRatioField control={control} disabled={flow.locked} />
            <ResolutionField control={control} disabled={flow.locked} resetNote={resetNote} />
          </FieldGroup>
        </section>

        <SubmitBar
          kind="image"
          costLabel={describeCost(model)}
          submitError={flow.submitError}
          submitErrorRef={flow.submitErrorRef}
          errorActions={{
            retry: () => void flow.onSubmit(),
            'edit-params': () => setFocus('prompt'),
            'choose-file': () => document.getElementById('upload-heading')?.focus(),
          }}
          hasSource={source !== null}
          busy={flow.busy}
          locked={flow.locked}
          active={panel.kind === 'active'}
          rerun={panel.kind === 'completed'}
        />
      </form>

      <div className="min-w-0 lg:sticky lg:top-20">
        <ResultPanel
          ref={flow.headingRef}
          kind="image"
          state={panel}
          placeholderRatio={requestedRatio(aspectRatio, source)}
          emptyMessage={
            source ? 'Describe the change and select Transform.' : 'Upload an image to get started.'
          }
          tryAnotherLabel="Try another prompt"
          estimateOf={(transformation) =>
            transformation.kind === 'image' ? describeCost(transformation.params.model) : ''
          }
          renderCompleted={(transformation, afterActions) => (
            <div className="space-y-4">
              <CompareView
                before={{ url: transformation.source.url, alt: 'Original image' }}
                after={{
                  url: transformation.output.url,
                  alt:
                    transformation.kind === 'image'
                      ? `Result for prompt: ${truncate(transformation.params.prompt, 140)}`
                      : 'Result',
                }}
                aspectRatio={resultRatio(transformation)}
              />
              <ResultActions
                url={transformation.output.url}
                downloadName={`ai-transform-${transformation.id}`}
              />
              <div className="flex flex-wrap gap-2 border-t pt-4">{afterActions}</div>
            </div>
          )}
          renderTimedOutSource={(transformation) => (
            <MediaFrame
              src={transformation.source.url}
              alt="Original image"
              aspectRatio={ratioOf(transformation.source.width, transformation.source.height)}
              sizes="(min-width: 1024px) 480px, 100vw"
              className="max-h-64"
            />
          )}
          connectionProblem={flow.connectionProblem}
          onTryAnother={flow.tryAnother}
          onStartOver={onStartOver}
          onCheckAgain={flow.checkAgain}
          checkingAgain={flow.checkingAgain}
        />
      </div>
    </div>
  );
}

/** The empty placeholder's shape before anything is submitted: the chosen ratio, else the source's. */
function requestedRatio(ratio: ImageFormValues['aspect_ratio'], source: SourceMedia | null): number {
  if (ratio !== 'auto') {
    const [w = 1, h = 1] = ratio.split(':').map(Number);
    return w / h;
  }
  return ratioOf(source?.width, source?.height, 1);
}
