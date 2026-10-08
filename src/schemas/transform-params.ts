import type {
  V1AiImageEditorCreateBodyAspectRatioEnum,
  V1AiImageEditorCreateBodyModelEnum,
  V1AiImageEditorCreateBodyResolutionEnum,
  V1VideoToVideoCreateBodyFpsResolutionEnum,
  V1VideoToVideoCreateBodyStyleArtStyleEnum,
  V1VideoToVideoCreateBodyStyleModelEnum,
  V1VideoToVideoCreateBodyStylePromptTypeEnum,
  V1VideoToVideoCreateBodyStyleVersionEnum,
} from 'magic-hour/types';
import * as z from 'zod';
import { MEDIA_LIMITS } from './media';

/**
 * Transformation parameters, validated identically in the form and on the server.
 *
 * Field names are the Magic Hour API's own (snake_case) so a stored document
 * reads like the request that was sent. The service layer maps them onto the
 * SDK's camelCase request types.
 *
 * Every enum below has one catalog: a `Record<SdkEnum, …>` literal that holds
 * everything known about each value — whether it is offered (`false` means
 * "exists in the API but deliberately not offered", e.g. deprecated values),
 * its display label and any per-value data. The value lists, labels and
 * lookups used elsewhere are derived from it. `satisfies` rejects both a
 * missing and an unknown key, so an SDK upgrade that adds or removes a value
 * fails the typecheck here instead of drifting silently.
 */
function offered<T extends string>(catalog: Record<T, boolean | { offered: boolean }>): [T, ...T[]] {
  const [first, ...rest] = (Object.keys(catalog) as T[]).filter((value) => {
    const entry = catalog[value];
    return typeof entry === 'boolean' ? entry : entry.offered;
  });
  if (first === undefined) {
    throw new Error('An enum must offer at least one value.');
  }
  return [first, ...rest];
}

type OptionSpec = { offered: boolean; label: string };
type DescribedOptionSpec = OptionSpec & { description: string };

// ---------------------------------------------------------------------------
// Image — AI Image Editor (POST /v1/ai-image-editor)
// ---------------------------------------------------------------------------

export const IMAGE_RESOLUTION_CATALOG = {
  '640px': { offered: true, label: '640 px' },
  '1k': { offered: true, label: '1K' },
  '2k': { offered: true, label: '2K' },
  '4k': { offered: true, label: '4K' },
  /** Deprecated by Magic Hour ("mapped server-side from your subscription tier"). */
  auto: { offered: false, label: 'Auto' },
} as const satisfies Record<V1AiImageEditorCreateBodyResolutionEnum, OptionSpec>;
export const IMAGE_RESOLUTIONS = offered(IMAGE_RESOLUTION_CATALOG);
export type ImageResolution = (typeof IMAGE_RESOLUTIONS)[number];

type ImageModelSpec = OptionSpec & {
  /**
   * "From" cost per image in Magic Hour credits, at the cheapest resolution.
   * `null` for `default`, which is whichever model Magic Hour currently recommends.
   */
  baseCredits: number | null;
  /**
   * Output resolutions the model supports, in catalog order. `null` for
   * `default`: the provider validates it, since the model behind it changes.
   */
  resolutions: readonly ImageResolution[] | null;
};

/**
 * AI Image Editor models. Costs come from the Magic Hour API reference
 * (`model` → "from N credits/image") and resolutions from `resolution` →
 * "Per-model support", as shipped in the SDK's docs — update them together
 * with the SDK.
 */
