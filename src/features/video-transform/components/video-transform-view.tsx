'use client';

import { useCallback, useRef } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { FieldGroup } from '@/components/ui/field';
import { FileDropzone } from '@/features/transform-core/components/file-dropzone';
import { ratioOf } from '@/features/transform-core/components/media-frame';
import { ResultActions } from '@/features/transform-core/components/result-actions';
import { ResultPanel } from '@/features/transform-core/components/result-panel';
import { SubmitBar } from '@/features/transform-core/components/submit-bar';
import { VideoPlayer } from '@/features/transform-core/components/video-player';
import { useTransformFlow } from '@/features/transform-core/hooks/use-transform-flow';
import type { SourceMedia } from '@/features/transform-core/lib/source';
import { videoClipUrl, videoPosterUrl } from '@/lib/media/cloudinary';
import type { VideoTransformParams } from '@/schemas';
import {
  type Clip,
  type ClipBounds,
  clipLength,
  DEFAULT_MAX_CLIP,
  defaultClip,
  fitClip,
  formatSeconds,
} from '../lib/clip';
import { describeVideoCost, estimateVideoCost, VIDEO_CREDITS_PER_FRAME } from '../lib/cost';
import {
  toVideoFormValues,
  VIDEO_FIELDS,
  type VideoFormContext,
  type VideoFormValues,
  videoFormResolver,
} from '../lib/video-form';
import { ClipSelector } from './clip-selector';
import { ArtStyleField, FpsField, ModelField, PromptFields, VersionField } from './params-fields';
import { VideoResult } from './video-result';

const DEFAULT_VALUES: VideoFormValues = {
  start_seconds: 0,
  end_seconds: DEFAULT_MAX_CLIP,
  fps_resolution: 'HALF',
  art_style: '',
  model: 'default',
  version: 'default',
  prompt_type: 'default',
  prompt: '',
};

function boundsOf(source: SourceMedia | null): ClipBounds {
  return { duration: source?.durationSeconds ?? null, maxLength: DEFAULT_MAX_CLIP };
}

/**
 * The Video-to-Video page: upload → clip → style → submit → live status →
 * result. Mirrors the image page (same flow hook, panel and submit bar), so
 * `?t=` restores a job here too.
 */
