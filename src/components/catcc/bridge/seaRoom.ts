/**
 * Sea room ahead: how far the ship can go along its course before it reaches land or water too shallow
 * for it (the marine data's not-navigable region, shallower than ~15 m). From the theatre's marine data
 * (lon/lat rings), in a local flat frame about the ship (fine to a few hundred NM).
 */
import { useEffect, useMemo, useState } from 'react';
import { loadMarine, type MarineData } from '../radar/marine.ts';

/** a hazard ring (land or shallow water): flat [lon, lat, ...] and its bounding box */
interface Ring {
  p: number[];
  w: number;
  s: number;
  e: number;
  n: number;
}

const hazardCache = new WeakMap<MarineData, Ring[]>();
function hazards(d: MarineData): Ring[] {
  let out = hazardCache.get(d);
  if (out) return out;
  out = [];
  for (const p of [...d.land, ...(d.nav?.fill ?? [])]) {
    let w = Infinity;
    let s = Infinity;
    let e = -Infinity;
    let n = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      if (p[i] < w) w = p[i];
      if (p[i] > e) e = p[i];
      if (p[i + 1] < s) s = p[i + 1];
      if (p[i + 1] > n) n = p[i + 1];
    }
    out.push({ p, w, s, e, n });
  }
  hazardCache.set(d, out);
  return out;
}

/**
 * Distance (NM) along course `crsDeg` from (lat, lon) to the first land or shoal-water boundary, or null if
 * there is none within `maxNm`.
 */
export function seaRoomNm(d: MarineData, lat: number, lon: number, crsDeg: number, maxNm = 100): number | null {
  const k = Math.cos((lat * Math.PI) / 180);
  const ux = Math.sin((crsDeg * Math.PI) / 180);
  const uy = Math.cos((crsDeg * Math.PI) / 180);
  // the ray's box, deg
  const ex = lon + (ux * maxNm) / (60 * k);
  const ey = lat + (uy * maxNm) / 60;
  const bw = Math.min(lon, ex);
  const be = Math.max(lon, ex);
  const bs = Math.min(lat, ey);
  const bn = Math.max(lat, ey);
  let best = Infinity;
  for (const r of hazards(d)) {
    if (r.e < bw || r.w > be || r.n < bs || r.s > bn) continue;
    const p = r.p;
    for (let i = 0; i + 3 < p.length; i += 2) {
      // segment in NM about the ship (x east, y north)
      const ax = (p[i] - lon) * 60 * k;
      const ay = (p[i + 1] - lat) * 60;
      const bx = (p[i + 2] - lon) * 60 * k;
      const by = (p[i + 3] - lat) * 60;
      const sx = bx - ax;
      const sy = by - ay;
      const den = ux * sy - uy * sx;
      if (Math.abs(den) < 1e-12) continue;
      // ship + t u = a + v s, t >= 0, 0 <= v <= 1
      const t = (ax * sy - ay * sx) / den;
      const v = (ax * uy - ay * ux) / den;
      if (t >= 0 && t < best && v >= 0 && v <= 1) best = t;
    }
  }
  return best <= maxNm ? best : null;
}

/** The theatre's marine data, loaded once (shared with the scope's cache). */
export function useMarineData(theatre: string | undefined): MarineData | null {
  const [d, setD] = useState<MarineData | null>(null);
  useEffect(() => {
    setD(null);
    if (!theatre) return;
    let live = true;
    loadMarine(theatre).then((x) => live && setD(x));
    return () => {
      live = false;
    };
  }, [theatre]);
  return d;
}

/** Sea room ahead of a ship, recomputed as it moves (~0.1 NM) or turns (1 deg). */
export function useSeaRoom(d: MarineData | null, lat: number | undefined, lon: number | undefined, crs: number | undefined, maxNm = 100): number | null | undefined {
  const qLat = lat === undefined ? undefined : Math.round(lat * 600) / 600;
  const qLon = lon === undefined ? undefined : Math.round(lon * 600) / 600;
  const qCrs = crs === undefined ? undefined : Math.round(crs);
  return useMemo(() => (d && qLat !== undefined && qLon !== undefined && qCrs !== undefined ? seaRoomNm(d, qLat, qLon, qCrs, maxNm) : undefined), [d, qLat, qLon, qCrs, maxNm]);
}
