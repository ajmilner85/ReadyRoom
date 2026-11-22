import { describe, expect, it } from 'vitest';
import { destination } from '../../../catcc/core/geo.ts';
import type { WireTrack } from '../../../catcc/core/room/protocol.ts';
import { buildPicture } from '../scopeModel.ts';
import { azElPicture, azElProfileMarks, flyingBall, azElSelect, azElX, azElY, AZEL_AZ_DEG, AZEL_EL_DEG, AZEL_HALF, bolterSlot, finalPicture, glideDeviation, landingWeightLb, profileAlt, sepStd, sepViolated, GP_FT_PER_NM, type FinalAc, type FinalPicture } from './finalModel.ts';

// BRC 345 → FB 336: final is flown on 336 from the south-south-east (astern is 156)
const CV = { lat: 26.2, lon: 56.8 };
const carrier: WireTrack = { id: 'cv', k: 'carrier', ty: 'CVN_72', hull: 'CVN-72', sd: 'blue', alt: 60, gs: 20, crs: 345, hdg: 345, ...CV };
const jet = (id: string, pos: { lat: number; lon: number }, extra: Partial<WireTrack>): WireTrack => ({ id, k: 'fixedwing', ty: 'FA-18C_hornet', sd: 'blue', alt: 1000, gs: 145, crs: 336, ...pos, ...extra });

describe('approach / final picture', () => {
  const onFinal = destination(CV.lat, CV.lon, 156, 5);
  const astern3 = destination(CV.lat, CV.lon, 156, 3);
  // 2 NM to the left of the inbound course (left of 336 is 246)
  const downwind = destination(astern3.lat, astern3.lon, 246, 2);
  const inbound = destination(CV.lat, CV.lon, 156, 18);
  const pic = buildPicture(
    [
      carrier,
      jet('205', onFinal, { bd: '205', g: 'Bullet 1' }),
      jet('211', downwind, { bd: '211', g: 'Charger 3', crs: 156, gs: 150, alt: 1200, lb: 4100 }),
      jet('203', inbound, { bd: '203', g: 'Bullet 2', gs: 250, alt: 3600 }),
    ],
    'CVN-72',
    new Map(),
    0,
  );
  const fp = finalPicture(pic)!;

  it('places aircraft in the final frame and classes them', () => {
    const a205 = fp.acs.find((a) => a.t.id === '205')!;
    expect(a205.kind).toBe('final');
    expect(a205.f.along).toBeCloseTo(5, 1);
    expect(Math.abs(a205.f.lat)).toBeLessThan(0.05);
    const b = fp.acs.find((a) => a.t.id === '211')!;
    expect(b.kind).toBe('bolter');
    expect(b.f.lat).toBeCloseTo(-2, 1);
    expect(fp.acs.find((a) => a.t.id === '203')!.kind).toBe('inbound');
    // arrivals in ¾ NM order, the bolter not among them
    expect(fp.arrivals.map((a) => a.t.id)).toEqual(['205', '203']);
  });

  it('gives the bolter a slot between the arrivals', () => {
    const s = bolterSlot(fp, fp.bolters[0]);
    expect(s.window).not.toBeNull();
    const t205 = fp.arrivals[0].tBall!;
    const t203 = fp.arrivals[1].tBall!;
    expect(s.tBall(s.window![0])).toBeGreaterThanOrEqual(t205 + 59.9);
    expect(s.tBall(s.window![1])).toBeLessThanOrEqual(t203 - 59.9);
  });

  it('applies the CV NATOPS separation standards', () => {
    const a205 = fp.acs.find((a) => a.t.id === '205')!;
    // established on final within 5 NM: 1-1/2 NM, 800 ft inside 10 NM; just outside 5 NM: 2 NM
    expect(sepStd({ ...a205, f: { ...a205.f, along: 4.5 } })).toEqual({ nm: 1.5, ft: 800 });
    expect(sepStd({ ...a205, f: { ...a205.f, along: 5.5 } }).nm).toBe(2);
    // the downwind inside 12 NM: 2 NM
    expect(sepStd(fp.acs.find((a) => a.t.id === '211')!).nm).toBe(2);
    // 18 NM inbound: 3 NM, 1,000 ft
    expect(sepStd(fp.acs.find((a) => a.t.id === '203')!)).toEqual({ nm: 3, ft: 1000 });
    // the bubble is violated when the aircraft is in one of the picture's (predicted) conflicts
    expect(sepViolated(a205, pic.conflicts)).toBe(false);
    expect(sepViolated(a205, [{ a: { id: 'x' }, b: { id: '205' } }])).toBe(true);
  });

  it('a normal Case III sequence in trail is no conflict (the reported screenshot)', () => {
    // BRC 070 → FB 061; 712 at 1.2 NM / 300 ft / 128 kt, 205 behind at 3.5 NM / 1,000 ft / 150 kt
    const cv = { ...carrier, crs: 70, hdg: 70, gs: 22 };
    const p = (r: number) => destination(CV.lat, CV.lon, 241, r);
    const trail = (gs205: number, r205: number) =>
      buildPicture(
        [cv, jet('712', p(1.2), { bd: '712', g: 'A 1', crs: 61, gs: 128, alt: 300, vs: -700 }), jet('205', p(r205), { bd: '205', g: 'B 1', crs: 61, gs: gs205, alt: 1000, vs: -800 })],
        'CVN-72',
        new Map(),
        0,
      );
    expect(trail(150, 3.5).conflicts).toEqual([]);
    // a trailer overtaking hard enough to close inside 1-1/2 NM before the leader traps is one
    expect(trail(260, 2.9).conflicts).toHaveLength(1);
  });

  it('follows the Case III profile and estimates the trap weight', () => {
    expect(profileAlt(21)).toBe(6000);
    expect(profileAlt(20)).toBe(5000);
    expect(profileAlt(8)).toBe(1200);
    expect(profileAlt(2)).toBeLessThan(1200);
    expect(landingWeightLb('FA-18C_hornet', 4100)).toBe(31000);
    expect(landingWeightLb('KC135MPRS', 1000)).toBeNull();
  });
});

