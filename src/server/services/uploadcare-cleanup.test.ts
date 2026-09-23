import { describe, expect, it } from 'vitest';
import { chunk, selectStaleFiles, UPLOADCARE_MIN_AGE_MS } from './uploadcare-cleanup';

const NOW = Date.parse('2026-09-23T12:00:00.000Z');
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe('selectStaleFiles', () => {
  it('keeps only files older than an hour, oldest first, skipping removed ones', () => {
    const files = [
      { uuid: 'fresh', datetimeUploaded: at(5 * 60_000), datetimeRemoved: null },
      { uuid: 'just-under', datetimeUploaded: at(UPLOADCARE_MIN_AGE_MS - 1), datetimeRemoved: null },
      { uuid: 'old', datetimeUploaded: at(2 * UPLOADCARE_MIN_AGE_MS), datetimeRemoved: null },
      { uuid: 'older', datetimeUploaded: at(30 * UPLOADCARE_MIN_AGE_MS), datetimeRemoved: null },
      { uuid: 'removed', datetimeUploaded: at(30 * UPLOADCARE_MIN_AGE_MS), datetimeRemoved: at(1000) },
    ];

    expect(selectStaleFiles(files, NOW).map((file) => file.uuid)).toEqual(['older', 'old']);
  });
});

describe('chunk', () => {
  it('splits into batches of at most the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 100)).toEqual([]);
  });
});
