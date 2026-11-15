import { describe, expect, it } from 'vitest';
import { casToTasKt, ISA_SL_K, isaTempK, machFromTasKt, speedOfSoundKt, tasToCasKt, tempAtAltK, windAlongKt, windVecKt, wxWindLayers, type WindLayer } from './atmosphere.ts';
import type { CarrierWx } from '../dcs/hookProtocol.ts';

describe('standard atmosphere', () => {
  it('speed of sound is ~661.5 kt at ISA sea level', () => {
    expect(speedOfSoundKt(ISA_SL_K)).toBeCloseTo(661.5, 0);
  });

  it('ISA temperature lapses to the tropopause then holds isothermal', () => {
    expect(isaTempK(0)).toBeCloseTo(288.15, 2);
    expect(isaTempK(36089)).toBeCloseTo(216.65, 0);
    expect(isaTempK(45000)).toBeCloseTo(216.65, 2); // stratosphere: unchanged
  });

  it('carries the sea-level deviation aloft as a constant offset', () => {
    const slHot = ISA_SL_K + 10; // ISA+10 day
    expect(tempAtAltK(slHot, 0)).toBeCloseTo(298.15, 2);
    expect(tempAtAltK(slHot, 20000)).toBeCloseTo(isaTempK(20000) + 10, 2);
  });

  it('Mach of a true airspeed rises with altitude as the air cools', () => {
    const sea = machFromTasKt(450, tempAtAltK(ISA_SL_K, 0));
    const high = machFromTasKt(450, tempAtAltK(ISA_SL_K, 30000));
    expect(sea).toBeCloseTo(450 / 661.5, 2);
    expect(high).toBeGreaterThan(sea); // same TAS is a higher Mach where it is colder
  });
});

describe('windVecKt', () => {
  const kt = 0.514444; // m/s in one knot, so (speedMs / kt) is the speed in knots

  it('is calm when nothing is reported', () => {
    expect(windVecKt([], 5000)).toEqual([0, 0]);
  });

  it('points toward the reciprocal of the FROM direction (wind from the west blows east, +x)', () => {
    const v = windVecKt([{ altFt: 0, dirFrom: 270, speedMs: 10 }], 0);
    expect(v[0]).toBeCloseTo(10 / kt, 1); // ~19.4 kt east
    expect(v[1]).toBeCloseTo(0, 6);
  });

  it('holds the single reported layer at every altitude', () => {
    const layers: WindLayer[] = [{ altFt: 2000, dirFrom: 0, speedMs: 5 }];
    expect(windVecKt(layers, 0)).toEqual(windVecKt(layers, 30000));
  });

  it('interpolates linearly between layers and holds beyond the ends', () => {
    const layers: WindLayer[] = [
      { altFt: 0, dirFrom: 270, speedMs: 10 },
      { altFt: 2000, dirFrom: 270, speedMs: 20 },
    ];
    expect(windVecKt(layers, 1000)[0]).toBeCloseTo(15 / kt, 1); // midpoint: 15 m/s east
    expect(windVecKt(layers, 5000)[0]).toBeCloseTo(20 / kt, 1); // above the top: held at 20 m/s
    expect(windVecKt(layers, -500)[0]).toBeCloseTo(10 / kt, 1); // below the bottom: held at 10 m/s
  });

  it('component along a heading is + for a tailwind and − for a headwind', () => {
    const north = windVecKt([{ altFt: 0, dirFrom: 180, speedMs: 10 }], 0); // wind FROM south → blows north
    expect(windAlongKt(north, 0)).toBeGreaterThan(0); // flying north: tailwind
    expect(windAlongKt(north, 180)).toBeLessThan(0); // flying south: headwind
    expect(windAlongKt(north, 90)).toBeCloseTo(0, 6); // flying east: pure crosswind
  });

  it('maps CarrierWx to the deck / 2,000 / 10,000 ft layers', () => {
    const wx: CarrierWx = { d0: 90, s0: 5, d2: 90, s2: 10, d10: 90, s10: 20, tK: 288.15, qnh: 101325 };
    const layers = wxWindLayers(wx);
    expect(layers.map((l) => l.altFt)).toEqual([0, 2000, 10000]);
    // wind from the east (090) blows west: −x
    expect(windVecKt(layers, 0)[0]).toBeLessThan(0);
  });
});

describe('CAS ↔ TAS', () => {
  it('CAS equals TAS at ISA sea level', () => {
    expect(casToTasKt(350, 0, ISA_SL_K)).toBeCloseTo(350, 0);
    expect(tasToCasKt(350, 0, ISA_SL_K)).toBeCloseTo(350, 0);
  });

  it('TAS exceeds CAS at altitude (thinner air)', () => {
    const tas = casToTasKt(300, 30000, ISA_SL_K);
    expect(tas).toBeGreaterThan(300 * 1.4); // ~1.5× by 30,000 ft
  });

  it('round-trips CAS → TAS → CAS at altitude and on a non-standard day', () => {
    for (const altFt of [5000, 25000, 40000]) {
      for (const slTempK of [ISA_SL_K, ISA_SL_K + 15]) {
        const back = tasToCasKt(casToTasKt(320, altFt, slTempK, 99000), altFt, slTempK, 99000);
        expect(back).toBeCloseTo(320, 1);
      }
    }
  });
});
