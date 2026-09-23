import { describe, expect, it } from 'vitest';
import {
  ART_STYLE_REQUIRED,
  PROMPT_REQUIRED,
  toVideoFormValues,
  type VideoFormValues,
  validateVideoForm,
} from './video-form';

const BASE: VideoFormValues = {
  start_seconds: 0,
  end_seconds: 3,
  fps_resolution: 'HALF',
  art_style: 'Clay',
  model: 'default',
  version: 'default',
  prompt_type: 'default',
  prompt: '',
};
const CONTEXT = { durationSeconds: 12.8 };

describe('validateVideoForm — prompt type and prompt', () => {
  it('drops the prompt for the default prompt type, even when the hidden textarea holds text', () => {
    const result = validateVideoForm({ ...BASE, prompt: 'a stale prompt' }, CONTEXT);
    expect(result).toEqual({
      ok: true,
      params: expect.objectContaining({ prompt_type: 'default', prompt: null }),
    });
  });

  it.each(['custom', 'append_default'] as const)('requires a prompt for %s', (promptType) => {
    expect(validateVideoForm({ ...BASE, prompt_type: promptType, prompt: '   ' }, CONTEXT)).toEqual({
      ok: false,
      errors: { prompt: PROMPT_REQUIRED },
    });
  });

  it.each(['custom', 'append_default'] as const)('sends the trimmed prompt for %s', (promptType) => {
    const result = validateVideoForm({ ...BASE, prompt_type: promptType, prompt: '  neon rain  ' }, CONTEXT);
    expect(result).toEqual({
      ok: true,
      params: expect.objectContaining({ prompt_type: promptType, prompt: 'neon rain' }),
    });
  });
});

describe('validateVideoForm — other rules', () => {
  it('requires an art style', () => {
    expect(validateVideoForm({ ...BASE, art_style: '' }, CONTEXT)).toEqual({
      ok: false,
      errors: { art_style: ART_STYLE_REQUIRED },
    });
  });

  it('rejects a clip longer than the max length (schema rule)', () => {
    const result = validateVideoForm({ ...BASE, start_seconds: 1, end_seconds: 7 }, CONTEXT);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.end_seconds).toMatch(/at most 5 seconds/);
  });

  it('rejects a clip that ends after the source', () => {
    const result = validateVideoForm({ ...BASE, start_seconds: 10, end_seconds: 13 }, CONTEXT);
    expect(!result.ok && result.errors.end_seconds).toMatch(/must end by 12.8 s/);
  });

  it('does not check the end against an unknown duration', () => {
    const result = validateVideoForm(
      { ...BASE, start_seconds: 10, end_seconds: 13 },
      { durationSeconds: null },
    );
    expect(result.ok).toBe(true);
  });

  it('returns every param the API takes', () => {
    expect(validateVideoForm(BASE, CONTEXT)).toEqual({
      ok: true,
      params: {
        start_seconds: 0,
        end_seconds: 3,
        fps_resolution: 'HALF',
        art_style: 'Clay',
        model: 'default',
        version: 'default',
        prompt_type: 'default',
        prompt: null,
      },
    });
  });
});

describe('toVideoFormValues', () => {
  it('turns a null prompt into an empty string for the textarea', () => {
    const { prompt: _prompt, ...rest } = BASE;
    const values = toVideoFormValues({ ...rest, art_style: 'Clay', prompt: null });
    expect(values.prompt).toBe('');
  });
});
