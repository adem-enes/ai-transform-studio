import { describe, expect, it } from 'vitest';
import { transformRequest } from './api';
import { MEDIA_LIMITS } from './media';
import { imageTransformParams, transformSpec, videoTransformParams } from './transform-params';

const UPLOAD_ID = '65f1c0ffee0000000000abcd';

describe('imageTransformParams', () => {
  it('accepts a prompt alone and applies defaults', () => {
    expect(imageTransformParams.parse({ prompt: '  Give me sunglasses ' })).toEqual({
      prompt: 'Give me sunglasses',
      model: 'flux-2-klein',
      aspect_ratio: 'auto',
      resolution: '1k',
    });
  });

  it('accepts a full, compatible set of options', () => {
    const params = { prompt: 'Make it night', model: 'seedream-v4', aspect_ratio: '16:9', resolution: '4k' };
    expect(imageTransformParams.parse(params)).toEqual(params);
  });

  it.each([
    ['an empty prompt', { prompt: '   ' }],
    ['a missing prompt', {}],
    ['an unknown model', { prompt: 'x', model: 'dall-e' }],
    ['an unknown aspect ratio', { prompt: 'x', aspect_ratio: '21:9' }],
    ['an unknown resolution', { prompt: 'x', resolution: '8k' }],
    ['the deprecated "auto" resolution', { prompt: 'x', resolution: 'auto' }],
  ])('rejects %s', (_label, input) => {
    expect(imageTransformParams.safeParse(input).success).toBe(false);
  });

  it('rejects a resolution the chosen model does not support', () => {
    const result = imageTransformParams.safeParse({ prompt: 'x', model: 'krea-2', resolution: '4k' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['resolution']);
  });

  it('leaves resolution support for the "default" model to the provider', () => {
    expect(imageTransformParams.safeParse({ prompt: 'x', model: 'default', resolution: '4k' }).success).toBe(
      true,
    );
  });
});

describe('videoTransformParams', () => {
  const valid = { start_seconds: 0, end_seconds: 3, art_style: 'Studio Ghibli' };

  it('accepts a clip with an art style and applies defaults', () => {
    expect(videoTransformParams.parse(valid)).toEqual({
      ...valid,
      fps_resolution: 'HALF',
      model: 'default',
      version: 'default',
      prompt_type: 'default',
      prompt: null,
    });
  });

  it('accepts a custom prompt', () => {
    const params = {
      ...valid,
      prompt_type: 'custom',
      prompt: 'neon city at night',
      version: 'v2',
      model: 'Dreamshaper',
    };
    expect(videoTransformParams.safeParse(params).success).toBe(true);
  });

  it.each([
    ['an unknown art style', { art_style: 'Picasso' }],
    ['an unknown model', { model: 'Midjourney' }],
    ['an unknown version', { version: 'v3' }],
    ['an unknown prompt type', { prompt_type: 'replace' }],
    ['an unknown fps resolution', { fps_resolution: 'QUARTER' }],
    ['a negative start', { start_seconds: -1 }],
  ])('rejects %s', (_label, override) => {
    expect(videoTransformParams.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it('rejects a missing art style', () => {
    expect(videoTransformParams.safeParse({ start_seconds: 0, end_seconds: 3 }).success).toBe(false);
  });

  it.each([
    ['end equal to start', 2, 2],
    ['end before start', 3, 1],
  ])('rejects %s', (_label, start, end) => {
    const result = videoTransformParams.safeParse({ ...valid, start_seconds: start, end_seconds: end });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual(['end_seconds']);
  });

  it('accepts a clip exactly at the maximum length', () => {
    const max = MEDIA_LIMITS.video.maxClipSeconds;
    expect(
      videoTransformParams.safeParse({ ...valid, start_seconds: 10, end_seconds: 10 + max }).success,
    ).toBe(true);
  });

  it('rejects a clip longer than the maximum length', () => {
    const max = MEDIA_LIMITS.video.maxClipSeconds;
    const result = videoTransformParams.safeParse({
      ...valid,
      start_seconds: 10,
      end_seconds: 10 + max + 0.1,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['end_seconds']);
  });

  it.each(['custom', 'append_default'])('requires a prompt when prompt_type is %s', (promptType) => {
    const result = videoTransformParams.safeParse({ ...valid, prompt_type: promptType });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['prompt']);
  });
});

describe('transformSpec / transformRequest', () => {
  it('discriminates on kind', () => {
    const image = transformSpec.parse({ kind: 'image', params: { prompt: 'x' } });
    expect(image.kind).toBe('image');
    expect(transformSpec.safeParse({ kind: 'video', params: { prompt: 'x' } }).success).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(transformSpec.safeParse({ kind: 'audio', params: {} }).success).toBe(false);
  });

  it('requires a well-formed uploadId', () => {
    const request = { kind: 'image', params: { prompt: 'x' } };
    expect(transformRequest.safeParse({ ...request, uploadId: UPLOAD_ID }).success).toBe(true);
    expect(transformRequest.safeParse({ ...request, uploadId: 'nope' }).success).toBe(false);
  });
});
