/** Marine layer data (coastline + bathymetry contours) per theatre; see scripts/catcc-marine.mjs. */
import { useEffect, useRef, useState } from 'react';
import { distanceNm } from '../../../catcc/core/geo.ts';
import { aeqd } from '../../../catcc/core/geometry/projection.ts';

export interface MarineData {
  v: number;
  theatre: string;
  bbox: [number, number, number, number];
  land: number[][];
  coast: number[][];
  /** water shallower than d metres (not navigable by a carrier) */
  nav?: { d: number; fill: number[][] };
  /** contour lines at d metres, region shallower than d, label anchors [lon, lat, lon2, lat2] */
  depth: { d: number; lines: number[][]; fill?: number[][]; labels?: number[][] }[];
  /** place names; r = 0 (major) .. 3 (minor) */
  places?: { n: string; lat: number; lon: number; r: number; k?: 'island' }[];
  /** large/medium airports and military fields */
  airports?: { id: string; n: string; lat: number; lon: number; r: number; mil: boolean; rw?: number[][] }[];
}

/** "Antonio B. Won Pat International Airport" → "ANTONIO B. WON PAT INTL" */
const shortName = (n: string) =>
  n
    .replace(/International/gi, 'Intl')
    .replace(/\s+Airport$/i, '')
    .replace(/Air Force Base/gi, 'AFB')
    .replace(/Air Base/gi, 'AB')
    .replace(/Naval Air Station/gi, 'NAS')
    .toUpperCase();

const cache = new Map<string, Promise<MarineData | null>>();
export function loadMarine(theatre: string): Promise<MarineData | null> {
  let p = cache.get(theatre);
  if (!p) {
    p = fetch(`/catcc/marine/${encodeURIComponent(theatre)}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<MarineData>) : null))
      .catch(() => null);
    cache.set(theatre, p);
  }
  return p;
}

export interface MarinePaths {
  /** projection origin; the paths are in scope NM about it */
  lat: number;
  lon: number;
  land: string;
  coast: string;
  nav: string;
  depth: { d: number; path: string; fill: string }[];
  labels: { x: number; y: number; ang: number; t: string }[];
  places: { x: number; y: number; n: string; r: number; island: boolean }[];
  /** rw: runways as [dx1, dy1, dx2, dy2] NM from the airport point; long: longest runway >= 8069 ft */
  airports: { x: number; y: number; id: string; n: string; r: number; mil: boolean; rw: number[][]; ext: number; long: boolean }[];
}

/**
 * Paths projected about a fixed origin near the reference carrier, re-projected only when the
 * carrier has moved 10 NM from it (the scope translates them in between; the error is negligible).
 */
export function useMarine(theatre: string | undefined, lat: number | undefined, lon: number | undefined, on: boolean): MarinePaths | null {
  const [data, setData] = useState<MarineData | null>(null);
  const [paths, setPaths] = useState<MarinePaths | null>(null);
  const origin = useRef<{ lat: number; lon: number } | null>(null);
  useEffect(() => {
    setData(null);
    if (!theatre || !on) return;
    let live = true;
    loadMarine(theatre).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [theatre, on]);
  const stale = !origin.current || lat === undefined || lon === undefined || distanceNm(origin.current.lat, origin.current.lon, lat, lon) > 10;
  useEffect(() => {
    if (!data || lat === undefined || lon === undefined) {
      setPaths(null);
      origin.current = null;
      return;
    }
    if (!stale && paths) return;
    origin.current = { lat, lon };
    const pr = aeqd(lat, lon);
    const d = (rings: number[][], close: boolean) => {
      let s = '';
      for (const r of rings) {
        for (let i = 0; i < r.length; i += 2) {
          const [x, y] = pr.toScope(r[i + 1], r[i]);
          s += `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
        }
        if (close) s += 'Z';
      }
      return s;
    };
    const labels: MarinePaths['labels'] = [];
    for (const x of data.depth)
      for (const [lo, la, lo2, la2] of x.labels ?? []) {
        const [px, py] = pr.toScope(la, lo);
        const [qx, qy] = pr.toScope(la2, lo2);
        let ang = (Math.atan2(qy - py, qx - px) * 180) / Math.PI;
        if (ang > 90) ang -= 180;
        if (ang <= -90) ang += 180;
        labels.push({ x: px, y: py, ang, t: String(x.d) });
      }
    setPaths({
      lat,
      lon,
      land: d(data.land, true),
      coast: d(data.coast, false),
      nav: d(data.nav?.fill ?? [], true),
      depth: data.depth.map((x) => ({ d: x.d, path: d(x.lines, false), fill: d(x.fill ?? [], true) })),
      labels,
      places: (data.places ?? []).map((p) => {
        const [x, y] = pr.toScope(p.lat, p.lon);
        return { x, y, n: p.n, r: p.r, island: p.k === 'island' };
      }),
      airports: (data.airports ?? []).map((a) => {
        const [x, y] = pr.toScope(a.lat, a.lon);
        const rw = (a.rw ?? []).map(([la1, lo1, la2, lo2]) => {
          const [x1, y1] = pr.toScope(la1, lo1);
          const [x2, y2] = pr.toScope(la2, lo2);
          return [x1 - x, y1 - y, x2 - x, y2 - y];
        });
        const ext = Math.max(0, ...rw.flatMap(([a1, b1, a2, b2]) => [Math.hypot(a1, b1), Math.hypot(a2, b2)]));
        const long = rw.some(([a1, b1, a2, b2]) => Math.hypot(a2 - a1, b2 - b1) >= 8069 / 6076);
        return { x, y, id: a.id, n: shortName(a.n), r: a.r, mil: a.mil, rw, ext, long };
      }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, stale]);
  return on ? paths : null;
}