export const IMAGE_MODEL_CATALOG = {
  default: { offered: true, label: 'Recommended (auto)', baseCredits: null, resolutions: null },
  'flux-2-klein': {
    offered: true,
    label: 'FLUX.2 Klein',
    baseCredits: 5,
    resolutions: ['640px', '1k', '2k'],
  },
  'gpt-image-2': {
    offered: true,
    label: 'GPT Image 2',
    baseCredits: 50,
    resolutions: ['640px', '1k', '2k', '4k'],
  },
  'gpt-image-2.5-flare': {
    offered: true,
    label: 'GPT Image 2.5 Flare',
    baseCredits: 100,
    resolutions: ['640px', '1k', '2k', '4k'],
  },
  'krea-2': { offered: true, label: 'Krea 2', baseCredits: 10, resolutions: ['640px', '1k'] },
  'nano-banana': { offered: true, label: 'Nano Banana', baseCredits: 50, resolutions: ['640px', '1k'] },
  'nano-banana-2': {
    offered: true,
    label: 'Nano Banana 2',
    baseCredits: 100,
    resolutions: ['640px', '1k', '2k', '4k'],
  },
  'nano-banana-2-lite': {
    offered: true,
    label: 'Nano Banana 2 Lite',
    baseCredits: 50,
    resolutions: ['640px', '1k'],
  },
  'nano-banana-pro': {
    offered: true,
    label: 'Nano Banana Pro',
    baseCredits: 150,
    resolutions: ['1k', '2k', '4k'],
  },
  'qwen-edit': { offered: true, label: 'Qwen Edit', baseCredits: 10, resolutions: ['640px', '1k', '2k'] },
  'seedream-v4': {
    offered: true,
    label: 'Seedream 4',
    baseCredits: 40,
    resolutions: ['640px', '1k', '2k', '4k'],
  },
  'seedream-v4.5': {
    offered: true,
    label: 'Seedream 4.5',
    baseCredits: 50,
    resolutions: ['640px', '1k', '2k', '4k'],
  },
  'seedream-v5-pro': {
    offered: true,
    label: 'Seedream 5 Pro',
    baseCredits: 75,
    resolutions: ['640px', '1k', '2k'],
  },
} as const satisfies Record<V1AiImageEditorCreateBodyModelEnum, ImageModelSpec>;
export const IMAGE_MODELS = offered(IMAGE_MODEL_CATALOG);
export type ImageModel = (typeof IMAGE_MODELS)[number];

export const IMAGE_ASPECT_RATIO_CATALOG = {
  auto: { offered: true, label: 'Auto' },
  '1:1': { offered: true, label: 'Square' },
  '16:9': { offered: true, label: 'Wide' },
  '9:16': { offered: true, label: 'Tall' },
  '4:3': { offered: true, label: 'Landscape' },
  '3:2': { offered: true, label: 'Photo' },
  '4:5': { offered: true, label: 'Portrait' },
  '2:3': { offered: true, label: 'Poster' },
} as const satisfies Record<V1AiImageEditorCreateBodyAspectRatioEnum, OptionSpec>;
export const IMAGE_ASPECT_RATIOS = offered(IMAGE_ASPECT_RATIO_CATALOG);
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];

/** Defaults shared by the schema, the form and the tests. */
export const IMAGE_DEFAULTS = {
  model: 'flux-2-klein',
  aspect_ratio: 'auto',
  /** The cheapest size; also where a model change lands when the current size is unsupported. */
  resolution: '640px',
} as const satisfies { model: ImageModel; aspect_ratio: ImageAspectRatio; resolution: ImageResolution };

/** Resolutions the model supports, in catalog order. `default` supports all (the provider validates). */
export function supportedResolutions(model: ImageModel): readonly ImageResolution[] {
  return IMAGE_MODEL_CATALOG[model].resolutions ?? IMAGE_RESOLUTIONS;
}

export function isResolutionSupported(model: ImageModel, resolution: ImageResolution): boolean {
  return supportedResolutions(model).includes(resolution);
}

/** API limit on `style.prompt` for the AI Image Editor. */
export const IMAGE_PROMPT_MAX_LENGTH = 15_000;

export const imageTransformParams = z
  .object({
    prompt: z.string().trim().min(1, 'Describe the change you want.').max(IMAGE_PROMPT_MAX_LENGTH),
    model: z.enum(IMAGE_MODELS).default(IMAGE_DEFAULTS.model),
    aspect_ratio: z.enum(IMAGE_ASPECT_RATIOS).default(IMAGE_DEFAULTS.aspect_ratio),
    resolution: z.enum(IMAGE_RESOLUTIONS).default(IMAGE_DEFAULTS.resolution),
  })
  .refine((params) => isResolutionSupported(params.model, params.resolution), {
    message: 'This model does not support the selected resolution.',
    path: ['resolution'],
  });
