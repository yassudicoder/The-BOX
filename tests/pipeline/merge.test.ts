import { describe, it, expect } from 'vitest';
import { mergeById, messageKey } from '../../src/pipeline/merge';
import type { RawMessage } from '../../src/types/raw';

const m = (id: string | undefined, role: RawMessage['role'], html: string): RawMessage => ({
  role,
  html,
  sourceId: id,
});

describe('messageKey', () => {
  it('prefers the stable source id', () => {
    expect(messageKey(m('abc', 'user', '<p>hi</p>'))).toBe('id:abc');
  });

  it('falls back to role+content when there is no id', () => {
    expect(messageKey(m(undefined, 'assistant', '<p>yo</p>'))).toBe('c:assistant\n<p>yo</p>');
  });
});

describe('mergeById', () => {
  it('de-duplicates by id and keeps first-seen order', () => {
    const head = [m('1', 'user', 'q1'), m('2', 'assistant', 'a1'), m('3', 'user', 'q2')];
    const tail = [m('3', 'user', 'q2'), m('4', 'assistant', 'a2'), m('5', 'user', 'q3')];
    const merged = mergeById([head, tail]);
    expect(merged.map((x) => x.sourceId)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('recovers a windowed tail: head batch + a disjoint tail batch', () => {
    // Simulates a virtualizer: top window then bottom window, no overlap.
    const top = [m('1', 'user', 'q1'), m('2', 'assistant', 'a1')];
    const bottom = [m('9', 'user', 'q9'), m('10', 'assistant', 'a10')];
    const merged = mergeById([top, bottom]);
    expect(merged.map((x) => x.sourceId)).toEqual(['1', '2', '9', '10']);
  });

  it('de-duplicates id-less messages by content across batches (overlap)', () => {
    const a = [m(undefined, 'user', 'same')];
    const b = [m(undefined, 'user', 'same'), m(undefined, 'assistant', 'new')];
    const merged = mergeById([a, b]);
    expect(merged).toHaveLength(2);
    expect(merged[1]?.html).toBe('new');
  });

  it('keeps two DISTINCT id-less turns that happen to share content within a batch', () => {
    // e.g. the user asks the same question twice — both are real, separate turns.
    const batch = [
      m(undefined, 'user', 'test'),
      m(undefined, 'assistant', 'ok'),
      m(undefined, 'user', 'test'),
    ];
    const merged = mergeById([batch]);
    expect(merged).toHaveLength(3);
    expect(merged.map((x) => x.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('returns an empty list for no batches', () => {
    expect(mergeById([])).toEqual([]);
  });
});
