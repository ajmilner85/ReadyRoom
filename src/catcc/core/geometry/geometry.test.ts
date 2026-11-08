import { describe, expect, it } from 'vitest';
import { cpa, eat, fly, marshalRoute, predictConflict, turnRadiusNm } from './maneuver.ts';
import {
  arrivalPath,
  checkDepartureRadial,
  checkStackRadial,
  departurePath,
  emergencyMarshalRadial,
  fixDme,
  heloMarshalRadial,
  holdPattern,
  holdSpecForTas,
  type ShipRef,
} from './procedures.ts';
import { aeqd } from './projection.ts';
import { angDiff, bearingOf, bearingTo, dist, len, P, pathLength, type Pt } from './vec.ts';

const SHIP: ShipRef = { brc: 345, fb: 336 };
const REC = (SHIP.fb + 180) % 360;
const finite = (path: Pt[]) => path.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
const maxStep = (path: Pt[]) => Math.max(...path.slice(1).map((q, i) => dist(path[i], q)));
const sweep = Array.from({ length: 72 }, (_, i) => i * 5);

describe('departurePath (5.13.3.4.1)', () => {
  it.each(sweep)('radial %i: finite, starts at the ship, ends 50 NM out on the radial', (r) => {
    const path = departurePath(r, SHIP);
    expect(finite(path)).toBe(true);
    expect(dist(path[0], [0, 0])).toBeLessThan(1e-9);
    const end = path.at(-1)!;
    expect(len(end)).toBeGreaterThan(48);
    // final leg heads outbound along the radial
    expect(angDiff(bearingTo(path.at(-2)!, end), r)).toBeLessThan(1);
    // ...and lies on (or within a turn radius of) the radial itself
    expect(angDiff(bearingOf(end), r)).toBeLessThan(5);
  });

  it('climbs out on the BRC first', () => {
    const path = departurePath(90, SHIP);
    expect(angDiff(bearingTo(path[0], path[1]), SHIP.brc)).toBeLessThan(0.01);
    expect(len(path[1])).toBeCloseTo(Math.sqrt(49 - 9), 6); // tangent point of the 3 NM turn onto the 10 NM arc
  });

  it('flies the 10 NM arc for radials well off the BRC', () => {
    const path = departurePath((SHIP.brc + 120) % 360, SHIP);
    const onArc = path.filter((q) => Math.abs(len(q) - 10) < 0.01);
    expect(onArc.length).toBeGreaterThan(20);
  });
});

describe('holdPattern (6.4.1.1)', () => {
  it('is a closed racetrack with the inbound leg over the fix', () => {
    const h = holdPattern(156, fixDme(6), 'left');
    expect(finite(h)).toBe(true);
    expect(dist(h[0], P(156, 21))).toBeLessThan(1e-9);
    expect(dist(h[1], P(156, 25.2))).toBeLessThan(1e-9);
    expect(dist(h.at(-1)!, h[0])).toBeLessThan(1e-6);
    expect(pathLength(h)).toBeCloseTo(2 * 4.2 + 2 * Math.PI * 2.65, 1);
  });

  it('left-hand puts the outbound leg on the left of the inbound jet; right-hand mirrors', () => {
    // On radial 180 the inbound jet flies north; its left is west (-x).
    expect(Math.min(...holdPattern(180, 21, 'left').map((q) => q[0]))).toBeLessThan(-5);
    expect(Math.max(...holdPattern(180, 21, 'right').map((q) => q[0]))).toBeGreaterThan(5);
  });

  it('sizes from TAS: 250 kt gives the mockup hold', () => {
    const s = holdSpecForTas(250);
    expect(s.legNm).toBeCloseTo(4.17, 2);
    expect(s.turnNm).toBeCloseTo(2.65, 2);
  });
});

