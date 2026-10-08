import { IMAGE_DEFAULTS, type ImageModel, type ImageResolution, supportedResolutions } from '@/schemas';

/** The resolution a model starts at: the shared default if it supports it, else its first supported one. */
export function defaultResolutionFor(model: ImageModel): ImageResolution {
  const supported = supportedResolutions(model);
  return supported.includes(IMAGE_DEFAULTS.resolution)
    ? IMAGE_DEFAULTS.resolution
    : (supported[0] ?? IMAGE_DEFAULTS.resolution);
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
