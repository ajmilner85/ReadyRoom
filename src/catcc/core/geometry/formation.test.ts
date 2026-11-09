import { describe, expect, it } from 'vitest';
import { defaultFormation, distToStation, formationFor, inSector, PLANE_GUARD, sectorWidth, stationState, stationText } from './formation.ts';

describe('CSG formation geometry', () => {
  const s = { kind: 'sector' as const, role: 'AAW' as const, b0: 330, b1: 30, r0: 4, r1: 8 };

  it('sectors wrap through 000 and are bounded in range', () => {
    expect(sectorWidth(s)).toBe(60);
    expect(inSector(s, 0, 6)).toBe(true);
    expect(inSector(s, 345, 4)).toBe(true);
    expect(inSector(s, 31, 6)).toBe(false);
    expect(inSector(s, 0, 9)).toBe(false);
    expect(inSector(s, 0, 3.9)).toBe(false);
  });

  it('measures how far a unit is off its station', () => {
    expect(distToStation(s, 10, 6)).toBe(0);
    // 2 NM beyond the outer arc, on the centre bearing
    expect(distToStation(s, 0, 10)).toBeCloseTo(2, 6);
    // abeam the sector's edge: distance to the 030 edge
    expect(distToStation(s, 90, 6)).toBeGreaterThan(0);
    // point stations allow half a mile
    expect(distToStation(PLANE_GUARD, 170, 2.3)).toBe(0);
    expect(distToStation(PLANE_GUARD, 170, 3)).toBeCloseTo(0.5, 6);
  });

  it('station keeping uses bearings relative to the formation axis (the BRC)', () => {
    // BRC 345: a unit bearing 345 true is dead ahead (000R), inside 330–030R
    expect(stationState(s, 345, 345, 6)).toEqual({ k: 'on' });
    expect(stationState(s, 345, 165, 6).k).toBe('off');
    expect(stationState({ kind: 'free', role: 'AAW' }, 345, 0, 0)).toEqual({ k: 'free' });
  });

  it('defaults give each escort one station per preset, extra escorts free', () => {
    const f = defaultFormation(['cg', 'ddg1', 'ddg2', 'ddg3']);
    expect(f.active).toBe('Flight ops');
    expect(f.presets['Flight ops'].ddg2).toEqual(PLANE_GUARD);
    expect(f.presets.Transit.ddg3.kind).toBe('free');
    // a stored formation keeps its stations and gains defaults for new escorts
    const g = formationFor({ active: 'Combat', presets: { Combat: { cg: { kind: 'point', role: 'PKT', b: 0, r: 20 } } } }, ['cg', 'ddg1']);
    expect(g.active).toBe('Combat');
    expect(g.presets.Combat.cg.kind).toBe('point');
    expect(g.presets.Combat.ddg1.kind).toBe('sector');
  });

  it('reads stations the way the bridge says them', () => {
    expect(stationText(s)).toBe('330–030R · 4–8 NM');
    expect(stationText(PLANE_GUARD)).toBe('170R · 4,000 YD');
  });
});
