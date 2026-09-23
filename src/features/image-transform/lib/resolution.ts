import {
  IMAGE_MODEL_RESOLUTIONS,
  IMAGE_RESOLUTIONS,
  type ImageModel,
  type ImageResolution,
  imageTransformParams,
} from '@/schemas';

/** The schema's default resolution — what a model falls back to when it supports it. */
const DEFAULT_RESOLUTION: ImageResolution = imageTransformParams.parse({ prompt: 'x' }).resolution;

/** Resolutions the model supports, in the schema's order. `default` supports all (the provider validates). */
export function supportedResolutions(model: ImageModel): readonly ImageResolution[] {
  return model === 'default' ? IMAGE_RESOLUTIONS : IMAGE_MODEL_RESOLUTIONS[model];
}

/** The resolution a model starts at: the shared default if it supports it, else its first supported one. */
export function defaultResolutionFor(model: ImageModel): ImageResolution {
  const supported = supportedResolutions(model);
  return supported.includes(DEFAULT_RESOLUTION) ? DEFAULT_RESOLUTION : (supported[0] ?? DEFAULT_RESOLUTION);
}

/**
 * After a model change: keep the current resolution if the new model supports
 * it, otherwise reset to that model's default and report the change so the
 * form can say so.
 */
export function reconcileResolution(
  model: ImageModel,
  current: ImageResolution,
): { resolution: ImageResolution; changed: boolean } {
  if (supportedResolutions(model).includes(current)) {
    return { resolution: current, changed: false };
  }
  return { resolution: defaultResolutionFor(model), changed: true };
}