describe('AZ/EL scope', () => {
  it('marks where the 1,200 ft level segment shows at each NM past the glideslope intercept', () => {
    const m = azElProfileMarks();
    expect(m.map((x) => x.nm)).toEqual([4, 5, 6]);
    // level 1,200 ft: atan(1200 / (r * 6076)) - 3.5
    expect(m[0].el).toBeCloseTo(-0.67, 1);
    expect(m[1].el).toBeCloseTo(-1.24, 1);
    expect(m[2].el).toBeCloseTo(-1.61, 1);
  });

  it('measures deviation from the glidepath origin with its sign conventions', () => {
    // on the glidepath and the centreline
    const on = glideDeviation(4, 0, 4 * GP_FT_PER_NM)!;
    expect(on.az).toBeCloseTo(0, 6);
    expect(on.el).toBeCloseTo(0, 6);
    expect(on.r).toBeCloseTo(4, 6);
    // right of course and high are positive; left and low negative
    const rh = glideDeviation(4, 0.1, 4 * GP_FT_PER_NM + 200)!;
    expect(rh.az).toBeCloseTo((Math.atan2(0.1, 4) * 180) / Math.PI, 6);
    expect(rh.el).toBeGreaterThan(0);
    const ll = glideDeviation(4, -0.1, 4 * GP_FT_PER_NM - 200)!;
    expect(ll.az).toBeLessThan(0);
    expect(ll.el).toBeLessThan(0);
    // 1° high: the elevation angle is 4.5°
    expect(glideDeviation(3, 0, Math.tan((4.5 * Math.PI) / 180) * 3 * 6076.12)!.el).toBeCloseTo(1, 6);
    // at or past the origin there are no angles
    expect(glideDeviation(0, 0, 100)).toBeNull();
    expect(glideDeviation(-1, 0, 100)).toBeNull();
  });

  it('draws the scope as seen from the ship: right of course on the left, high up', () => {
    expect(azElX(0)).toBe(200);
    expect(azElY(0)).toBe(200);
    // high and right of course (the pilot's view) is high and left on the scope
    const rh = glideDeviation(4, 0.1, 4 * GP_FT_PER_NM + 200)!;
    expect(azElX(rh.az)).toBeLessThan(200);
    expect(azElY(rh.el)).toBeLessThan(200);
    // the field's ends are the plot's edges: full right deflection at the left edge
    expect(azElX(AZEL_AZ_DEG)).toBe(200 - AZEL_HALF);
    expect(azElX(-AZEL_AZ_DEG)).toBe(200 + AZEL_HALF);
    expect(azElY(AZEL_EL_DEG)).toBe(200 - AZEL_HALF);
  });

  const ac = (id: string, along: number, lat: number, alt: number): FinalAc => ({ t: { id, alt } as FinalAc['t'], f: { along, lat, alongKt: -130, closureKt: 130 }, kind: 'final', tBall: 0 });
  const fpOf = (acs: FinalAc[]) => ({ acs }) as FinalPicture;

  it('an arrival inside 3/4 NM, short of the ramp, should be flying the ball', () => {
    expect(flyingBall(ac('a', 0.7, 0, 250))).toBe(true);
    expect(flyingBall(ac('b', 0.8, 0, 280))).toBe(false);
    expect(flyingBall(ac('c', -0.1, 0, 50))).toBe(false);
    expect(flyingBall({ ...ac('d', 0.5, 0, 300), kind: 'bolter' })).toBe(false);
  });

  it('keeps aircraft inside 6 NM and the field of regard, nearest first', () => {
    const gp = (r: number) => r * GP_FT_PER_NM;
    const list = azElPicture(
      fpOf([
        ac('far', 5, 0, gp(5)),
        ac('near', 2, 0.05, gp(2) + 50),
        ac('beyond6', 6.5, 0, gp(6.5)),
        ac('wide', 3, 1, gp(3)), // 18° off course
        ac('high', 3, 0, Math.tan((7 * Math.PI) / 180) * 3 * 6076.12), // 3.5° high
        ac('low', 3, 0, 0), // 3.5° low
        ac('past', -0.5, 0, 300),
        ac('mid', 3.5, -0.15, gp(3.5)), // 2.5° off course: inside ±3°
        ac('az4', 3, 0.21, gp(3)), // 4° off course: outside ±3°
      ]),
    );
    expect(list.map((c) => c.a.t.id)).toEqual(['near', 'mid', 'far']);
    expect(azElPicture(null)).toEqual([]);
  });

  it('finds the arrival on final in the live picture', () => {
    const fp = finalPicture(
      buildPicture([carrier, jet('205', destination(CV.lat, CV.lon, 156, 4), { bd: '205', alt: Math.round(4 * GP_FT_PER_NM) }), jet('207', destination(CV.lat, CV.lon, 156, 5.5), { bd: '207', alt: Math.round(5.5 * GP_FT_PER_NM) })], 'CVN-72', new Map(), 0),
    );
    const list = azElPicture(fp);
    expect(list.map((c) => c.a.t.id)).toEqual(['205', '207']);
    expect(Math.abs(list[0].dev.az)).toBeLessThan(0.2);
    expect(Math.abs(list[0].dev.el)).toBeLessThan(0.1);
  });

  describe('track table and primary', () => {
    const gp = (r: number) => r * GP_FT_PER_NM;
    const fp = fpOf([ac('a', 2, 0, gp(2)), ac('b', 4, 0.1, gp(4)), ac('c', 5, 0, gp(5)), ac('d', 7.5, 0, gp(7.5))]);
    const ids = (s: ReturnType<typeof azElSelect>) => ({ prim: s.prim?.a.t.id ?? null, ghosts: s.ghosts.map((g) => g.a.t.id), rows: s.tracked.map((k) => k.a.t.id), primaryId: s.primaryId, notNearest: s.notNearest });

    it('with nothing held: no rows, the nearest in the field is the contact', () => {
      for (const locks of [undefined, null, []]) expect(ids(azElSelect(fp, locks, 'b'))).toEqual({ prim: 'a', ghosts: ['b', 'c'], rows: [], primaryId: null, notNearest: false });
      expect(ids(azElSelect(null, ['a'], null))).toEqual({ prim: null, ghosts: [], rows: [], primaryId: null, notNearest: false });
    });

    it('lists the held aircraft nearest first; the nearest is primary unless another is picked', () => {
      expect(ids(azElSelect(fp, ['c', 'b'], null))).toEqual({ prim: 'b', ghosts: ['a', 'c'], rows: ['b', 'c'], primaryId: 'b', notNearest: false });
      expect(ids(azElSelect(fp, ['c', 'b'], 'c'))).toEqual({ prim: 'c', ghosts: ['a', 'b'], rows: ['b', 'c'], primaryId: 'c', notNearest: true });
      const s = azElSelect(fp, ['c', 'b'], 'c');
      expect(s.tracked[0].r).toBeCloseTo(Math.hypot(4, 0.1), 9);
      expect(s.tracked[1].dev).not.toBeNull();
    });

    it('falls back to the nearest held when the pick is not held', () => {
      expect(ids(azElSelect(fp, ['a', 'b'], 'c'))).toMatchObject({ prim: 'a', primaryId: 'a', notNearest: false });
      expect(ids(azElSelect(fp, ['a', 'b'], 'gone'))).toMatchObject({ prim: 'a', primaryId: 'a' });
    });

    it('lists a held aircraft outside the field without drawing it, at most two rows', () => {
      const s = azElSelect(fp, ['d', 'c'], 'd');
      expect(ids(s)).toEqual({ prim: null, ghosts: ['a', 'b', 'c'], rows: ['c', 'd'], primaryId: 'd', notNearest: true });
      expect(s.tracked[1].dev).toBeNull();
      expect(s.tracked[1].r).toBeCloseTo(7.5, 9);
      expect(azElSelect(fp, ['a', 'b', 'c'], null).tracked.map((k) => k.a.t.id)).toEqual(['a', 'b']);
    });
  });
});
