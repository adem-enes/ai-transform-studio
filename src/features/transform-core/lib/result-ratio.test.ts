import { describe, expect, it } from 'vitest';
import { resultRatio } from './result-ratio';

const source = {
  url: 'https://x/s.png',
  mime: 'image/png',
  width: 1200,
  height: 800,
  durationSeconds: null,
  frameRate: null,
};
const output = (width: number | null, height: number | null) => ({
  url: 'https://x/o.png',
  width,
  height,
  durationSeconds: null,
});

describe('resultRatio', () => {
  it('uses the output’s real dimensions', () => {
    expect(resultRatio({ source, output: output(1024, 1024) })).toBe(1);
  });

  it('falls back to the source’s shape for an output stored without dimensions', () => {
    expect(resultRatio({ source, output: output(null, null) })).toBe(1.5);
  });

  it('falls back to the source’s shape while there is no output', () => {
    expect(resultRatio({ source, output: null })).toBe(1.5);
  });

  it('is square when nothing is known', () => {
    expect(resultRatio({ source: { ...source, width: null, height: null }, output: null })).toBe(1);
  });
});
