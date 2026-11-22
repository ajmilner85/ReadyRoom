import { describe, expect, it } from 'vitest';
import { destination } from '../../catcc/core/geo.ts';
import type { WireTrack } from '../../catcc/core/room/protocol.ts';
import { buildPicture, FINAL_CONFLICT_LOOKAHEAD_S, inAltBlock, phaseOf, proximityClusters, shortType, specificEnergyFt, tagRows, typeName, type ScopeTrack, type Trail } from './scopeModel.ts';

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

  it('keeps aircraft on a deck or runway off the radar picture but in pic.ground', () => {
    // DCS says it is on the deck (inAir false); one in the air; one with no flag sitting on the carrier
    const parked = jet('parked', 0, 0.05, { alt: 65, gs: 25, air: false });
    const flying = jet('flying', 90, 3, { alt: 1200, gs: 140, air: true });
    const noFlag = jet('noflag', 180, 0.04, { alt: 66, gs: 25 });
    const lowPass = jet('lowpass', 180, 0.04, { alt: 66, gs: 300 }); // over the deck at speed: airborne
    const pic = buildPicture([carrier, parked, flying, noFlag, lowPass], 'CVN-72', new Map(), 100);
    expect(pic.air.map((t) => t.id).sort()).toEqual(['flying', 'lowpass']);
    expect(pic.ground?.map((t) => t.id).sort()).toEqual(['noflag', 'parked']);
  });

  it('a landed aircraft stays drawn while its airborne trail ages out, then for 1.5 s, then goes', () => {
    // in the air until t = 100 coming up the final, on the deck from t = 101 (one sample a second)
    const hist = (now: number): Trail[] =>
      Array.from({ length: now + 1 }, (_, t) => (t <= 100 ? { t, ...at(165, 2 - t * 0.02) } : { t, ...at(165, 0.03), gnd: true })).slice(-40);
    const landed = jet('j', 165, 0.03, { alt: 65, gs: 25, air: false });
    const pic = (now: number) => buildPicture([carrier, landed], 'CVN-72', new Map([['j', hist(now)]]), now);
    // just after touchdown: drawn, flagged, with its airborne trail; not a conflict or formation candidate
    const p1 = pic(104);
    expect(p1.air.map((t) => t.id)).toEqual(['j']);
    expect(p1.air[0].landing).toBe(true);
    expect(p1.air[0].trail.length).toBeGreaterThan(3);
    // the trail shortens as the airborne dots age out (span 5.5 x 6 s = 33 s)
    const mid = pic(120).air[0].trail.length;
    expect(mid).toBeLessThan(p1.air[0].trail.length);
    expect(mid).toBeGreaterThan(0);
    // no trail left, the hit held a moment longer ...
    const p3 = pic(134);
    expect(p3.air[0]?.trail.length).toBe(0);
    // ... then it's off the radar, on the deck
    const p4 = pic(136);
    expect(p4.air).toHaveLength(0);
    expect(p4.ground?.map((t) => t.id)).toEqual(['j']);
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
    expect(ids).toEqual(['a-b']); // a and c are one flight: one alert for the pair of flights
  });

  it('builds trail dots from history at ~6 s spacing', () => {
    const h: Trail[] = Array.from({ length: 40 }, (_, i) => ({ t: i, ...at(90, 10 + i * 0.1) }));
    const pic = buildPicture([carrier, jet('a', 90, 14)], 'CVN-72', new Map([['a', h]]), 39);
    expect(pic.air[0].trail).toHaveLength(5);
    expect(pic.air[0].trail[0][0]).toBeCloseTo(13.3, 1);
  });
});

