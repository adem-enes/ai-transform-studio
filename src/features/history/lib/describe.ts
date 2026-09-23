import {
  ASPECT_RATIO_LABELS,
  IMAGE_MODEL_INFO,
  RESOLUTION_LABELS,
} from '@/features/image-transform/config/models';
import { videoPosterUrl } from '@/lib/media/cloudinary';
import type { TransformationView } from '@/schemas';

/** The card thumbnail: the result once there is one, otherwise the source. Videos use a still frame. */
export function thumbnailUrl(transformation: TransformationView): string {
  const url = transformation.output?.url ?? transformation.source.url;
  return transformation.kind === 'video' ? videoPosterUrl(url) : url;
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
    { label: 'Clip', value: `${formatSeconds(p.start_seconds)} s to ${formatSeconds(p.end_seconds)} s` },
    { label: 'Frame rate', value: p.fps_resolution === 'HALF' ? 'Half' : 'Full' },
    { label: 'Model', value: p.model },
    { label: 'Version', value: p.version },
    { label: 'Prompt type', value: p.prompt_type },
    ...(p.prompt ? [{ label: 'Prompt', value: p.prompt }] : []),
  ];
}

function formatSeconds(seconds: number): string {
  return String(Math.round(seconds * 10) / 10);
}
