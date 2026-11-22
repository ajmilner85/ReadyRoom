import { describe, expect, it } from 'vitest';
import { destination } from '../../../catcc/core/geo.ts';
import type { WireTrack } from '../../../catcc/core/room/protocol.ts';
import { buildPicture } from '../scopeModel.ts';
import { azElPicture, bolterSlot, finalPicture, glideDeviation, landingWeightLb, profileAlt, sepStd, sepViolated, GP_FT_PER_NM, type FinalAc, type FinalPicture } from './finalModel.ts';

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
    expect(sepViolated(a205, fp.acs)).toBe(false);
    // a second aircraft 1 NM behind 205 at the same height is inside its bubble
    const close = { ...a205, t: { ...a205.t, id: 'x' }, f: { ...a205.f, along: a205.f.along + 1 } };
    expect(sepViolated(a205, [...fp.acs, close])).toBe(true);
    // ...but not 1,000 ft above it
    expect(sepViolated(a205, [...fp.acs, { ...close, t: { ...close.t, alt: a205.t.alt + 1000 } }])).toBe(false);
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

  const ac = (id: string, along: number, lat: number, alt: number): FinalAc => ({ t: { id, alt } as FinalAc['t'], f: { along, lat, alongKt: -130, closureKt: 130 }, kind: 'final', tBall: 0 });
  const fpOf = (acs: FinalAc[]) => ({ acs }) as FinalPicture;

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
        ac('mid', 3.5, -0.2, gp(3.5)),
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
});
