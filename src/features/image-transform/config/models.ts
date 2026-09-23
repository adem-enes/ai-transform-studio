import type { ImageModel, ImageResolution } from '@/schemas';

type ModelInfo = {
  label: string;
  /**
   * "From" cost per image in Magic Hour credits, at the cheapest resolution.
   * `null` for `default`, which is whichever model Magic Hour currently recommends.
   */
  baseCredits: number | null;
};

/**
 * Display names and base costs for the AI Image Editor models. Costs come from
 * the Magic Hour API reference (`model` → "from N credits/image"), as shipped
 * in the SDK's `V1AiImageEditorCreateBodyModelEnum` docs — update them
 * together with the SDK. Keyed by `Record<ImageModel, …>` so a model added to
 * the shared schema fails the typecheck until it is listed here.
 */
export const IMAGE_MODEL_INFO = {
  default: { label: 'Recommended (auto)', baseCredits: null },
  'flux-2-klein': { label: 'FLUX.2 Klein', baseCredits: 5 },
  'gpt-image-2': { label: 'GPT Image 2', baseCredits: 50 },
  'gpt-image-2.5-flare': { label: 'GPT Image 2.5 Flare', baseCredits: 100 },
  'krea-2': { label: 'Krea 2', baseCredits: 10 },
  'nano-banana': { label: 'Nano Banana', baseCredits: 50 },
  'nano-banana-2': { label: 'Nano Banana 2', baseCredits: 100 },
  'nano-banana-2-lite': { label: 'Nano Banana 2 Lite', baseCredits: 50 },
  'nano-banana-pro': { label: 'Nano Banana Pro', baseCredits: 150 },
  'qwen-edit': { label: 'Qwen Edit', baseCredits: 10 },
  'seedream-v4': { label: 'Seedream 4', baseCredits: 40 },
  'seedream-v4.5': { label: 'Seedream 4.5', baseCredits: 50 },
  'seedream-v5-pro': { label: 'Seedream 5 Pro', baseCredits: 75 },
} as const satisfies Record<ImageModel, ModelInfo>;

export function describeCost(model: ImageModel): string {
  const credits = IMAGE_MODEL_INFO[model].baseCredits;
  return credits === null ? 'cost set by Magic Hour' : `from ${credits} credits`;
}

export const RESOLUTION_LABELS = {
  '640px': '640 px',
  '1k': '1K',
  '2k': '2K',
  '4k': '4K',
  /** Deprecated by Magic Hour and never offered; listed only to satisfy the type. */
  auto: 'Auto',
} as const satisfies Record<ImageResolution, string>;

export const ASPECT_RATIO_LABELS: Record<string, string> = {
  auto: 'Auto',
  '1:1': 'Square',
  '16:9': 'Wide',
  '9:16': 'Tall',
  '4:3': 'Landscape',
  '3:2': 'Photo',
  '4:5': 'Portrait',
  '2:3': 'Poster',
};

export const EXAMPLE_PROMPTS = [
  'Turn it into a watercolor painting',
  'Make it look like a golden-hour sunset',
  'Add gently falling snow',
  'Restyle it as a neon cyberpunk scene',
] as const;
