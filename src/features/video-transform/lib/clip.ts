import { MEDIA_LIMITS } from '@/schemas';

/** Slider and input granularity, in seconds. Also the shortest clip (the schema needs end > start). */
export const CLIP_STEP = 0.1;

export type Clip = { start: number; end: number };

export type ClipBounds = {
  /** Length of the source in seconds; `null` when unknown (then only the max length applies). */
  duration: number | null;
  /** Longest clip allowed. */
  maxLength: number;
};

export const DEFAULT_MAX_CLIP = MEDIA_LIMITS.video.maxClipSeconds;

/** Rounds to the step, avoiding float drift such as 0.30000000000000004. */
export function roundToStep(seconds: number): number {
  return Math.round(seconds / CLIP_STEP) / (1 / CLIP_STEP);
}

/** The furthest point a clip may end at: the source's length, or — unknown — one max-length clip from 0. */
export function timelineEnd({ duration, maxLength }: ClipBounds): number {
  return roundDown(duration ?? maxLength);
}

/** The clip a fresh source starts with: from 0, as long as allowed. */
export function defaultClip(bounds: ClipBounds): Clip {
  return { start: 0, end: roundDown(Math.min(timelineEnd(bounds), bounds.maxLength)) };
}

/**
 * Applies a change to one end of the clip and returns a valid clip:
 *
 * - both ends stay within 0 … the source's length;
 * - the clip is at least one step long (end > start);
 * - it is never longer than `maxLength` — dragging one end past that pulls
 *   the other end along, so the selection stays valid instead of erroring;
 * - the end that moved wins; the other adjusts.
 *
 * A source shorter than one step yields the whole source.
 */
export function moveClip(clip: Clip, changed: 'start' | 'end', value: number, bounds: ClipBounds): Clip {
  const limit = timelineEnd(bounds);
  const maxLength = Math.min(bounds.maxLength, limit);
  if (limit < CLIP_STEP) {
    return { start: 0, end: limit };
  }
  const safe = Number.isFinite(value) ? value : changed === 'start' ? clip.start : clip.end;

  if (changed === 'start') {
    const start = clamp(roundToStep(safe), 0, limit - CLIP_STEP);
    let end = clamp(clip.end, start + CLIP_STEP, limit);
    if (end - start > maxLength) {
      end = start + maxLength;
    }
    return { start: roundToStep(start), end: roundToStep(end) };
  }

  const end = clamp(roundToStep(safe), CLIP_STEP, limit);
  let start = clamp(clip.start, 0, end - CLIP_STEP);
  if (end - start > maxLength) {
    start = end - maxLength;
  }
  return { start: roundToStep(start), end: roundToStep(end) };
}

/** Brings a clip (e.g. restored from an earlier job) inside the bounds, keeping its start where possible. */
export function fitClip(clip: Clip, bounds: ClipBounds): Clip {
  return moveClip(moveClip(clip, 'start', clip.start, bounds), 'end', clip.end, bounds);
}

export function clipLength({ start, end }: Clip): number {
  return roundToStep(end - start);
}

/** 3.2 → "3.2 s"; 12 → "12 s". */
export function formatSeconds(seconds: number): string {
  return `${String(roundToStep(seconds))} s`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Floors to the step, so a 12.87 s source offers 12.8 s, never a point past its end. */
function roundDown(seconds: number): number {
  return Math.floor(seconds / CLIP_STEP + 1e-9) / (1 / CLIP_STEP);
}
