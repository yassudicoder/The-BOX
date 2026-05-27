import { describe, it, expect } from 'vitest';
import { makeWarning, severityOf } from '../../src/core/warnings';

describe('warning taxonomy', () => {
  it('maps codes to expected severities', () => {
    expect(severityOf('no_user_turn')).toBe('blocker');
    expect(severityOf('budget_unmet')).toBe('warning');
    expect(severityOf('digest_only')).toBe('warning');
    expect(severityOf('extraction_partial')).toBe('warning');
    expect(severityOf('all_dropped_by_compose')).toBe('blocker');
  });

  it('makeWarning returns the full record with title and recommendation', () => {
    const w = makeWarning('budget_unmet');
    expect(w.code).toBe('budget_unmet');
    expect(w.severity).toBe('warning');
    expect(w.title.length).toBeGreaterThan(0);
    expect(w.explanation.length).toBeGreaterThan(0);
    expect(w.recommendedAction.length).toBeGreaterThan(0);
  });

  it('overrides preserve code but allow text edits', () => {
    const w = makeWarning('budget_unmet', { explanation: 'custom explanation' });
    expect(w.code).toBe('budget_unmet');
    expect(w.explanation).toBe('custom explanation');
    expect(w.title).toBe(makeWarning('budget_unmet').title);
  });
});
