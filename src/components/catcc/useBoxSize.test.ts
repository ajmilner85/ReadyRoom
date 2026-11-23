import { describe, expect, it } from 'vitest';
import { nextBoxSize } from './useBoxSize.ts';

describe('nextBoxSize', () => {
  const prev = { w: 900, h: 675 };
  it('takes a measured size', () => {
    expect(nextBoxSize(prev, { w: 1834.5, h: 1012 })).toEqual({ w: 1834.5, h: 1012 });
  });
  it('keeps the previous size for a hidden or unlaid element', () => {
    expect(nextBoxSize(prev, { w: 0, h: 0 })).toBe(prev);
    expect(nextBoxSize(prev, { w: 1200, h: 0 })).toBe(prev);
    expect(nextBoxSize(prev, { w: NaN, h: 500 })).toBe(prev);
  });
  it('returns the same object when unchanged, so React skips the re-render', () => {
    expect(nextBoxSize(prev, { w: 900, h: 675 })).toBe(prev);
  });
});
