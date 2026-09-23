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
import { z } from 'zod';
import { MEDIA_LIMITS } from './media';

/**
 * Transformation parameters, validated identically in the form and on the server.
 *
 * Field names are the Magic Hour API's own (snake_case) so a stored document
 * reads like the request that was sent. The service layer maps them onto the
 * SDK's camelCase request types.
 *
 * Every enum below is declared as a `Record<SdkEnum, boolean>` literal — `true`
 * means "offered to users", `false` means "exists in the API but deliberately
 * not offered" (deprecated values). `satisfies` rejects both a missing and an
 * unknown key, so an SDK upgrade that adds or removes a value fails the
 * typecheck here instead of drifting silently.
 */
function offered<T extends string>(flags: Record<T, boolean>): [T, ...T[]] {
  const [first, ...rest] = (Object.keys(flags) as T[]).filter((value) => flags[value]);
  if (first === undefined) {
    throw new Error('An enum must offer at least one value.');
  }
  return [first, ...rest];
}

// ---------------------------------------------------------------------------
// Image — AI Image Editor (POST /v1/ai-image-editor)
// ---------------------------------------------------------------------------

export const IMAGE_MODELS = offered({
  default: true,
  'flux-2-klein': true,
  'gpt-image-2': true,
  'gpt-image-2.5-flare': true,
  'krea-2': true,
  'nano-banana': true,
  'nano-banana-2': true,
  'nano-banana-2-lite': true,
  'nano-banana-pro': true,
  'qwen-edit': true,
  'seedream-v4': true,
  'seedream-v4.5': true,
  'seedream-v5-pro': true,
} satisfies Record<V1AiImageEditorCreateBodyModelEnum, boolean>);
export type ImageModel = (typeof IMAGE_MODELS)[number];

export const IMAGE_ASPECT_RATIOS = offered({
  auto: true,
  '1:1': true,
  '16:9': true,
  '9:16': true,
  '4:3': true,
  '3:2': true,
  '4:5': true,
  '2:3': true,
} satisfies Record<V1AiImageEditorCreateBodyAspectRatioEnum, boolean>);

export const IMAGE_RESOLUTIONS = offered({
  '640px': true,
  '1k': true,
  '2k': true,
  '4k': true,
  /** Deprecated by Magic Hour ("mapped server-side from your subscription tier"). */
  auto: false,
} satisfies Record<V1AiImageEditorCreateBodyResolutionEnum, boolean>);
export type ImageResolution = (typeof IMAGE_RESOLUTIONS)[number];

/**
 * Output resolutions each model supports, from the AI Image Editor reference
 * (`resolution` → "Per-model support"). `default` is omitted: it is whichever
 * model Magic Hour currently recommends, so the provider validates it.
 */
export const IMAGE_MODEL_RESOLUTIONS = {
  'flux-2-klein': ['640px', '1k', '2k'],
  'gpt-image-2': ['640px', '1k', '2k', '4k'],
  'gpt-image-2.5-flare': ['640px', '1k', '2k', '4k'],
  'krea-2': ['640px', '1k'],
  'nano-banana': ['640px', '1k'],
  'nano-banana-2': ['640px', '1k', '2k', '4k'],
  'nano-banana-2-lite': ['640px', '1k'],
  'nano-banana-pro': ['1k', '2k', '4k'],
  'qwen-edit': ['640px', '1k', '2k'],
  'seedream-v4': ['640px', '1k', '2k', '4k'],
  'seedream-v4.5': ['640px', '1k', '2k', '4k'],
  'seedream-v5-pro': ['640px', '1k', '2k'],
} as const satisfies Record<Exclude<ImageModel, 'default'>, readonly ImageResolution[]>;

export function isResolutionSupported(model: ImageModel, resolution: ImageResolution): boolean {
  if (model === 'default') {
    return true;
  }
  const supported: readonly ImageResolution[] = IMAGE_MODEL_RESOLUTIONS[model];
  return supported.includes(resolution);
}

/** API limit on `style.prompt` for the AI Image Editor. */
export const IMAGE_PROMPT_MAX_LENGTH = 15_000;

export const imageTransformParams = z
  .object({
    prompt: z.string().trim().min(1, 'Describe the change you want.').max(IMAGE_PROMPT_MAX_LENGTH),
    model: z.enum(IMAGE_MODELS).default('default'),
    aspect_ratio: z.enum(IMAGE_ASPECT_RATIOS).default('auto'),
    resolution: z.enum(IMAGE_RESOLUTIONS).default('1k'),
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

export const VIDEO_MODELS = offered({
  default: true,
  Dreamshaper: true,
  'Absolute Reality': true,
  'Flat 2D Anime': true,
  'Soft Anime': true,
  Kaywaii: true,
  'Western Anime': true,
  '3D Anime': true,
} satisfies Record<V1VideoToVideoCreateBodyStyleModelEnum, boolean>);

export const VIDEO_PROMPT_TYPES = offered({
  default: true,
  custom: true,
  append_default: true,
} satisfies Record<V1VideoToVideoCreateBodyStylePromptTypeEnum, boolean>);

export const VIDEO_VERSIONS = offered({
  default: true,
  v1: true,
  v2: true,
} satisfies Record<V1VideoToVideoCreateBodyStyleVersionEnum, boolean>);

export const VIDEO_FPS_RESOLUTIONS = offered({
  HALF: true,
  FULL: true,
} satisfies Record<V1VideoToVideoCreateBodyFpsResolutionEnum, boolean>);

/** Our own cap — the Video-to-Video reference documents no prompt length limit. */
export const VIDEO_PROMPT_MAX_LENGTH = 2_000;

export const videoTransformParams = z
  .object({
    start_seconds: z.number().min(0),
    end_seconds: z.number().min(0.1),
    /** `HALF` renders (and bills) half the source frames — the cheaper default, as in the API. */
    fps_resolution: z.enum(VIDEO_FPS_RESOLUTIONS).default('HALF'),
    art_style: z.enum(VIDEO_ART_STYLES),
    model: z.enum(VIDEO_MODELS).default('default'),
    version: z.enum(VIDEO_VERSIONS).default('default'),
    prompt_type: z.enum(VIDEO_PROMPT_TYPES).default('default'),
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
