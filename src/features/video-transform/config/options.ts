import type { VideoFpsResolution, VideoModel, VideoPromptType, VideoVersion } from '../lib/video-form';

/**
 * Labels and one-line explanations for the Video-to-Video options, from the
 * API reference's field descriptions (POST /v1/video-to-video, `style.*` and
 * `fps_resolution`). Keyed by `Record<…>` so a value added to the shared
 * schema fails the typecheck until it is described here.
 */

export const VIDEO_MODEL_LABELS = {
  default: 'Default (recommended)',
  Dreamshaper: 'Dreamshaper',
  'Absolute Reality': 'Absolute Reality',
  'Flat 2D Anime': 'Flat 2D Anime',
  'Soft Anime': 'Soft Anime',
  Kaywaii: 'Kaywaii',
  'Western Anime': 'Western Anime',
  '3D Anime': '3D Anime',
} as const satisfies Record<VideoModel, string>;

export const VIDEO_VERSION_LABELS = {
  default: 'Default (recommended)',
  v1: 'v1 · more detail',
  v2: 'v2 · faster, steadier',
} as const satisfies Record<VideoVersion, string>;

export const PROMPT_TYPE_OPTIONS = {
  default: {
    label: 'Default',
    description: 'Use the art style’s own recommended prompt. No prompt needed.',
  },
  custom: {
    label: 'Custom',
    description: 'Use only your prompt (v1 still adds the style’s own tags).',
  },
  append_default: {
    label: 'Append to default',
    description: 'Your prompt, followed by the art style’s recommended prompt.',
  },
} as const satisfies Record<VideoPromptType, { label: string; description: string }>;

export const FPS_OPTIONS = {
  HALF: {
    label: 'Half',
    description: 'Half the source’s frame rate. Renders half the frames, so it costs about half as much.',
  },
  FULL: {
    label: 'Full',
    description: 'The source’s full frame rate. Smoother, but renders twice the frames and costs more.',
  },
} as const satisfies Record<VideoFpsResolution, { label: string; description: string }>;

export function promptTypeLabel(promptType: VideoPromptType): string {
  return PROMPT_TYPE_OPTIONS[promptType].label;
}
