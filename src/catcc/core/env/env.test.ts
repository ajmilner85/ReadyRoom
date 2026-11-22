import { describe, expect, it } from 'vitest';
import { destination, distanceNm } from '../geo.ts';
import { lightDay, moon, opsClock, sunAltitude } from './astro.ts';
import { ceilingFt, cloudsText, coverageOf, nextPimTurn, pimAt, recoveryCase, visibilityNm } from './weather.ts';

describe('astro', () => {
  it('sun is high at local noon and below the horizon at midnight (Persian Gulf, 21 Jun)', () => {
    // 26°N 56°E: local solar noon ≈ 08:16 UTC
    expect(sunAltitude(new Date('2026-06-21T08:16:00Z'), 26, 56)).toBeGreaterThan(85);
    expect(sunAltitude(new Date('2026-06-21T20:16:00Z'), 26, 56)).toBeLessThan(-35);
  });

  it('finds sunset and sunrise about 13 h 40 min of daylight apart at midsummer', () => {
    const d = lightDay(new Date('2026-06-21T08:16:00Z'), 26, 56);
    expect(d.sunset).toBeDefined();
    expect(d.sunrise).toBeDefined();
    const dayH = 24 - (d.sunrise!.getTime() - d.sunset!.getTime()) / 3.6e6;
    expect(dayH).toBeGreaterThan(13.3);
    expect(dayH).toBeLessThan(14);
  });

  it('moon illumination is near full at a known full moon and near new at a known new moon', () => {
    expect(moon(new Date('2026-05-31T08:45:00Z'), 26, 56).illum).toBeGreaterThan(0.97); // full moon 31 May 2026
    expect(moon(new Date('2026-05-16T20:01:00Z'), 26, 56).illum).toBeLessThan(0.03); // new moon 16 May 2026
  });
});

describe('weather', () => {
  const wx = { cb: 244, ct: 400, cd: 7, cp: 'Preset14', pr: 1, vis: 7400, fog: null, dust: null };
  it('maps presets to coverage, ceiling and METAR-ish text', () => {
    expect(coverageOf(wx)).toBe('BKN');
    expect(ceilingFt(wx)).toBe(800);
    expect(cloudsText(wx)).toBe('BKN 008');
    expect(coverageOf({ ...wx, cp: 'Preset3' })).toBe('SCT');
    expect(ceilingFt({ ...wx, cp: 'Preset3' })).toBeNull();
    expect(visibilityNm(wx)).toBeCloseTo(4, 0);
  });

  it('picks the recovery case', () => {
    expect(recoveryCase(true, null, 10)).toBe('III');
    expect(recoveryCase(false, null, 10)).toBe('I');
    expect(recoveryCase(false, 2000, 8)).toBe('II');
    expect(recoveryCase(false, 800, 4)).toBe('III');
  });

  it('finds the next PIM turn', () => {
    const a = { lat: 26, lon: 56 };
    const b = destination(26, 56, 345, 12);
    const c = destination(b.lat, b.lon, 20, 24);
    const pts = [
      { ...a, spd: 12, eta: 0 },
      { ...b, spd: 12, eta: 1800 },
      { ...c, spd: 12, eta: 5400 },
    ];
    expect(nextPimTurn(pts, 600)).toEqual({ brc: 20, etaS: 1800 });
    expect(nextPimTurn(pts, 2000)).toBeNull();
  });

  it('interpolates the PIM along the leg whose ETAs bracket now', () => {
    const b = destination(26, 56, 90, 12);
    const c = destination(b.lat, b.lon, 0, 12);
    const pts = [
      { lat: 26, lon: 56, spd: 12, eta: 100 },
      { ...b, spd: 12, eta: 3700 },
      { ...c, spd: 12, eta: 7300 },
    ];
    expect(pimAt(pts, 0)).toMatchObject({ lat: 26, lon: 56, leg: 0 });
    const mid = pimAt(pts, 1900)!;
    expect(mid.leg).toBe(1);
    expect(distanceNm(26, 56, mid.lat, mid.lon)).toBeCloseTo(6, 1);
    expect(mid.crs).toBeCloseTo(90, 0);
    const second = pimAt(pts, 4600)!;
    expect(second.leg).toBe(2);
    expect(distanceNm(b.lat, b.lon, second.lat, second.lon)).toBeCloseTo(3, 1);
    expect(pimAt(pts, 9000)).toMatchObject({ lat: c.lat, lon: c.lon, leg: 3, crs: null });
  });
});

describe('opsClock (day / night ops countdown)', () => {
  // 26°N 56°E, 21 Jun 2026: the sunset and sunrise around it, from lightDay
  const d = lightDay(new Date('2026-06-21T08:16:00Z'), 26, 56, 1);
  const ss = d.sunset!.getTime();
  const sr = d.sunrise!.getTime(); // the morning of 22 Jun
  const at = (ms: number) => new Date(ms);
  const near = (a: Date | undefined, b: number) => expect(Math.abs(a!.getTime() - b)).toBeLessThan(2 * 60_000);
  it("in the morning (after sunrise, before the chart's noon) counts to tonight, not last night", () => {
    const c = opsClock(new Date('2026-06-21T04:00:00Z'), 26, 56);
    expect(c.night).toBe(false);
    near(c.until, ss + 30 * 60_000);
  });
  it('in the afternoon counts to 30 min after sunset', () => {
    const c = opsClock(new Date('2026-06-21T12:00:00Z'), 26, 56);
    expect(c.night).toBe(false);
    near(c.until, ss + 30 * 60_000);
  });
  it('between sunset and night ops it is still day', () => {
    const c = opsClock(at(ss + 10 * 60_000), 26, 56);
    expect(c.night).toBe(false);
    near(c.until, ss + 30 * 60_000);
  });
  it('at night counts to 30 min before sunrise', () => {
    const c = opsClock(at(ss + 3 * 3.6e6), 26, 56);
    expect(c.night).toBe(true);
    near(c.until, sr - 30 * 60_000);
  });
  it('in the half hour before sunrise it is day again, counting to the next night', () => {
    const c = opsClock(at(sr - 10 * 60_000), 26, 56);
    expect(c.night).toBe(false);
    expect(c.until!.getTime()).toBeGreaterThan(sr + 10 * 3.6e6);
  });
});
