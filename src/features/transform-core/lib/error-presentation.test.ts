import { describe, expect, it } from 'vitest';
import { CLIENT_ERROR_CODES } from '@/lib/api/errors';
import { ERROR_CODES } from '@/schemas';
import { ERROR_ACTION_LABELS, getErrorPresentation, mayHaveSpentCredits } from './error-presentation';

const EVERY_CODE = [...ERROR_CODES, ...CLIENT_ERROR_CODES];

describe('getErrorPresentation', () => {
  it.each(EVERY_CODE)('presents %s with a title, description and known action', (code) => {
    const presentation = getErrorPresentation(code);
    expect(presentation.title.length).toBeGreaterThan(0);
    expect(presentation.description.length).toBeGreaterThan(0);
    expect(Object.keys(ERROR_ACTION_LABELS)).toContain(presentation.action);
  });

  it('sends a too-many-jobs error to History', () => {
    expect(getErrorPresentation('TOO_MANY_ACTIVE_JOBS').action).toBe('check-history');
  });

  it('points file problems at choosing another file', () => {
    expect(getErrorPresentation('INVALID_FILE_TYPE').action).toBe('choose-file');
    expect(getErrorPresentation('FILE_TOO_LARGE').action).toBe('choose-file');
  });
});

describe('mayHaveSpentCredits', () => {
  it('flags only failures that happen after the provider accepted the job', () => {
    expect(EVERY_CODE.filter(mayHaveSpentCredits).sort()).toEqual([
      'TRANSFORMATION_FAILED',
      'WEBHOOK_TIMEOUT',
    ]);
  });
});
