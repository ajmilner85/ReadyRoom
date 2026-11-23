import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { tagLabel, tagRows, type ScopeTrack } from './scopeModel.ts';
import { SEATS } from './seats.ts';
import { loadTagId, saveTagId, tagDefault, tagKey } from './tagId.ts';

describe('tagLabel', () => {
  const t = { id: 'x1', bd: '106', cs: 'VOLT 3-1', pi: 'Pilot' };
  it('names by the chosen field (MODEX by default)', () => {
    expect(tagLabel(t)).toBe('106');
    expect(tagLabel(t, 'bd')).toBe('106');
    expect(tagLabel(t, 'cs')).toBe('VOLT 3-1');
  });
  it('falls back to the other field, then the pilot, then the track id', () => {
    expect(tagLabel({ id: 'x1', cs: 'VOLT 3-1' }, 'bd')).toBe('VOLT 3-1');
    expect(tagLabel({ id: 'x1', bd: '106' }, 'cs')).toBe('106');
    expect(tagLabel({ id: 'x1', pi: 'Pilot' }, 'cs')).toBe('Pilot');
    expect(tagLabel({ id: 'x1' }, 'bd')).toBe('x1');
  });
  it('leads the tag rows', () => {
    const tr = { ...t, ty: 'FA-18C_hornet', alt: 16800, gs: 420, vs: -1000, lb: 7400 } as unknown as ScopeTrack;
    expect(tagRows(tr)[0]).toBe('106 F18C 7.4');
    expect(tagRows(tr, undefined, false, 'cs')[0]).toBe('VOLT 3-1 F18C 7.4');
  });
  it('both: the callsign on a line of its own above the MODEX line, the rest unchanged', () => {
    const tr = { ...t, ty: 'FA-18C_hornet', alt: 16800, gs: 420, vs: -1000, lb: 7400 } as unknown as ScopeTrack;
    expect(tagRows(tr, undefined, false, 'both')).toEqual(['VOLT 3-1', ...tagRows(tr)]);
    // a track with only one of them: no extra line
    const noCs = { ...tr, cs: undefined } as unknown as ScopeTrack;
    expect(tagRows(noCs, undefined, false, 'both')).toEqual(tagRows(noCs));
    expect(tagLabel(t, 'both')).toBe('106');
  });
});

describe('tag name per seat', () => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  afterAll(() => vi.unstubAllGlobals());
  afterEach(() => store.clear());

  it('defaults: callsign at the CDC seats, MODEX at CATCC and the Bridge', () => {
    for (const id of ['strike', 'aw', 'suw', 'mission_commander'] as const) expect([id, tagDefault(SEATS[id])]).toEqual([id, 'cs']);
    for (const id of ['catcc', 'airops', 'departure', 'marshal', 'approach', 'final', 'ood'] as const) expect([id, tagDefault(SEATS[id])]).toEqual([id, 'bd']);
    expect(loadTagId(SEATS.strike)).toBe('cs');
    expect(loadTagId(SEATS.marshal)).toBe('bd');
  });

  it('remembers an override per seat, and drops it when set back to the default', () => {
    saveTagId(SEATS.strike, 'bd');
    expect(loadTagId(SEATS.strike)).toBe('bd');
    expect(loadTagId(SEATS.aw)).toBe('cs');
    saveTagId(SEATS.strike, 'cs');
    expect(store.has(tagKey(SEATS.strike))).toBe(false);
    saveTagId(SEATS.catcc, 'cs');
    expect(loadTagId(SEATS.catcc)).toBe('cs');
    expect(loadTagId(SEATS.airops)).toBe('bd');
  });

  it('ignores a bad stored value and a storage that throws', () => {
    store.set(tagKey(SEATS.final), 'pilot');
    expect(loadTagId(SEATS.final)).toBe('bd');
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadTagId(SEATS.suw)).toBe('cs');
    expect(() => saveTagId(SEATS.suw, 'bd')).not.toThrow();
  });
});
