import { describe, expect, it } from 'vitest';
import { destination } from '../../catcc/core/geo.ts';
import type { WireTrack } from '../../catcc/core/room/protocol.ts';
import { buildPicture, phaseOf, shortType, tagRows, type Trail } from './scopeModel.ts';

const CV = { lat: 26.2, lon: 56.8 };
function at(brg: number, rng: number) {
  return destination(CV.lat, CV.lon, brg, rng);
}
function jet(id: string, brg: number, rng: number, extra: Partial<WireTrack> = {}): WireTrack {
  return { id, k: 'fixedwing', ty: 'FA-18C_hornet', sd: 'blue', alt: 20000, gs: 420, crs: 0, ...at(brg, rng), ...extra };
}
const carrier: WireTrack = { id: 'cv', k: 'carrier', ty: 'CVN_72', hull: 'CVN-72', sd: 'blue', alt: 60, gs: 25, crs: 345, hdg: 345, ...CV };

describe('buildPicture', () => {
  it('projects about the focus carrier and derives the ship reference', () => {
    const pic = buildPicture([carrier, jet('a', 90, 20)], 'CVN-72', new Map(), 100);
    expect(pic.focus?.ship).toEqual({ brc: 345, fb: 336 });
    const a = pic.air[0];
    expect(a.rng).toBeCloseTo(20, 6);
    expect(a.brg).toBeCloseTo(90, 4);
    expect(a.p[0]).toBeCloseTo(20, 3);
  });

  it('collapses close formations by DCS group and finds the low state', () => {
    const pic = buildPicture(
      [carrier, jet('1', 90, 30, { g: 'Volt 3', cs: 'VOLT 3-2', lb: 6200 }), jet('2', 90, 30.3, { g: 'Volt 3', cs: 'VOLT 3-1', lb: 5900 }), jet('3', 200, 30, { g: 'Hawk 1' })],
      'CVN-72',
      new Map(),
      0,
    );
    const volt = pic.formations.find((f) => f.group === 'Volt 3')!;
    expect(volt.lead.cs).toBe('VOLT 3-1');
    expect(volt.collapsible).toBe(true);
    expect(volt.lowFuelLb).toBe(5900);
    expect(tagRows(volt.lead, volt, true)[2]).toBe('FLT ×2 · LOW 5.9');
  });

  it('flags converging traffic at the same altitude but not formation mates', () => {
    const pic = buildPicture(
      [carrier, jet('a', 0, 20, { crs: 90, g: 'A' }), jet('b', 30, 20, { crs: 270, g: 'B' }), jet('c', 0, 20.2, { crs: 90, g: 'A' })],
      'CVN-72',
      new Map(),
      0,
    );
    const ids = pic.conflicts.map((c) => [c.a.id, c.b.id].sort().join('-')).sort();
    expect(ids).toEqual(['a-b', 'b-c']);
  });

  it('builds trail dots from history at ~6 s spacing', () => {
    const h: Trail[] = Array.from({ length: 40 }, (_, i) => ({ t: i, ...at(90, 10 + i * 0.1) }));
    const pic = buildPicture([carrier, jet('a', 90, 14)], 'CVN-72', new Map([['a', h]]), 39);
    expect(pic.air[0].trail).toHaveLength(5);
    expect(pic.air[0].trail[0][0]).toBeCloseTo(13.3, 1);
  });
});

describe('tags and phases', () => {
  it('formats rows', () => {
    const [carrierless] = buildPicture([carrier, jet('a', 90, 20, { bd: '106', lb: 7400, vs: -2000, alt: 16800 })], 'CVN-72', new Map(), 0).air;
    expect(tagRows(carrierless)).toEqual(['106 F18C 7.4', '↓168 420']);
    expect(shortType('Some_New-Type')).toBe('SOME');
  });

  it('classifies phases', () => {
    const pic = buildPicture(
      [carrier, jet('in', 90, 40, { crs: 270 }), jet('out', 90, 20, { crs: 90 }), jet('app', 160, 8, { crs: 340, alt: 1200 }), jet('tk', 0, 5, { ty: 'S-3B Tanker' })],
      'CVN-72',
      new Map(),
      0,
    );
    const ph = Object.fromEntries(pic.formations.map((f) => [f.lead.id, phaseOf(f, new Set(['none']))]));
    expect(ph).toEqual({ in: 'inbound', out: 'departure', app: 'approach', tk: 'support' });
    expect(phaseOf(pic.formations.find((f) => f.lead.id === 'in')!, new Set(['in']))).toBe('marshal');
  });
});
