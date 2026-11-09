import { describe, expect, it } from 'vitest';
import { antennaFtOf, coverageNm, horizonNm, radarOf } from './radar.ts';

describe('radar donors', () => {
  it('knows the replay ships and AEW, and skips ships without an air-search radar', () => {
    expect(radarOf('E-2C')?.kind).toBe('aew');
    expect(radarOf('E-3A')?.radar).toBe('AN/APY-2');
    expect(radarOf('USS_Arleigh_Burke_IIa')?.radar).toBe('AN/SPY-1D');
    expect(radarOf('TICONDEROG')?.rangeNm).toBe(175);
    expect(radarOf('CVN_71')?.antennaFt).toBe(140);
    expect(radarOf('Type_054A')).toBeDefined();
    expect(radarOf('atconveyor')).toBeUndefined();
    expect(radarOf('FA-18C_hornet')).toBeUndefined();
  });

  it('horizon: 1.23 (√h1 + √h2) NM', () => {
    expect(horizonNm(100, 0)).toBeCloseTo(12.3, 6);
    expect(horizonNm(100, 100)).toBeCloseTo(24.6, 6);
  });

  it('a destroyer sees a 100 ft sea-skimmer only to its horizon; an E-2 much farther', () => {
    const ddg = radarOf('USS_Arleigh_Burke_IIa')!;
    expect(coverageNm(ddg, antennaFtOf(ddg, 0), 100)).toBeCloseTo(1.23 * (Math.sqrt(70) + 10), 6); // ≈ 22.6
    // against a high target the detection range governs
    expect(coverageNm(ddg, antennaFtOf(ddg, 0), 30000)).toBe(175);
    const e2 = radarOf('E-2C')!;
    // at 10,000 ft its horizon to a 100 ft target (≈ 135 NM) limits it; at 25,000 ft its range does
    expect(coverageNm(e2, antennaFtOf(e2, 10000), 100)).toBeCloseTo(1.23 * (100 + 10), 6);
    expect(coverageNm(e2, antennaFtOf(e2, 25000), 100)).toBe(200);
    // on deck the E-2 is no better than a mast
    expect(coverageNm(e2, antennaFtOf(e2, 60), 500)).toBeLessThan(40);
  });
});
