import { describe, expect, it } from 'vitest';
import { distNm, offsetLl, orderChanged, stationOrder, STATION_LEAD_MIN, STATION_MAX_KT } from './stationKeeping.ts';

const cv = { lat: 26, lon: 56, crs: 0, kt: 20 };

describe('station orders', () => {
  it('an escort on station is sent to where the station will be, at the carrier speed', () => {
    // station 090R at 5 NM; the escort is there now
    const escort = offsetLl(cv, 90, 5);
    const [a, b] = stationOrder({ kind: 'point', role: 'AAW', b: 90, r: 5 }, 0, cv, escort)!;
    // 10 min ahead at 20 kt: 3.33 NM north of the station
    expect(distNm(escort, a)).toBeCloseTo((20 * STATION_LEAD_MIN) / 60, 1);
    expect(a.kt).toBeCloseTo(20, 0);
    expect(b.kt).toBe(20);
    expect(distNm(a, b)).toBeCloseTo(60, 0);
  });

  it('an escort behind its station speeds up (to the limit), one ahead slows', () => {
    const st = { kind: 'sector' as const, role: 'AAW' as const, b0: 330, b1: 30, r0: 4, r1: 8 };
    const behind = stationOrder(st, 0, cv, offsetLl(cv, 180, 4))!;
    expect(behind[0].kt).toBe(STATION_MAX_KT);
    const ahead = stationOrder(st, 0, cv, offsetLl(cv, 0, 8))!;
    expect(ahead[0].kt).toBeLessThan(10);
  });

  it('stations follow the formation axis, and free stations get no order', () => {
    const escort = offsetLl(cv, 0, 0);
    const [a] = stationOrder({ kind: 'point', role: 'PG', b: 0, r: 5 }, 90, cv, escort)!;
    // axis 090: the 000R station is east of the carrier's position ahead
    expect(a.lon).toBeGreaterThan(cv.lon);
    expect(stationOrder({ kind: 'free', role: 'AAW' }, 0, cv, escort)).toBeNull();
  });

  it('skips resending orders that barely changed', () => {
    const p = [{ lat: 26, lon: 56, kt: 20 }];
    expect(orderChanged(undefined, p, 0)).toBe(true);
    expect(orderChanged(p, [{ lat: 26.001, lon: 56, kt: 20.5 }], 30)).toBe(false);
    expect(orderChanged(p, [{ lat: 26.01, lon: 56, kt: 20 }], 30)).toBe(true);
    expect(orderChanged(p, p, 200)).toBe(true);
  });
});