describe('arrivalPath (6.4.7.3)', () => {
  it.each(sweep)('stack radial %i: finite, continuous, starts at the fix and ends on final', (r) => {
    if (angDiff(r, SHIP.brc) < 90) return; // bow-on radials are warned against; still must not break:
    const { path, mode } = arrivalPath(r, fixDme(6), SHIP);
    expect(finite(path)).toBe(true);
    expect(dist(path[0], P(r, 21))).toBeLessThan(1e-9);
    expect(dist(path.at(-1)!, P(REC, 1.3))).toBeLessThan(1e-9);
    if (mode !== 'direct' && mode !== 'straight') expect(maxStep(path.slice(1, -1))).toBeLessThan(25);
    // joins the FB astern of the ship (never ahead), on the FB line, flying the FB
    const join = path.at(-2)!;
    const v = P(REC, 1);
    expect(join[0] * v[0] + join[1] * v[1]).toBeGreaterThan(1.3);
    expect(Math.abs(join[0] * v[1] - join[1] * v[0])).toBeLessThan(0.01);
    expect(angDiff(bearingTo(join, path.at(-1)!), SHIP.fb)).toBeLessThan(0.5);
  });

  it('bow-on radials still produce a finite path', () => {
    for (const r of sweep) expect(finite(arrivalPath(r, 21, SHIP).path)).toBe(true);
  });

  it('flies straight in on the FB reciprocal', () => {
    expect(arrivalPath(REC, 21, SHIP).mode).toBe('straight');
  });

  it('uses a gradual intercept (no arc) within 10° of the FB reciprocal', () => {
    for (const off of [-10, -5, -2, 2, 5, 10]) expect(arrivalPath(REC + off, 21, SHIP).mode).toBe('intercept');
  });

  it('flies the 12 DME arc only from wide radials, and the arc points really are at 12 DME', () => {
    const modes = sweep.filter((r) => angDiff(r, SHIP.brc) >= 90).map((r) => ({ r, ...arrivalPath(r, 21, SHIP) }));
    const arcs = modes.filter((m) => m.mode === 'arc');
    expect(arcs.length).toBeGreaterThan(0);
    for (const m of arcs) {
      expect(angDiff(m.r, REC)).toBeGreaterThan(10);
      expect(m.path.filter((q) => Math.abs(len(q) - 12) < 1e-6).length).toBeGreaterThan(2);
    }
  });

  it('fillets do not overshoot: the first turn starts between the fix and 20 DME', () => {
    for (const r of sweep.filter((x) => angDiff(x, SHIP.brc) >= 90 && angDiff(x, REC) >= 1)) {
      const { path } = arrivalPath(r, 21, SHIP);
      expect(len(path[1])).toBeLessThan(21);
      expect(len(path[1])).toBeGreaterThan(20);
    }
  });
});

describe('radial rules', () => {
  it('blocks departure radials within 20° of others or reserved radials', () => {
    expect(checkDepartureRadial(100, SHIP, [110], []).err).toMatch(/10° from 110R/);
    expect(checkDepartureRadial(emergencyMarshalRadial(SHIP) + 5, SHIP, [], []).err).toMatch(/emergency/);
    expect(checkDepartureRadial(heloMarshalRadial(SHIP) - 19, SHIP, [], []).err).toMatch(/helo/);
    expect(checkDepartureRadial(285, SHIP, [], [{ r: 156, name: 'stack A' }])).toEqual({});
  });
  it('warns on bow-on stacks and blocks stacks near departure radials', () => {
    expect(checkStackRadial(10, SHIP, [], []).warn).toBe('Bow-on recovery');
    expect(checkStackRadial(156, SHIP, [150], []).err).toMatch(/DEP/);
    expect(checkStackRadial(156, SHIP, [], [{ r: 160, id: 'B' }]).err).toMatch(/stack B/);
    expect(checkStackRadial(156, SHIP, [285], [{ r: 200, id: 'B' }])).toEqual({});
  });
});

