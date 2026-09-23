import { describe, expect, it } from 'vitest';
import { describeVideoCost, estimateVideoCost } from './cost';

describe('estimateVideoCost', () => {
  it('matches the documented 48 credits per second at 24 fps', () => {
    expect(estimateVideoCost({ clipSeconds: 1, fpsResolution: 'FULL', sourceFps: 24 })).toEqual({
      kind: 'estimate',
      credits: 48,
      outputFps: 24,
    });
  });

  it('halves the rendered frames — and the credits — at HALF', () => {
    expect(estimateVideoCost({ clipSeconds: 5, fpsResolution: 'HALF', sourceFps: 30 })).toEqual({
      kind: 'estimate',
      credits: 150,
      outputFps: 15,
    });
    expect(estimateVideoCost({ clipSeconds: 5, fpsResolution: 'FULL', sourceFps: 30 })).toMatchObject({
      credits: 300,
    });
  });

  it('rounds partial frames up', () => {
    // 3.2 s × 29.97 / 2 = 47.95 frames → 48 frames → 96 credits
    expect(estimateVideoCost({ clipSeconds: 3.2, fpsResolution: 'HALF', sourceFps: 29.97 })).toMatchObject({
      credits: 96,
    });
  });

  it('falls back to the documented rate when the source frame rate is unknown', () => {
    expect(estimateVideoCost({ clipSeconds: 5, fpsResolution: 'HALF', sourceFps: null })).toEqual({
      kind: 'rate',
    });
  });
});

describe('describeVideoCost', () => {
  it('marks an estimate as approximate', () => {
    expect(describeVideoCost({ kind: 'estimate', credits: 1200, outputFps: 24 })).toBe('~1,200 credits');
    expect(describeVideoCost({ kind: 'rate' })).toBe('48 credits per second at 24 fps');
  });
});
