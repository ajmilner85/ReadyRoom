/**
 * Standard-atmosphere helpers for the intercept tools: temperature and speed of sound aloft from the
 * mission's sea-level temperature, and a wind vector interpolated from the carrier's reported winds.
 *
 * The air carries the sea-level ISA deviation aloft unchanged (the usual non-standard-day assumption):
 * T(h) = ISA(h) + (T_sl − 288.15 K), with the ISA troposphere lapse (−1.9812 K/1000 ft) to the
 * tropopause (36,089 ft) and isothermal 216.65 K above. Speed of sound depends on temperature only.
 */
import type { CarrierWx } from '../dcs/hookProtocol.ts';
import { type Pt, dir, mul } from '../geometry/vec.ts';

export const ISA_SL_K = 288.15;
const LAPSE_K_PER_FT = 0.0019812; // 6.5 K/km
const TROPOPAUSE_FT = 36089;
const TROPOPAUSE_K = 216.65;
const KT_PER_MS = 1 / 0.514444;
/** a = √(γRT): γ=1.4, R=287.053 → a[kt] = 38.967·√(T[K]) (≈ 661.5 kt at ISA sea level). */
const A_COEF_KT = 38.967;

/** ISA temperature (K) at a pressure altitude, troposphere lapse then isothermal stratosphere. */
export function isaTempK(altFt: number): number {
  return altFt <= TROPOPAUSE_FT ? ISA_SL_K - LAPSE_K_PER_FT * altFt : TROPOPAUSE_K;
}

/** Temperature (K) at altitude for a mission whose sea-level temperature is `slTempK`. */
export function tempAtAltK(slTempK: number, altFt: number): number {
  return isaTempK(altFt) + (slTempK - ISA_SL_K);
}

/** Local speed of sound (kt) for an air temperature (K). */
export function speedOfSoundKt(tempK: number): number {
  return A_COEF_KT * Math.sqrt(Math.max(1, tempK));
}

/** Mach number of a true airspeed (kt) at an air temperature (K). */
export function machFromTasKt(tasKt: number, tempK: number): number {
  return tasKt / speedOfSoundKt(tempK);
}

const P0_PA = 101325; // ISA sea-level static pressure
const A0_KT = 661.4788; // ISA sea-level speed of sound

/** ISA static-pressure ratio P/P0 at a pressure altitude (troposphere power law, then exponential). */
export function isaPressureRatio(altFt: number): number {
  if (altFt <= TROPOPAUSE_FT) return (1 - 6.87535e-6 * altFt) ** 5.255877;
  return 0.2233611 * Math.exp(-(altFt - TROPOPAUSE_FT) / 20805.7);
}

/** Static pressure (Pa) at altitude, anchored to the reported sea-level pressure (QNH, Pa). */
export function staticPressurePa(altFt: number, qnhPa?: number | null): number {
  return (qnhPa ?? P0_PA) * isaPressureRatio(altFt);
}

/**
 * True airspeed (kt) for a calibrated airspeed at altitude — the subsonic compressible chain: CAS
 * gives the impact pressure qc, qc with the local static pressure gives Mach, and Mach with the local
 * temperature gives TAS. Adequate up to ~M1; above that a Rayleigh correction would be needed.
 */
export function casToTasKt(casKt: number, altFt: number, slTempK: number, qnhPa?: number | null): number {
  const qc = P0_PA * ((1 + 0.2 * (casKt / A0_KT) ** 2) ** 3.5 - 1);
  const P = staticPressurePa(altFt, qnhPa);
  const mach = Math.sqrt(5 * ((qc / P + 1) ** (2 / 7) - 1));
  return mach * speedOfSoundKt(tempAtAltK(slTempK, altFt));
}

/** Calibrated airspeed (kt) for a true airspeed at altitude (inverse of casToTasKt). */
export function tasToCasKt(tasKt: number, altFt: number, slTempK: number, qnhPa?: number | null): number {
  const P = staticPressurePa(altFt, qnhPa);
  const mach = tasKt / speedOfSoundKt(tempAtAltK(slTempK, altFt));
  const qc = P * ((1 + 0.2 * mach * mach) ** 3.5 - 1);
  return A0_KT * Math.sqrt(5 * ((qc / P0_PA + 1) ** (2 / 7) - 1));
}

/** Component of a wind vector (kt, scope coords) along a heading (deg true): + is a tailwind. */
export function windAlongKt(wind: Pt, headingDeg: number): number {
  return wind[0] * dir(headingDeg)[0] + wind[1] * dir(headingDeg)[1];
}

/** One reported wind layer: altitude (ft), direction FROM (deg true), speed (m/s). */
export interface WindLayer {
  altFt: number;
  dirFrom: number | null;
  speedMs: number | null;
}

/** The velocity (kt, scope coords) the air moves TOWARD for a FROM-direction and m/s speed. */
const towardVec = (dirFrom: number, speedMs: number): Pt => mul(dir(dirFrom + 180), speedMs * KT_PER_MS);

/**
 * Wind as a velocity vector (kt, scope coords: +x east, +y south) at an altitude, linearly
 * interpolated between the reported layers (held constant above the top and below the bottom).
 * Layers missing a direction or speed are ignored; with none reported the wind is calm ([0, 0]).
 */
export function windVecKt(layers: WindLayer[], altFt: number): Pt {
  const pts = layers
    .filter((l): l is { altFt: number; dirFrom: number; speedMs: number } => l.dirFrom != null && l.speedMs != null)
    .map((l) => ({ altFt: l.altFt, v: towardVec(l.dirFrom, l.speedMs) }))
    .sort((a, b) => a.altFt - b.altFt);
  if (!pts.length) return [0, 0];
  if (altFt <= pts[0].altFt) return pts[0].v;
  if (altFt >= pts[pts.length - 1].altFt) return pts[pts.length - 1].v;
  for (let i = 1; i < pts.length; i++) {
    if (altFt <= pts[i].altFt) {
      const a = pts[i - 1];
      const b = pts[i];
      const f = (altFt - a.altFt) / (b.altFt - a.altFt || 1);
      return [a.v[0] + (b.v[0] - a.v[0]) * f, a.v[1] + (b.v[1] - a.v[1]) * f];
    }
  }
  return pts[pts.length - 1].v;
}

/** The three reported carrier-weather layers (deck, 2,000 ft, 10,000 ft) as WindLayer[]. */
export function wxWindLayers(wx: CarrierWx): WindLayer[] {
  return [
    { altFt: 0, dirFrom: wx.d0, speedMs: wx.s0 },
    { altFt: 2000, dirFrom: wx.d2, speedMs: wx.s2 },
    { altFt: 10000, dirFrom: wx.d10, speedMs: wx.s10 },
  ];
}