export function VideoTransformView() {
  const sourceVideoRef = useRef<HTMLVideoElement>(null);

  // The resolver checks the clip against the source's length, which it reads from the context.
  const context = useRef<VideoFormContext>({ durationSeconds: null });
  const form = useForm<VideoFormValues, VideoFormContext, VideoTransformParams>({
    resolver: (values, _context, options) => videoFormResolver(values, context.current, options),
    defaultValues: DEFAULT_VALUES,
    mode: 'onTouched',
  });
  const { control, setValue, setFocus, getValues, formState } = form;

  const flow = useTransformFlow({
    kind: 'video',
    form,
    fields: VIDEO_FIELDS,
    defaultValues: DEFAULT_VALUES,
    toFormValues: (transformation) => toVideoFormValues(transformation.params),
    firstField: 'art_style',
  });
  const { panel, source } = flow;
  context.current = { durationSeconds: source?.durationSeconds ?? null };
  const bounds = boundsOf(source);

  const [start, end, fps] = useWatch({ control, name: ['start_seconds', 'end_seconds', 'fps_resolution'] });
  const clip: Clip = { start, end };

  const setClip = useCallback(
    (next: Clip) => {
      const options = { shouldDirty: true, shouldValidate: formState.isSubmitted };
      setValue('start_seconds', next.start, options);
      setValue('end_seconds', next.end, options);
    },
    [setValue, formState.isSubmitted],
  );

  const onSourceChange = useCallback(
    (next: SourceMedia | null, fresh: boolean) => {
      flow.setSource(next);
      if (!next) {
        return;
      }
      const nextBounds = boundsOf(next);
      // A new upload starts from the default clip; a restored one keeps the clip, fitted to its length.
      setClip(
        fresh
          ? defaultClip(nextBounds)
          : fitClip({ start: getValues('start_seconds'), end: getValues('end_seconds') }, nextBounds),
      );
    },
    [flow.setSource, setClip, getValues],
  );

  const estimate = estimateVideoCost({
    clipSeconds: clipLength(clip),
    fpsResolution: fps,
    sourceFps: source?.frameRate ?? null,
  });
  const clipError = formState.errors.end_seconds?.message ?? formState.errors.start_seconds?.message;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <form
        onSubmit={flow.onSubmit}
        noValidate
        className="min-w-0 space-y-8"
        aria-label="Video transformation"
      >
        <section aria-labelledby="upload-heading" className="space-y-3">
          <h2
            id="upload-heading"
            tabIndex={-1}
            className="text-lg font-semibold tracking-tight focus:outline-none"
          >
            1. Upload a video
          </h2>
          <FileDropzone
            key={flow.dropzoneKey}
            kind="video"
            value={source}
            labelledBy="upload-heading"
            disabled={flow.locked}
            onChange={(next, upload) => onSourceChange(next, upload !== undefined)}
            renderPreview={(value) => (
              <VideoPlayer
                ref={sourceVideoRef}
                src={value.url}
                poster={videoPosterUrl(value.url)}
                label={value.filename ? `Uploaded video: ${value.filename}` : 'Uploaded video'}
                aspectRatio={16 / 10}
              />
            )}
          />
        </section>

        <section aria-labelledby="clip-heading" className="space-y-4">
          <h2 id="clip-heading" className="text-lg font-semibold tracking-tight">
            2. Choose the clip
          </h2>
          {source ? (
            <ClipSelector
              clip={clip}
              bounds={bounds}
              onChange={setClip}
              videoRef={sourceVideoRef}
              disabled={flow.locked}
              error={clipError}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Upload a video first, then pick up to {formatSeconds(DEFAULT_MAX_CLIP)} of it.
            </p>
          )}
        </section>

        <section aria-labelledby="params-heading" className="space-y-4">
          <h2 id="params-heading" className="text-lg font-semibold tracking-tight">
            3. Choose a style
          </h2>
          <FieldGroup>
            <ArtStyleField control={control} disabled={flow.locked} />
            <PromptFields control={control} disabled={flow.locked} />
            <div className="grid gap-6 sm:grid-cols-2">
              <ModelField control={control} disabled={flow.locked} />
              <VersionField control={control} disabled={flow.locked} />
            </div>
            <FpsField control={control} disabled={flow.locked} />
          </FieldGroup>
        </section>

        <SubmitBar
          kind="video"
          costLabel={describeVideoCost(estimate)}
          costNote={
            estimate.kind === 'estimate'
              ? `${formatSeconds(clipLength(clip))} at ${formatFps(estimate.outputFps)} × ${VIDEO_CREDITS_PER_FRAME} credits per frame, per Magic Hour’s published rate. The final charge is set when the job finishes.`
              : 'Magic Hour’s published rate. Full frame rate renders twice the frames of Half. The estimate appears once a video is uploaded.'
          }
          submitError={flow.submitError}
          submitErrorRef={flow.submitErrorRef}
          errorActions={{
            retry: () => void flow.onSubmit(),
            'edit-params': () => setFocus('art_style'),
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
          kind="video"
          state={panel}
          placeholderRatio={ratioOf(source?.width, source?.height, 16 / 9)}
          emptyMessage={
            source
              ? 'Choose a clip and an art style, then select Transform.'
              : 'Upload a video to get started.'
          }
          tryAnotherLabel="Try another style"
          renderCompleted={(transformation, afterActions) => (
            <div className="space-y-4">
              <VideoResult transformation={transformation} />
              <ResultActions
                url={transformation.output.url}
                downloadName={`ai-transform-${transformation.id}`}
              />
              <div className="flex flex-wrap gap-2 border-t pt-4">{afterActions}</div>
            </div>
          )}
          renderTimedOutSource={(transformation) =>
            transformation.kind === 'video' ? (
              <VideoPlayer
                src={videoClipUrl(
                  transformation.source.url,
                  transformation.params.start_seconds,
                  transformation.params.end_seconds,
                )}
                poster={videoPosterUrl(transformation.source.url, transformation.params.start_seconds)}
                label="Original clip"
                aspectRatio={ratioOf(transformation.source.width, transformation.source.height, 16 / 9)}
                className="max-h-64"
              />
            ) : null
          }
          connectionProblem={flow.connectionProblem}
          onTryAnother={flow.tryAnother}
          onStartOver={flow.startOver}
          onCheckAgain={flow.checkAgain}
          checkingAgain={flow.checkingAgain}
        />
      </div>
    </div>
  );
}

/** 15 → "15 fps"; 14.985 → "15 fps". */
function formatFps(fps: number): string {
  return `${String(Math.round(fps * 10) / 10)} fps`;
}
