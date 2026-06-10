import { describe, it, expect } from 'vitest';
import {
  isPendingFresh,
  PENDING_CAPTURE_TTL_MS,
  type PendingCapture,
} from '../../src/messaging/pendingCapture';

const NOW = 1_000_000;

describe('isPendingFresh', () => {
  it('accepts a flag written just now', () => {
    expect(isPendingFresh({ tabId: 7, at: NOW }, NOW)).toBe(true);
  });

  it('accepts a flag within the TTL window', () => {
    expect(isPendingFresh({ tabId: 7, at: NOW - PENDING_CAPTURE_TTL_MS + 1 }, NOW)).toBe(true);
  });

  it('rejects a flag older than the TTL', () => {
    expect(isPendingFresh({ tabId: 7, at: NOW - PENDING_CAPTURE_TTL_MS - 1 }, NOW)).toBe(false);
  });

  it('rejects a flag with a future timestamp (clock skew / replay)', () => {
    expect(isPendingFresh({ tabId: 7, at: NOW + 5000 }, NOW)).toBe(false);
  });

  it('rejects null/undefined and malformed shapes', () => {
    expect(isPendingFresh(undefined, NOW)).toBe(false);
    expect(isPendingFresh(null, NOW)).toBe(false);
    expect(isPendingFresh({ at: NOW } as unknown as PendingCapture, NOW)).toBe(false);
    expect(isPendingFresh({ tabId: 7 } as unknown as PendingCapture, NOW)).toBe(false);
  });
});
