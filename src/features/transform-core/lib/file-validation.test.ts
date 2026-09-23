import { describe, expect, it } from 'vitest';
import { MEDIA_LIMITS } from '@/schemas';
import { describeAllowedTypes, validateFile } from './file-validation';

describe('validateFile', () => {
  it.each(MEDIA_LIMITS.image.mimeTypes)('accepts an image of type %s within the limit', (type) => {
    expect(validateFile({ type, size: 1024 }, 'image')).toEqual({ ok: true });
  });

  it('accepts a file exactly at the size limit', () => {
    expect(validateFile({ type: 'image/png', size: MEDIA_LIMITS.image.maxBytes }, 'image').ok).toBe(true);
  });

  it('rejects a file one byte over the limit, saying how large it is', () => {
    const result = validateFile({ type: 'image/png', size: MEDIA_LIMITS.image.maxBytes + 1 }, 'image');
    expect(result).toMatchObject({ ok: false, code: 'FILE_TOO_LARGE' });
    expect(result.ok || result.message).toContain('10 MB');
  });

  it.each([
    ['a GIF', 'image/gif'],
    ['an SVG', 'image/svg+xml'],
    ['a video', 'video/mp4'],
    ['a file with no type', ''],
  ])('rejects %s for the image flow', (_label, type) => {
    expect(validateFile({ type, size: 1024 }, 'image')).toMatchObject({
      ok: false,
      code: 'INVALID_FILE_TYPE',
    });
  });

  it('matches types case-insensitively', () => {
    expect(validateFile({ type: 'IMAGE/PNG', size: 1024 }, 'image').ok).toBe(true);
  });

  it('checks the type before the size', () => {
    const result = validateFile({ type: 'image/gif', size: MEDIA_LIMITS.image.maxBytes * 2 }, 'image');
    expect(result).toMatchObject({ code: 'INVALID_FILE_TYPE' });
  });

  it('rejects an empty file', () => {
    expect(validateFile({ type: 'image/png', size: 0 }, 'image').ok).toBe(false);
  });

  it('uses the video limits for the video flow', () => {
    expect(validateFile({ type: 'video/mp4', size: MEDIA_LIMITS.image.maxBytes + 1 }, 'video').ok).toBe(true);
    expect(validateFile({ type: 'image/png', size: 1024 }, 'video').ok).toBe(false);
  });
});

describe('describeAllowedTypes', () => {
  it('lists the image types from the shared limits', () => {
    expect(describeAllowedTypes('image')).toBe('JPEG, PNG or WebP');
  });
});
