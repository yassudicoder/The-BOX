import { describe, it, expect } from 'vitest';
import {
  loadStabilized,
  captureIsTruncated,
  type LoadSample,
} from '../../src/pipeline/completeness';

const sample = (height: number, count: number): LoadSample => ({ height, count });

describe('loadStabilized', () => {
  it('is stable only when BOTH height and count are unchanged', () => {
    expect(loadStabilized(sample(1000, 20), sample(1000, 20))).toBe(true);
  });

  it('is unstable when the message count is still growing (height can lie for virtual lists)', () => {
    // Same reserved scroll height, but more rows mounted → still loading.
    expect(loadStabilized(sample(1000, 18), sample(1000, 20))).toBe(false);
  });

  it('is unstable when height is still growing', () => {
    expect(loadStabilized(sample(800, 20), sample(1000, 20))).toBe(false);
  });
});

describe('captureIsTruncated', () => {
  it('flags a missing opening prompt (head heuristic)', () => {
    expect(
      captureIsTruncated({ headHeuristic: true, scrollConfirmedStable: true, scrollPasses: 3 })
    ).toBe(true);
  });

  it('flags when we scrolled but the conversation never stopped growing', () => {
    expect(
      captureIsTruncated({ headHeuristic: false, scrollConfirmedStable: false, scrollPasses: 8 })
    ).toBe(true);
  });

  it('does not flag a fully-loaded capture', () => {
    expect(
      captureIsTruncated({ headHeuristic: false, scrollConfirmedStable: true, scrollPasses: 2 })
    ).toBe(false);
  });

  it('does not flag when there was no scroller to scroll (zero passes is not evidence of loss)', () => {
    expect(
      captureIsTruncated({ headHeuristic: false, scrollConfirmedStable: false, scrollPasses: 0 })
    ).toBe(false);
  });
});
