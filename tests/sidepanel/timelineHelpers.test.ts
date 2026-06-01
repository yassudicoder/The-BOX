import { describe, it, expect } from 'vitest';
import {
  digestHeaderText,
  recentHeaderText,
  shouldShowPass,
} from '../../src/sidepanel/components/Timeline.helpers';

describe('digestHeaderText', () => {
  it('returns empty string when there are no digest items', () => {
    expect(
      digestHeaderText({ count: 0, originalTokens: 0, compressedTokens: 0, savedTokens: 0 })
    ).toBe('');
  });

  it('includes the saved-tokens narrative when compression saved tokens', () => {
    const text = digestHeaderText({
      count: 12,
      originalTokens: 2440,
      compressedTokens: 340,
      savedTokens: 2100,
    });
    expect(text).toContain('Earlier turns');
    expect(text).toContain('shortened to ~340 tokens');
    expect(text).toContain('saved ~2100');
  });

  it('omits the saved narrative when no tokens were saved', () => {
    const text = digestHeaderText({
      count: 3,
      originalTokens: 200,
      compressedTokens: 200,
      savedTokens: 0,
    });
    expect(text).toContain('Earlier turns');
    expect(text).toContain('~200 tokens');
    expect(text).not.toContain('saved');
  });

  it('never surfaces internal compression vocabulary', () => {
    const text = digestHeaderText({
      count: 12,
      originalTokens: 2440,
      compressedTokens: 340,
      savedTokens: 2100,
    });
    // Guards against accidental regression into pipeline vocab.
    expect(text).not.toMatch(/digest/i);
    expect(text).not.toMatch(/provenance/i);
    expect(text).not.toMatch(/verbatim/i);
    expect(text).not.toMatch(/salience/i);
  });
});

describe('recentHeaderText', () => {
  it('returns empty string when there are no recent items', () => {
    expect(recentHeaderText(0)).toBe('');
  });

  it('returns the user-facing recent label when items exist', () => {
    expect(recentHeaderText(6)).toBe('Sent in full');
  });

  it('does not surface internal vocabulary', () => {
    const text = recentHeaderText(4);
    expect(text).not.toMatch(/verbatim/i);
  });
});

describe('shouldShowPass', () => {
  it('hides the pass badge by default (debug=false)', () => {
    expect(shouldShowPass('recency', false)).toBe(false);
    expect(shouldShowPass('salience', false)).toBe(false);
  });

  it('shows the pass badge when debug=true and a pass is attributed', () => {
    expect(shouldShowPass('recency', true)).toBe(true);
    expect(shouldShowPass('instructions', true)).toBe(true);
  });

  it('hides the pass badge when no pass is attributed, even in debug mode', () => {
    expect(shouldShowPass(null, true)).toBe(false);
    expect(shouldShowPass(null, false)).toBe(false);
  });
});