export type ImageTransformParams = z.infer<typeof imageTransformParams>;

// ---------------------------------------------------------------------------
// Video — Video-to-Video (POST /v1/video-to-video)
// ---------------------------------------------------------------------------

export const VIDEO_ART_STYLES = offered({
  '3D Render': true,
  Airbender: true,
  Android: true,
  'Anime Warrior': true,
  'Armored Knight': true,
  "Assassin's Creed": true,
  Avatar: true,
  'Black Spiderman': true,
  'Boba Fett': true,
  'Bold Anime': true,
  'Celestial Skin': true,
  'Chinese Swordsmen': true,
  Clay: true,
  Comic: true,
  Cyberpunk: true,
  Cypher: true,
  'Dark Fantasy': true,
  'Dragonball Z': true,
  'Future Bot': true,
  'Futuristic Fantasy': true,
  GTA: true,
  'Ghibli Anime': true,
  Ghost: true,
  Gundam: true,
  Hologram: true,
  Illustration: true,
  Impressionism: true,
  Ink: true,
  'Ink Poster': true,
  Jinx: true,
  Knight: true,
  Lego: true,
  Link: true,
  Marble: true,
  Mario: true,
  'Master Chief': true,
  Mech: true,
  Minecraft: true,
  Mystique: true,
  Naruto: true,
  'Neon Dream': true,
  'No Art Style': true,
  'Oil Painting': true,
  'On Fire': true,
  Origami: true,
  'Painterly Anime': true,
  Pixar: true,
  Pixel: true,
  'Power Armor': true,
  'Power Ranger': true,
  'Radiant Anime': true,
  'Realistic Anime': true,
  'Realistic Pixar': true,
  'Retro Anime': true,
  'Retro Sci-Fi': true,
  Samurai: true,
  'Samurai Bot': true,
  'Sharp Anime': true,
  'Soft Anime': true,
  'Solid Snake': true,
  Spartan: true,
  Starfield: true,
  'Street Fighter': true,
  'Studio Ghibli': true,
  'Sub-Zero': true,
  'The Void': true,
  'Tomb Raider': true,
  Underwater: true,
  'Van Gogh': true,
  Viking: true,
  Watercolor: true,
  'Western Anime': true,
  'Wu Kong': true,
  'Wuxia Anime': true,
  Zelda: true,
} satisfies Record<V1VideoToVideoCreateBodyStyleArtStyleEnum, boolean>);
export type VideoArtStyle = (typeof VIDEO_ART_STYLES)[number];

/*
 * Labels and one-line explanations for the options below come from the API
 * reference's field descriptions (POST /v1/video-to-video, `style.*` and
 * `fps_resolution`).
 */

export const VIDEO_MODEL_CATALOG = {
  default: { offered: true, label: 'Default (recommended)' },
  Dreamshaper: { offered: true, label: 'Dreamshaper' },
  'Absolute Reality': { offered: true, label: 'Absolute Reality' },
  'Flat 2D Anime': { offered: true, label: 'Flat 2D Anime' },
  'Soft Anime': { offered: true, label: 'Soft Anime' },
  Kaywaii: { offered: true, label: 'Kaywaii' },
  'Western Anime': { offered: true, label: 'Western Anime' },
  '3D Anime': { offered: true, label: '3D Anime' },
} as const satisfies Record<V1VideoToVideoCreateBodyStyleModelEnum, OptionSpec>;
export const VIDEO_MODELS = offered(VIDEO_MODEL_CATALOG);
export type VideoModel = (typeof VIDEO_MODELS)[number];

export const VIDEO_PROMPT_TYPE_CATALOG = {
  default: {
    offered: true,
    label: 'Default',
    description: 'Use the art style’s own recommended prompt. No prompt needed.',
  },
  custom: {
    offered: true,
    label: 'Custom',
    description: 'Use only your prompt (v1 still adds the style’s own tags).',
  },
  append_default: {
    offered: true,
    label: 'Append to default',
    description: 'Your prompt, followed by the art style’s recommended prompt.',
  },
} as const satisfies Record<V1VideoToVideoCreateBodyStylePromptTypeEnum, DescribedOptionSpec>;
export const VIDEO_PROMPT_TYPES = offered(VIDEO_PROMPT_TYPE_CATALOG);
export type VideoPromptType = (typeof VIDEO_PROMPT_TYPES)[number];

