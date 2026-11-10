import { describe, expect, it } from 'vitest';
import { destination } from '../../../catcc/core/geo.ts';
import type { WireTrack } from '../../../catcc/core/room/protocol.ts';
import { buildPicture } from '../scopeModel.ts';
import { bolterSlot, finalPicture, landingWeightLb, profileAlt, sepStd, sepViolated } from './finalModel.ts';

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
