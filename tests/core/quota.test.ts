import { describe, it, expect } from 'vitest';
import {
  parseUsageResponse,
  normalizeResetsAt,
  estimateMessagesLeft,
  formatResetCountdown,
  orgIdFromCookies,
  MODEL_BURN_RATES,
} from '../../src/core/context/quota';

describe('normalizeResetsAt', () => {
  it('parses an ISO string to epoch ms', () => {
    expect(normalizeResetsAt('2026-06-13T10:00:00.000Z')).toBe(Date.parse('2026-06-13T10:00:00.000Z'));
  });
  it('treats a plain number as unix-epoch SECONDS', () => {
    expect(normalizeResetsAt(1781340000)).toBe(1781340000 * 1000);
  });
  it('leaves an epoch-ms number as-is (no double multiply)', () => {
    expect(normalizeResetsAt(1781340000000)).toBe(1781340000000);
  });
  it('returns null for garbage', () => {
    expect(normalizeResetsAt('not a date')).toBe(null);
    expect(normalizeResetsAt(null)).toBe(null);
    expect(normalizeResetsAt({})).toBe(null);
  });
});

describe('parseUsageResponse', () => {
  it('parses a 0..1 fraction response', () => {
    const q = parseUsageResponse({
      five_hour: { utilization: 0.42, resets_at: '2026-06-13T12:00:00Z' },
      seven_day: { utilization: 0.1, resets_at: '2026-06-20T12:00:00Z' },
    });
    expect(q).not.toBeNull();
    expect(q!.fiveHour.utilization).toBeCloseTo(0.42);
    expect(q!.fiveHour.resetsAtMs).toBe(Date.parse('2026-06-13T12:00:00Z'));
  });

  it('normalizes a 0..100 percent response to 0..1', () => {
    const q = parseUsageResponse({
      five_hour: { utilization: 47, resets_at: 1781340000 },
      seven_day: { utilization: 12, resets_at: 1781940000 },
    });
    expect(q!.fiveHour.utilization).toBeCloseTo(0.47);
    expect(q!.sevenDay.utilization).toBeCloseTo(0.12);
    expect(q!.fiveHour.resetsAtMs).toBe(1781340000 * 1000);
  });

  it('clamps utilization into 0..1', () => {
    const q = parseUsageResponse({
      five_hour: { utilization: 130, resets_at: 1781340000 },
      seven_day: { utilization: 0, resets_at: 1781940000 },
    });
    expect(q!.fiveHour.utilization).toBe(1);
    expect(q!.sevenDay.utilization).toBe(0);
  });

  it('threads the model through', () => {
    const q = parseUsageResponse(
      { five_hour: { utilization: 0.1, resets_at: 1 }, seven_day: { utilization: 0.1, resets_at: 1 } },
      'Claude Sonnet 4.5'
    );
    expect(q!.model).toBe('Claude Sonnet 4.5');
  });

  it('returns null on ANY shape mismatch (resilience)', () => {
    expect(parseUsageResponse(null)).toBeNull();
    expect(parseUsageResponse({})).toBeNull();
    expect(parseUsageResponse({ five_hour: { utilization: 0.1, resets_at: 1 } })).toBeNull(); // no seven_day
    expect(
      parseUsageResponse({ five_hour: { resets_at: 1 }, seven_day: { utilization: 0.1, resets_at: 1 } })
    ).toBeNull(); // missing utilization
    expect(
      parseUsageResponse({
        five_hour: { utilization: 0.1, resets_at: 'bad' },
        seven_day: { utilization: 0.1, resets_at: 1 },
      })
    ).toBeNull(); // unparseable reset
    expect(
      parseUsageResponse({
        five_hour: { utilization: 'high', resets_at: 1 },
        seven_day: { utilization: 0.1, resets_at: 1 },
      })
    ).toBeNull(); // non-numeric utilization
  });
});

describe('estimateMessagesLeft', () => {
  it('projects from remaining fraction and per-model burn rate', () => {
    // sonnet burn ~1/45 → at 0% used, ~45 left
    expect(estimateMessagesLeft(0, 'Claude Sonnet 4.5')).toBe(Math.floor(1 / MODEL_BURN_RATES.sonnet));
    // opus burns faster → fewer left at the same utilization
    expect(estimateMessagesLeft(0, 'Claude Opus 4.8')).toBeLessThan(
      estimateMessagesLeft(0, 'Claude Sonnet 4.5')
    );
  });
  it('is 0 when the session is full', () => {
    expect(estimateMessagesLeft(1, 'sonnet')).toBe(0);
  });
  it('falls back to the default burn rate for an unknown model', () => {
    expect(estimateMessagesLeft(0, 'mystery-model')).toBe(Math.floor(1 / MODEL_BURN_RATES.sonnet));
  });
});

describe('formatResetCountdown', () => {
  const now = 1_000_000_000_000;
  it('formats hours and minutes', () => {
    expect(formatResetCountdown(now + (2 * 60 + 13) * 60_000, now)).toBe('2h 13m');
  });
  it('drops the hour part under an hour', () => {
    expect(formatResetCountdown(now + 45 * 60_000, now)).toBe('45m');
  });
  it('never goes negative', () => {
    expect(formatResetCountdown(now - 5 * 60_000, now)).toBe('0m');
  });
});

describe('orgIdFromCookies', () => {
  it('reads lastActiveOrg', () => {
    expect(orgIdFromCookies('foo=1; lastActiveOrg=abc-123; bar=2')).toBe('abc-123');
  });
  it('url-decodes the value', () => {
    expect(orgIdFromCookies('lastActiveOrg=a%2Fb')).toBe('a/b');
  });
  it('returns null when absent', () => {
    expect(orgIdFromCookies('foo=1; bar=2')).toBe(null);
    expect(orgIdFromCookies('')).toBe(null);
  });
});
