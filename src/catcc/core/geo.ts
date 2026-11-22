/** Units and great-circle helpers. Bearings are degrees true, 0..360. */

export const M_PER_NM = 1852;
export const M_PER_FT = 0.3048;
export const MS_PER_KT = 1852 / 3600;
const R_EARTH_M = 6371008.8;
const D2R = Math.PI / 180;

export const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;

/** Great-circle distance in nautical miles. */
export function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * D2R;
  const p2 = lat2 * D2R;
  const dp = p2 - p1;
  const dl = (lon2 - lon1) * D2R;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return (2 * R_EARTH_M * Math.asin(Math.min(1, Math.sqrt(a)))) / M_PER_NM;
}

/** Initial great-circle bearing from point 1 to point 2, degrees true. */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * D2R;
  const p2 = lat2 * D2R;
  const dl = (lon2 - lon1) * D2R;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return norm360(Math.atan2(y, x) / D2R);
}

/** Faster than anything the radars track (kt): a groundspeed above it is a bad sample, not a speed. */
export const MAX_PLAUSIBLE_GS_KT = 1500;

/**
 * A move of `nm` in `dtS` seconds that no aircraft or ship makes: a teleport (respawn, replay loop or
 * seek, mission restart) or time running backwards. Intervals under 1 s count as 1 s, so sample
 * jitter on closely spaced frames doesn't trip it.
 */
export function implausibleMove(nm: number, dtS: number): boolean {
  return dtS < 0 || (nm * 3600) / Math.max(dtS, 1) > MAX_PLAUSIBLE_GS_KT;
}

/** Point at bearing/range (NM) from an origin. */
export function destination(lat: number, lon: number, brgDeg: number, rangeNm: number): { lat: number; lon: number } {
  const d = (rangeNm * M_PER_NM) / R_EARTH_M;
  const b = brgDeg * D2R;
  const p1 = lat * D2R;
  const l1 = lon * D2R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 / D2R, lon: ((l2 / D2R + 540) % 360) - 180 };
}
