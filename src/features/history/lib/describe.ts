import {
  ASPECT_RATIO_LABELS,
  describeCost,
  IMAGE_MODEL_INFO,
  RESOLUTION_LABELS,
} from '@/features/image-transform/config/models';
import {
  FPS_OPTIONS,
  PROMPT_TYPE_OPTIONS,
  VIDEO_MODEL_LABELS,
  VIDEO_VERSION_LABELS,
} from '@/features/video-transform/config/options';
import { describeVideoCostFor } from '@/features/video-transform/lib/cost';
import { videoPosterUrl } from '@/lib/media/cloudinary';
import type { TransformationView } from '@/schemas';

/**
 * The card thumbnail: the result once there is one, otherwise the source.
 * Videos use a still frame — the result's first, or the source's at the clip start.
 */
export function thumbnailUrl(transformation: TransformationView): string {
  if (transformation.kind === 'image') {
    return transformation.output?.url ?? transformation.source.url;
  }
  return transformation.output
    ? videoPosterUrl(transformation.output.url)
    : videoPosterUrl(transformation.source.url, transformation.params.start_seconds);
}

/** Length of a video transformation: the stored result's, else the requested clip's. `null` for images. */
export function videoDurationOf(transformation: TransformationView): number | null {
  if (transformation.kind !== 'video') {
    return null;
  }
  const { params, output } = transformation;
  return output?.durationSeconds ?? params.end_seconds - params.start_seconds;
}

/** One-line summary of the key parameters, for the card. */
export function keyParams(transformation: TransformationView): string[] {
  if (transformation.kind === 'image') {
    const { model, aspect_ratio } = transformation.params;
    return [IMAGE_MODEL_INFO[model].label, aspect_ratio === 'auto' ? 'Auto ratio' : aspect_ratio];
  }
  const { art_style, start_seconds, end_seconds } = transformation.params;
  return [art_style, `${formatSeconds(start_seconds)}–${formatSeconds(end_seconds)} s`];
}

/** The cost estimate the form showed for these parameters. */
export function estimatedCostOf(transformation: TransformationView): string {
  return transformation.kind === 'image'
    ? describeCost(transformation.params.model)
    : describeVideoCostFor(transformation.params, transformation.source.frameRate);
}

/** The prompt, if the transformation has one worth showing. */
export function promptOf(transformation: TransformationView): string | null {
  if (transformation.kind === 'image') {
    return transformation.params.prompt;
  }
  return transformation.params.prompt_type === 'default' ? null : transformation.params.prompt;
}

/** Every parameter as label/value rows, for the details view. */
export function parameterRows(transformation: TransformationView): { label: string; value: string }[] {
  if (transformation.kind === 'image') {
    const { prompt, model, aspect_ratio, resolution } = transformation.params;
    return [
      { label: 'Prompt', value: prompt },
      { label: 'Model', value: `${IMAGE_MODEL_INFO[model].label} (${model})` },
      {
        label: 'Aspect ratio',
        value:
          aspect_ratio === 'auto'
            ? 'Auto (match source)'
            : `${aspect_ratio} (${ASPECT_RATIO_LABELS[aspect_ratio]})`,
      },
      { label: 'Resolution', value: RESOLUTION_LABELS[resolution] },
    ];
  }
  const p = transformation.params;
  return [
    { label: 'Art style', value: p.art_style },
    { label: 'Model', value: VIDEO_MODEL_LABELS[p.model] },
    { label: 'Version', value: VIDEO_VERSION_LABELS[p.version] },
    { label: 'Prompt type', value: PROMPT_TYPE_OPTIONS[p.prompt_type].label },
    { label: 'Prompt', value: p.prompt ?? 'None — the art style’s own prompt' },
    {
      label: 'Frame rate',
      value: `${FPS_OPTIONS[p.fps_resolution].label} — ${p.fps_resolution === 'FULL' ? 'the source frame rate' : 'half the source frame rate'}`,
    },
    {
      label: 'Clip',
      value: `${formatSeconds(p.start_seconds)} s to ${formatSeconds(p.end_seconds)} s (${formatSeconds(
        p.end_seconds - p.start_seconds,
      )} s)`,
    },
  ];
}

function formatSeconds(seconds: number): string {
  return String(Math.round(seconds * 10) / 10);
}