describe('conflict predictor tuning', () => {
  it('does not extrapolate climb/descent for the whole window (screenshot case: 13,400 ft climbing vs 20,900 ft descending)', () => {
    // head-on 40 NM apart at 420 kt each: CPA in ~171 s. Rates chosen so full extrapolation
    // would close the 7,500 ft gap exactly at CPA.
    const a = { crs: 90, alt: 13400, vs: 1400, g: 'A' };
    const b = { crs: 270, alt: 20900, vs: -1300, g: 'B' };
    const pic = (cap: number) => buildPicture([carrier, jet('a', 270, 20, a), jet('b', 90, 20, b)], 'CVN-72', new Map(), 0, { vertCapS: cap, conflictLookAheadS: 240 });
    expect(pic(30).conflicts).toHaveLength(0);
    expect(pic(240).conflicts).toHaveLength(1);
  });

  it('ignores aircraft joined on a tanker (close, level, matched course and speed)', () => {
    const pic = buildPicture(
      [carrier, jet('tk', 90, 20, { ty: 'S-3B Tanker', g: 'Arco', crs: 270, gs: 250, alt: 6000 }), jet('rx', 90, 20.05, { g: 'Volt 3', crs: 272, gs: 255, alt: 6050 })],
      'CVN-72',
      new Map(),
      0,
    );
    expect(pic.conflicts).toHaveLength(0);
  });

  it('reports one alert per pair of flights', () => {
    const pic = buildPicture(
      [carrier, jet('a1', 0, 20, { crs: 90, g: 'A' }), jet('a2', 0, 20.3, { crs: 90, g: 'A' }), jet('b1', 30, 20, { crs: 270, g: 'B' })],
      'CVN-72',
      new Map(),
      0,
    );
    expect(pic.conflicts).toHaveLength(1);
  });

  it('does not predict an assigned aircraft below its marshal level', () => {
    const a = { crs: 90, alt: 9500, vs: -4000, g: 'A' };
    const b = { crs: 270, alt: 7000, vs: 0, g: 'B' };
    const free = buildPicture([carrier, jet('a', 0, 20, a), jet('b', 30, 20, b)], 'CVN-72', new Map(), 0, { vertCapS: 120 });
    const held = buildPicture([carrier, jet('a', 0, 20, a), jet('b', 30, 20, b)], 'CVN-72', new Map(), 0, { vertCapS: 120, floors: new Map([['a', 9000]]) });
    expect(free.conflicts).toHaveLength(1);
    expect(held.conflicts).toHaveLength(0);
  });

  it('never predicts from a groundspeed no aircraft flies (a replay jump read as 16,336 kt)', () => {
    const pic = buildPicture([carrier, jet('a', 0, 20, { crs: 90, gs: 16336, g: 'A' }), jet('b', 30, 20, { crs: 270, g: 'B' })], 'CVN-72', new Map(), 0);
    expect(pic.conflicts).toHaveLength(0);
    expect(pic.finalConflicts).toHaveLength(0);
  });
});

describe('Approach / Final conflict look-ahead', () => {
  // the user's replay screenshot: CVN-71 on 000 at 20 kt, final bearing 351
  const cv71: WireTrack = { id: 'cv', k: 'carrier', ty: 'CVN_71', hull: 'CVN-71', sd: 'blue', alt: 60, gs: 20, crs: 0, hdg: 0, ...CV };
  const FB = 351;
  /** `along` NM astern on the final bearing, `lat` NM right of it; inbound on the FB unless `out` (the bolter downwind) */
  const fin = (id: string, along: number, lat: number, alt: number, gs: number, o: { out?: boolean; vs?: number } = {}): WireTrack => {
    const a = destination(CV.lat, CV.lon, FB + 180, along);
    const p = destination(a.lat, a.lon, FB + 90, lat);
    const crs = o.out ? FB - 180 : FB;
    return { id, k: 'fixedwing', ty: 'FA-18C_hornet', sd: 'blue', lat: p.lat, lon: p.lon, alt, gs, crs, hdg: crs, vs: o.vs ?? 0, g: id, air: true };
  };
  const pairs = (cs: { a: { id: string }; b: { id: string } }[]) => cs.map((c) => [c.a.id, c.b.id].sort().join('-')).sort();

  it('is 30 s whatever the radar option: an overtake 87 s out is on the radar, not on Final', () => {
    expect(FINAL_CONFLICT_LOOKAHEAD_S).toBe(30);
    // screenshot 2: 203 at 13.8 NM / 275 kt runs down HAWK 1-2 at 11 NM / 192 kt; 211 on the bolter downwind 2 NM left
    const tracks = [cv71, fin('211', 4.4, -2, 1200, 125, { out: true }), fin('623', 3.5, 0, 1100, 129), fin('hawk', 11, 0, 700, 192), fin('203', 13.8, 0.15, 2100, 275, { vs: -1980 })];
    for (const look of [120, 240]) {
      const pic = buildPicture(tracks, 'CVN-71', new Map(), 0, { conflictLookAheadS: look });
      expect(pairs(pic.conflicts)).toEqual(['203-hawk']);
      expect(pic.finalConflicts).toEqual([]);
    }
    const cpa = buildPicture(tracks, 'CVN-71', new Map(), 0).conflicts[0].cpa;
    expect(cpa.tS).toBeGreaterThan(80);
    expect(cpa.tS).toBeLessThan(95);
    expect(cpa.latNm).toBeLessThan(cpa.latStd);
  });

  it('flags on Final once the loss is within 30 s', () => {
    // the same overtake later: 203 2.6 NM behind HAWK 1-2, both on final, in-trail standard 2 NM
    const pic = buildPicture([cv71, fin('hawk', 8, 0, 700, 192), fin('203', 10.6, 0.15, 1200, 275)], 'CVN-71', new Map(), 0);
    expect(pairs(pic.finalConflicts!)).toEqual(['203-hawk']);
    expect(pairs(pic.conflicts)).toEqual(['203-hawk']);
  });

  it('a bolter downwind passing an arrival head-on ~1 NM abeam is a 120 s alert, not a Final one', () => {
    // screenshot 1: 211 ~1 NM astern / 1 NM left outbound at 124 kt; HAWK 1-2 inbound at 12.5 NM, 190 kt, descending.
    // HAWK is outside the 10 NM pattern area now, so the pair takes 2 NM / 800 ft, and the 120 s window ends
    // with them ~1.4 NM apart: red on the radar's look-ahead, not within 30 s.
    const tracks = [cv71, fin('211', 1, -1, 1200, 124, { out: true }), fin('hawk', 12.5, 0, 2100, 190, { vs: -1000 })];
    const pic = buildPicture(tracks, 'CVN-71', new Map(), 0);
    expect(pairs(pic.conflicts)).toEqual(['211-hawk']);
    expect(pic.finalConflicts).toEqual([]);
  });
});

