import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { velocityEnd, type ScopeTrack } from './scopeModel.ts';
import { loadVec, nextVec, saveVec, VEC_DEFAULT, VEC_STEPS, vecKey } from './vecLength.ts';

const trk = (gs: number | undefined, crs = 90): ScopeTrack => ({ id: 'a', p: [0, 0], gs, crs, trail: [] }) as unknown as ScopeTrack;

describe('velocityEnd', () => {
  it.each(VEC_STEPS)('is exactly %i s of travel at groundspeed, uncapped', (s) => {
    // 480 kt east: 480 * s / 3600 NM (30 s = 4 NM, past the old 2.5 NM cap)
    const e = velocityEnd(trk(480), s)!;
    expect(e[0]).toBeCloseTo((480 * s) / 3600, 9);
    expect(e[1]).toBeCloseTo(0, 9);
  });

  it('defaults to 30 s and draws none under 20 kt or without a groundspeed', () => {
    expect(velocityEnd(trk(360))![0]).toBeCloseTo(3, 9);
    expect(velocityEnd(trk(19), 30)).toBeUndefined();
    expect(velocityEnd(trk(undefined), 30)).toBeUndefined();
    expect(velocityEnd(trk(20), 30)).toBeDefined();
  });
});

describe('vector time', () => {
  // vitest runs in node here: a minimal localStorage
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  afterAll(() => vi.unstubAllGlobals());
  afterEach(() => {
    localStorage.removeItem(vecKey('radar'));
    localStorage.removeItem(vecKey('final'));
  });

  it('cycles 1 → 2 → 5 → 10 → 30 → 1', () => {
    const seen: number[] = [1];
    for (let s = nextVec(1); s !== 1; s = nextVec(s)) seen.push(s);
    expect(seen).toEqual([1, 2, 5, 10, 30]);
    expect(nextVec(30)).toBe(1);
  });

  it('defaults: primary radar 30 s, Approach / Final 2 s', () => {
    expect(VEC_DEFAULT).toEqual({ radar: 30, final: 2 });
    expect(loadVec('radar')).toBe(30);
    expect(loadVec('final')).toBe(2);
  });

  it('remembers each display type on its own, and ignores a bad stored value', () => {
    saveVec('radar', 5);
    expect(loadVec('radar')).toBe(5);
    expect(loadVec('final')).toBe(2);
    localStorage.setItem(vecKey('final'), '7');
    expect(loadVec('final')).toBe(2);
  });
});
