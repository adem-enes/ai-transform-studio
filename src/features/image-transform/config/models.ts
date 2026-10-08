import { IMAGE_MODEL_CATALOG, type ImageModel } from '@/schemas';

export function describeCost(model: ImageModel): string {
  const credits = IMAGE_MODEL_CATALOG[model].baseCredits;
  return credits === null ? 'cost set by Magic Hour' : `from ${credits} credits`;
}

export const EXAMPLE_PROMPTS = [
  'Turn it into a watercolor painting',
  'Make it look like a golden-hour sunset',
  'Add gently falling snow',
  'Restyle it as a neon cyberpunk scene',
] as const;