describe('tags and phases', () => {
  it('formats rows', () => {
    const [carrierless] = buildPicture([carrier, jet('a', 90, 20, { bd: '106', lb: 7400, vs: -2000, alt: 16800 })], 'CVN-72', new Map(), 0).air;
    expect(tagRows(carrierless)).toEqual(['106 F18C 7.4', '↓168 420']);
    expect(shortType('Some_New-Type')).toBe('SOME');
    expect(typeName('FA-18C_hornet')).toBe('F/A-18C');
    expect(typeName('Some_New-Type')).toBe('Some');
    expect(typeName('MiG-29A')).toBe('MiG-29A');
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

describe('altitude filter block', () => {
  const f = { lo: 10000, hi: 15000 };
  it('keeps aircraft in the block and those climbing or descending into it within 2 minutes', () => {
    expect(inAltBlock({ alt: 12000 }, f)).toBe(true);
    expect(inAltBlock({ alt: 8000, vs: 1500 }, f)).toBe(true);
    expect(inAltBlock({ alt: 8000, vs: 500 }, f)).toBe(false);
    expect(inAltBlock({ alt: 18000, vs: -2000 }, f)).toBe(true);
    expect(inAltBlock({ alt: 18000, vs: 2000 }, f)).toBe(false);
    expect(inAltBlock({ alt: 9000 }, f)).toBe(false);
  });
});

const tk = (id: string, x: number, y: number, extra: Partial<ScopeTrack> = {}): ScopeTrack => ({ id, p: [x, y], ...extra }) as ScopeTrack;

describe('proximityClusters', () => {
  it('groups tracks within the join distance and separates distant ones', () => {
    const cs = proximityClusters([tk('a', 0, 0), tk('b', 2, 0), tk('c', 20, 0)], 3);
    expect(cs.length).toBe(2);
    expect(cs.find((c) => c.some((m) => m.id === 'c'))!.length).toBe(1);
  });
  it('single-linkage: a chain of hops within range is one cluster even when the ends are far apart', () => {
    expect(proximityClusters([tk('a', 0, 0), tk('b', 2.5, 0), tk('c', 5, 0)], 3).length).toBe(1);
  });
});

describe('specificEnergyFt', () => {
  it('adds the speed height-equivalent to altitude, so faster at the same height means more energy', () => {
    expect(specificEnergyFt({ alt: 10000, gs: 0 })).toBeCloseTo(10000, 0);
    expect(specificEnergyFt({ alt: 10000, gs: 400 })).toBeGreaterThan(specificEnergyFt({ alt: 10000, gs: 200 }));
  });
});
