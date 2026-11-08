import { describe, expect, it } from 'vitest';
import { cleanPlan } from './protocol.ts';

describe('cleanPlan', () => {
  const base = { deps: [285], stacks: [{ id: 'A', r: 156, base: 6 }] };
  it('keeps the list of switched-off stacks (incl. emergency/helo)', () => {
    expect(cleanPlan({ ...base, off: ['E', 'A'] })).toEqual({ ...base, off: ['E', 'A'] });
    expect(cleanPlan({ ...base, off: [] })).toEqual(base);
  });
  it('rejects malformed off lists', () => {
    expect(cleanPlan({ ...base, off: ['not-an-id'] })).toBeNull();
    expect(cleanPlan({ ...base, off: 'E' })).toBeNull();
  });
});
