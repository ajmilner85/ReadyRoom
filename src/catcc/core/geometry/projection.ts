/**
 * Azimuthal equidistant projection about the focus carrier (handoff §3.1): range and bearing
 * from the ship are exact, which is what CATCC geometry (DME, radials) is defined in.
 * Output is scope coordinates: NM, +x east, +y south.
 */
import { bearingDeg, destination, distanceNm } from '../geo.ts';
import { bearingOf, len, type Pt } from './vec.ts';

export interface Projection {
  lat0: number;
  lon0: number;
  toScope(lat: number, lon: number): Pt;
  toLatLon(p: Pt): { lat: number; lon: number };
}

export function aeqd(lat0: number, lon0: number): Projection {
  return {
    lat0,
    lon0,
    toScope(lat, lon) {
      const r = distanceNm(lat0, lon0, lat, lon);
      if (r < 1e-9) return [0, 0];
      const b = (bearingDeg(lat0, lon0, lat, lon) * Math.PI) / 180;
      return [r * Math.sin(b), -r * Math.cos(b)];
    },
    toLatLon(p) {
      const r = len(p);
      if (r < 1e-9) return { lat: lat0, lon: lon0 };
      return destination(lat0, lon0, bearingOf(p), r);
    },
  };
}
