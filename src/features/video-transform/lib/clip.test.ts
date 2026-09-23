import { describe, expect, it } from 'vitest';
import { CLIP_STEP, clipLength, defaultClip, fitClip, moveClip, timelineEnd } from './clip';

const LONG = { duration: 12.8, maxLength: 5 };

describe('defaultClip', () => {
  it('starts at 0 and is as long as allowed', () => {
    expect(defaultClip(LONG)).toEqual({ start: 0, end: 5 });
  });

  it('covers the whole source when it is shorter than the max length', () => {
    expect(defaultClip({ duration: 3.27, maxLength: 5 })).toEqual({ start: 0, end: 3.2 });
  });

  it('falls back to one max-length clip when the duration is unknown', () => {
    expect(defaultClip({ duration: null, maxLength: 5 })).toEqual({ start: 0, end: 5 });
  });
});

describe('moveClip', () => {
  it('moves the start freely inside the limits', () => {
    expect(moveClip({ start: 0, end: 5 }, 'start', 2.34, LONG)).toEqual({ start: 2.3, end: 5 });
  });

  it('pulls the end along when the end is dragged past the max length', () => {
    expect(moveClip({ start: 1, end: 5 }, 'end', 9, LONG)).toEqual({ start: 4, end: 9 });
  });

  it('pushes the end along when the start is dragged past it', () => {
    expect(moveClip({ start: 1, end: 3 }, 'start', 6, LONG)).toEqual({ start: 6, end: 6.1 });
  });

  it('pulls the start back when the end is dragged before it', () => {
    expect(moveClip({ start: 4, end: 6 }, 'end', 2, LONG)).toEqual({ start: 1.9, end: 2 });
  });

  it('never ends past the source duration', () => {
    expect(moveClip({ start: 8, end: 12 }, 'end', 20, LONG)).toEqual({ start: 8, end: 12.8 });
    expect(moveClip({ start: 8, end: 12 }, 'start', 20, LONG)).toEqual({ start: 12.7, end: 12.8 });
  });

  it('keeps a start inside a long clip without shortening it', () => {
    expect(moveClip({ start: 2, end: 7 }, 'start', 3, LONG)).toEqual({ start: 3, end: 7 });
  });

  it('keeps the clip at most max length when the start moves back', () => {
    expect(moveClip({ start: 5, end: 10 }, 'start', 1, LONG)).toEqual({ start: 1, end: 6 });
  });

  it('treats a source shorter than the max length as the limit', () => {
    const short = { duration: 3, maxLength: 5 };
    expect(moveClip({ start: 0, end: 3 }, 'end', 10, short)).toEqual({ start: 0, end: 3 });
    expect(moveClip({ start: 0, end: 3 }, 'start', 1.5, short)).toEqual({ start: 1.5, end: 3 });
  });

  it('never returns a clip shorter than one step', () => {
    const clip = moveClip({ start: 2, end: 2.5 }, 'start', 2.5, LONG);
    expect(clipLength(clip)).toBeGreaterThanOrEqual(CLIP_STEP);
  });

  it('ignores a non-numeric value (an emptied input)', () => {
    expect(moveClip({ start: 1, end: 3 }, 'start', Number.NaN, LONG)).toEqual({ start: 1, end: 3 });
  });

  it('returns the whole source when it is shorter than one step', () => {
    expect(moveClip({ start: 0, end: 0 }, 'end', 1, { duration: 0.05, maxLength: 5 })).toEqual({
      start: 0,
      end: 0,
    });
  });
});

describe('fitClip', () => {
  it('shortens a restored clip that runs past a shorter source', () => {
    expect(fitClip({ start: 2, end: 7 }, { duration: 4, maxLength: 5 })).toEqual({ start: 2, end: 4 });
  });
});

describe('timelineEnd', () => {
  it('floors to the step so the slider never goes past the end', () => {
    expect(timelineEnd({ duration: 12.87, maxLength: 5 })).toBe(12.8);
  });
});
