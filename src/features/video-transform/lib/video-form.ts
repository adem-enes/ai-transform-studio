import type { FieldErrors, Resolver } from 'react-hook-form';
import {
  type VIDEO_ART_STYLES,
  type VIDEO_FPS_RESOLUTIONS,
  type VIDEO_MODELS,
  type VIDEO_PROMPT_TYPES,
  type VIDEO_VERSIONS,
  type VideoTransformParams,
  videoTransformParams,
} from '@/schemas';
import { formatSeconds } from './clip';

export type VideoArtStyle = (typeof VIDEO_ART_STYLES)[number];
export type VideoModel = (typeof VIDEO_MODELS)[number];
export type VideoVersion = (typeof VIDEO_VERSIONS)[number];
export type VideoPromptType = (typeof VIDEO_PROMPT_TYPES)[number];
export type VideoFpsResolution = (typeof VIDEO_FPS_RESOLUTIONS)[number];

/**
 * What the form holds. Close to `VideoTransformParams`, except that nothing is
 * chosen for the (required) art style yet, and the prompt is always a string
 * so the textarea stays controlled while hidden.
 */
export type VideoFormValues = {
  start_seconds: number;
  end_seconds: number;
  fps_resolution: VideoFpsResolution;
  art_style: VideoArtStyle | '';
  model: VideoModel;
  version: VideoVersion;
  prompt_type: VideoPromptType;
  prompt: string;
};

export type VideoFormContext = { durationSeconds: number | null };

type VideoFormResult =
  | { ok: true; params: VideoTransformParams }
  | { ok: false; errors: Partial<Record<keyof VideoFormValues, string>> };

export const VIDEO_FIELDS: ReadonlySet<string> = new Set<keyof VideoFormValues>([
  'start_seconds',
  'end_seconds',
  'fps_resolution',
  'art_style',
  'model',
  'version',
  'prompt_type',
  'prompt',
]);

export const ART_STYLE_REQUIRED = 'Choose an art style.';
export const PROMPT_REQUIRED = 'Write a prompt, or set the prompt type to Default.';

/** A transformation's stored params, back as form values (for restoring from `?t=`). */
export function toVideoFormValues(params: VideoTransformParams): VideoFormValues {
  return { ...params, prompt: params.prompt ?? '' };
}

/**
 * Form values → the request's params, validated by the shared schema:
 *
 * - `default` prompt type: the prompt is dropped (`null`), whatever the
 *   hidden textarea still holds, so a stale prompt is never sent;
 * - `custom` / `append_default`: the trimmed prompt is required;
 * - the clip must also end within the source (the schema cannot know its length).
 */
export function validateVideoForm(
  values: VideoFormValues,
  { durationSeconds }: VideoFormContext,
): VideoFormResult {
  const prompt = values.prompt_type === 'default' ? null : values.prompt.trim() || null;
  const parsed = videoTransformParams.safeParse({
    ...values,
    art_style: values.art_style === '' ? undefined : values.art_style,
    prompt,
  });

  const errors: Partial<Record<keyof VideoFormValues, string>> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && VIDEO_FIELDS.has(field)) {
        errors[field as keyof VideoFormValues] ??= issue.message;
      }
    }
  }
  if (values.art_style === '') {
    errors.art_style = ART_STYLE_REQUIRED;
  }
  if (values.prompt_type !== 'default' && prompt === null) {
    errors.prompt = PROMPT_REQUIRED;
  }
  if (durationSeconds !== null && values.end_seconds > durationSeconds + 1e-6) {
    errors.end_seconds ??= `The clip must end by ${formatSeconds(durationSeconds)}, the length of the video.`;
  }

  if (parsed.success && Object.keys(errors).length === 0) {
    return { ok: true, params: parsed.data };
  }
  return { ok: false, errors };
}

/** `validateVideoForm` as a react-hook-form resolver; the source duration comes in through the form context. */
export const videoFormResolver: Resolver<VideoFormValues, VideoFormContext, VideoTransformParams> = async (
  values,
  context,
) => {
  const result = validateVideoForm(values, context ?? { durationSeconds: null });
  if (result.ok) {
    return { values: result.params, errors: {} };
  }
  const errors: FieldErrors<VideoFormValues> = {};
  for (const [field, message] of Object.entries(result.errors)) {
    errors[field as keyof VideoFormValues] = { type: 'validate', message };
  }
  return { values: {}, errors };
};
