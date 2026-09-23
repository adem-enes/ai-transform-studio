import { describe, expect, it } from 'vitest';
import { IMAGE_MODELS, isResolutionSupported } from '@/schemas';
import { defaultResolutionFor, reconcileResolution, supportedResolutions } from './resolution';

describe('reconcileResolution', () => {
  it('keeps a resolution the new model supports', () => {
    expect(reconcileResolution('seedream-v4', '4k')).toEqual({ resolution: '4k', changed: false });
  });

  it('resets an unsupported resolution to the model default and reports it', () => {
    expect(reconcileResolution('krea-2', '4k')).toEqual({ resolution: '1k', changed: true });
  });

  it('falls back to the first supported resolution when the model lacks the shared default', () => {
    // nano-banana-pro starts at 1k, so 640px is unsupported and 1k (the shared default) is chosen.
    expect(reconcileResolution('nano-banana-pro', '640px')).toEqual({ resolution: '1k', changed: true });
  });

  it('never changes the resolution for the "default" model', () => {
    expect(reconcileResolution('default', '4k')).toEqual({ resolution: '4k', changed: false });
  });

  it.each(IMAGE_MODELS)('always lands on a resolution %s supports', (model) => {
    for (const current of supportedResolutions('default')) {
      const { resolution } = reconcileResolution(model, current);
      expect(isResolutionSupported(model, resolution)).toBe(true);
    }
  });
});

describe('defaultResolutionFor', () => {
  it.each(IMAGE_MODELS)('is supported by %s', (model) => {
    expect(isResolutionSupported(model, defaultResolutionFor(model))).toBe(true);
  });
});