export const VIDEO_VERSION_CATALOG = {
  default: { offered: true, label: 'Default (recommended)' },
  v1: { offered: true, label: 'v1 · more detail' },
  v2: { offered: true, label: 'v2 · faster, steadier' },
} as const satisfies Record<V1VideoToVideoCreateBodyStyleVersionEnum, OptionSpec>;
export const VIDEO_VERSIONS = offered(VIDEO_VERSION_CATALOG);
export type VideoVersion = (typeof VIDEO_VERSIONS)[number];

export const VIDEO_FPS_RESOLUTION_CATALOG = {
  HALF: {
    offered: true,
    label: 'Half',
    description: 'Half the source’s frame rate. Renders half the frames, so it costs about half as much.',
  },
  FULL: {
    offered: true,
    label: 'Full',
    description: 'The source’s full frame rate. Smoother, but renders twice the frames and costs more.',
  },
} as const satisfies Record<V1VideoToVideoCreateBodyFpsResolutionEnum, DescribedOptionSpec>;
export const VIDEO_FPS_RESOLUTIONS = offered(VIDEO_FPS_RESOLUTION_CATALOG);
export type VideoFpsResolution = (typeof VIDEO_FPS_RESOLUTIONS)[number];

/** Defaults shared by the schema, the form and the tests. */
export const VIDEO_DEFAULTS = {
  /** `HALF` renders (and bills) half the source frames — the cheaper default, as in the API. */
  fps_resolution: 'HALF',
  model: 'default',
  version: 'default',
  prompt_type: 'default',
} as const satisfies {
  fps_resolution: VideoFpsResolution;
  model: VideoModel;
  version: VideoVersion;
  prompt_type: VideoPromptType;
};

/** Our own cap — the Video-to-Video reference documents no prompt length limit. */
export const VIDEO_PROMPT_MAX_LENGTH = 2_000;

export const videoTransformParams = z
  .object({
    start_seconds: z.number().min(0),
    end_seconds: z.number().min(0.1),
    fps_resolution: z.enum(VIDEO_FPS_RESOLUTIONS).default(VIDEO_DEFAULTS.fps_resolution),
    art_style: z.enum(VIDEO_ART_STYLES),
    model: z.enum(VIDEO_MODELS).default(VIDEO_DEFAULTS.model),
    version: z.enum(VIDEO_VERSIONS).default(VIDEO_DEFAULTS.version),
    prompt_type: z.enum(VIDEO_PROMPT_TYPES).default(VIDEO_DEFAULTS.prompt_type),
    /** Ignored by Magic Hour when `prompt_type` is `default`; required otherwise. */
    prompt: z.string().trim().min(1).max(VIDEO_PROMPT_MAX_LENGTH).nullable().default(null),
  })
  .refine((params) => params.end_seconds > params.start_seconds, {
    message: 'The end time must be after the start time.',
    path: ['end_seconds'],
  })
  .refine((params) => params.end_seconds - params.start_seconds <= MEDIA_LIMITS.video.maxClipSeconds, {
    message: `Clips can be at most ${MEDIA_LIMITS.video.maxClipSeconds} seconds long.`,
    path: ['end_seconds'],
  })
  .refine((params) => params.prompt_type === 'default' || params.prompt !== null, {
    message: 'A prompt is required unless the prompt type is "default".',
    path: ['prompt'],
  });
export type VideoTransformParams = z.infer<typeof videoTransformParams>;

// ---------------------------------------------------------------------------
// Combined
// ---------------------------------------------------------------------------

export const imageTransformSpec = z.object({ kind: z.literal('image'), params: imageTransformParams });
export const videoTransformSpec = z.object({ kind: z.literal('video'), params: videoTransformParams });

/** What to do, independent of which upload it applies to. */
export const transformSpec = z.discriminatedUnion('kind', [imageTransformSpec, videoTransformSpec]);
export type TransformSpec = z.infer<typeof transformSpec>;