describe('maneuvering, EAT, CPA', () => {
  it('turn radius at 30° bank: ~4.5 NM at 420 kt', () => {
    expect(turnRadiusNm(420)).toBeCloseTo(4.47, 2);
  });

  it('fly: straight when already pointed at the target', () => {
    const r = fly([0, 0], 90, [10, 0], 4.5);
    expect(r.dist).toBeCloseTo(10, 1);
    expect(r.hdg).toBeCloseTo(90, 0);
  });

  it('fly: a reversal costs about a half-circle extra', () => {
    const R = turnRadiusNm(420);
    const r = fly([0, 0], 0, [0, 30], R); // heading north, target 30 NM south
    // after the reversal the jet is ~2R abeam of its start, so it points slightly across
    expect(angDiff(r.hdg, 180)).toBeLessThan(25);
    expect(r.dist).toBeGreaterThan(30 + Math.PI * R * 0.8);
    expect(r.dist).toBeLessThan(30 + Math.PI * R + 2 * R + 1);
  });

  it('EAT rounds up and spaces a minute behind the previous', () => {
    expect(eat(65_481)).toBe(65_520);
    expect(eat(65_481, 65_520)).toBe(65_580);
    expect(eat(65_700, 65_520)).toBe(65_700); // already a whole minute, and > prev + 60
    expect(eat(65_530, 65_520)).toBe(65_580);
  });

  it('CPA for a head-on pair', () => {
    const c = cpa({ p: [0, -20], crs: 180, gs: 300, altFt: 10000 }, { p: [1, 20], crs: 0, gs: 300, altFt: 10500 });
    expect(c.tS).toBeCloseTo(240, 0);
    expect(c.latNm).toBeCloseTo(1, 3);
    expect(c.vertFt).toBeCloseTo(500, 3);
  });

  it('conflict needs BOTH lateral and vertical loss', () => {
    const A = { p: [0, -20] as Pt, crs: 180, gs: 300, altFt: 10000 };
    expect(predictConflict(A, { p: [1, 20], crs: 0, gs: 300, altFt: 10500 }, { lookAheadS: 300 })).not.toBeNull();
    expect(predictConflict(A, { p: [1, 20], crs: 0, gs: 300, altFt: 11500 }, { lookAheadS: 300 })).toBeNull();
    expect(predictConflict(A, { p: [1, 20], crs: 0, gs: 300, altFt: 10500 }, { lookAheadS: 120 })).toBeNull(); // CPA beyond window
  });
});

describe('projection', () => {
  it('round-trips and keeps range/bearing from the ship exact', () => {
    const pr = aeqd(26.2, 56.8);
    const p = pr.toScope(26.5, 56.5);
    const back = pr.toLatLon(p);
    expect(back.lat).toBeCloseTo(26.5, 9);
    expect(back.lon).toBeCloseTo(56.5, 9);
    const q = pr.toScope(...(Object.values(pr.toLatLon(P(156, 21))) as [number, number]));
    expect(dist(q, P(156, 21))).toBeLessThan(1e-6);
  });
});

describe('marshalRoute (hold entry, established inbound)', () => {
  // Stack on the 180 radial, fix 21 DME at (0, 21); inbound course 000. Left-hand: hold side is west.
  const cases: [string, Pt, number, string][] = [
    ['straight-in from behind', [1, 45], 350, 'straight-in'],
    ['direct from the hold side', [-15, 21], 90, 'direct'],
    ['parallel from the non-hold side', [15, 21], 270, 'parallel'],
    ['teardrop from ahead', [-3, 8], 180, 'teardrop'],
  ];
  it.each(cases)('%s', (_n, p0, h0, entry) => {
    const r = marshalRoute(p0, h0, 250, 180, 21, 'left');
    expect(r.entry).toBe(entry);
    const end = r.path.at(-1)!;
    expect(dist(end, [0, 21])).toBeLessThan(1e-6);
    // established on the inbound course over the last half mile
    const back = r.path[r.path.length - 12];
    expect(angDiff(bearingTo(back, end), 0)).toBeLessThan(3);
    expect(Math.abs(back[0])).toBeLessThan(0.05);
    // continuous: no jumps along the flown path
    expect(maxStep(r.path)).toBeLessThan(0.08);
    expect(r.dist).toBeGreaterThan(dist(p0, [0, 21]));
  });

  it('mirrors for right-hand patterns', () => {
    expect(marshalRoute([15, 21], 270, 250, 180, 21, 'right').entry).toBe('direct');
    expect(marshalRoute([-15, 21], 90, 250, 180, 21, 'right').entry).toBe('parallel');
  });

  it('a hold entry costs roughly one pattern more than flying straight in', () => {
    const straightIn = marshalRoute([0, 45], 0, 250, 180, 21, 'left');
    const direct = marshalRoute([-24, 21], 90, 250, 180, 21, 'left');
    expect(straightIn.dist).toBeCloseTo(24, 0);
    // 24 NM to the fix + ~ (2 legs + 2 half-turns) of a 250 kt hold ≈ 8.4 + 16.6
    expect(direct.dist).toBeGreaterThan(24 + 15);
    expect(direct.dist).toBeLessThan(24 + 32);
  });
});
