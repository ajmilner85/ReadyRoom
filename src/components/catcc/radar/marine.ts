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
}

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
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, stale]);
  return on ? paths : null;
}
