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
  nav?: { d: number; fill: number[][]; lines?: number[][] };
  /** ~12 NM from shore (approximate territorial limit) */
  terr?: number[][];
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

/** A projected ring or line (scope NM about the origin) with its bounding box. */
export interface Poly {
  p: Float64Array;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Marine geometry projected about a fixed origin near the reference carrier. */
export interface MarineGeom {
  lat: number;
  lon: number;
  land: Poly[];
  coast: Poly[];
  nav: Poly[];
  navLine: Poly[];
  terr: Poly[];
  depth: { d: number; lines: Poly[]; fill: Poly[] }[];
  labels: MarinePaths['labels'];
  places: MarinePaths['places'];
  airports: MarinePaths['airports'];
}

export interface MarinePaths {
  land: string;
  coast: string;
  nav: string;
  navLine: string;
  terr: string;
  /** band: water between the next-shallower level and this one (non-overlapping, even-odd) */
  depth: { d: number; path: string; band: string }[];
  labels: { x: number; y: number; ang: number; t: string }[];
  places: { x: number; y: number; n: string; r: number; island: boolean }[];
  /** rw: runways as [dx1, dy1, dx2, dy2] NM from the airport point; long: longest runway >= 8069 ft */
  airports: { x: number; y: number; id: string; n: string; r: number; mil: boolean; rw: number[][]; ext: number; long: boolean }[];
}

/**
 * Level of detail for one snapshot: only rings whose bounds meet the view (a ring entirely outside
 * can't enclose any point of it, so even-odd fills stay correct), and points closer than `tol` NM
 * (about half a pixel) to the last kept point are skipped. Rings smaller than that vanish.
 */
export function buildPaths(g: MarineGeom, v: { x0: number; y0: number; x1: number; y1: number }, tol: number): MarinePaths {
  const t2 = tol * tol;
  const d = (polys: Poly[], close: boolean) => {
    const out: string[] = [];
    for (const q of polys) {
      if (q.x1 < v.x0 || q.x0 > v.x1 || q.y1 < v.y0 || q.y0 > v.y1) continue;
      if (q.x1 - q.x0 < tol && q.y1 - q.y0 < tol) continue;
      const p = q.p;
      const n = p.length;
      let lx = p[0];
      let ly = p[1];
      let s = `M${lx.toFixed(2)} ${ly.toFixed(2)}`;
      for (let i = 2; i < n; i += 2) {
        const x = p[i];
        const y = p[i + 1];
        const last = i === n - 2;
        if (!last && (x - lx) * (x - lx) + (y - ly) * (y - ly) < t2) continue;
        s += `L${x.toFixed(2)} ${y.toFixed(2)}`;
        lx = x;
        ly = y;
      }
      out.push(close ? `${s}Z` : s);
    }
    return out.join('');
  };
  // The regions "shallower than d" are nested, so the region shallower than d_k with the region
  // shallower than d_(k-1) cut out (both ring sets in one even-odd path) is the band between them.
  // Bands don't overlap: each pixel of water is painted once instead of once per level.
  const fills = g.depth.map((x) => d(x.fill, true));
  return {
    land: d(g.land, true),
    coast: d(g.coast, false),
    nav: d(g.nav, true),
    navLine: d(g.navLine, false),
    terr: d(g.terr, false),
    depth: g.depth.map((x, k) => ({ d: x.d, path: d(x.lines, false), band: fills[k] + (k > 0 ? fills[k - 1] : '') })),
    labels: g.labels,
    places: g.places,
    airports: g.airports,
  };
}

/**
 * Geometry projected about a fixed origin near the reference carrier, re-projected only when the
 * carrier has moved 10 NM from it (the scope translates it in between; the error is negligible).
 */
export function useMarine(theatre: string | undefined, lat: number | undefined, lon: number | undefined, on: boolean): MarineGeom | null {
  const [data, setData] = useState<MarineData | null>(null);
  const [geom, setGeom] = useState<MarineGeom | null>(null);
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
      setGeom(null);
      origin.current = null;
      return;
    }
    if (!stale && geom) return;
    origin.current = { lat, lon };
    const pr = aeqd(lat, lon);
    const polys = (rings: number[][]): Poly[] =>
      rings.map((r) => {
        const p = new Float64Array(r.length);
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        for (let i = 0; i < r.length; i += 2) {
          const [x, y] = pr.toScope(r[i + 1], r[i]);
          p[i] = x;
          p[i + 1] = y;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
        return { p, x0, y0, x1, y1 };
      });
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
    setGeom({
      lat,
      lon,
      land: polys(data.land),
      coast: polys(data.coast),
      nav: polys(data.nav?.fill ?? []),
      navLine: polys(data.nav?.lines ?? []),
      terr: polys(data.terr ?? []),
      depth: data.depth.map((x) => ({ d: x.d, lines: polys(x.lines), fill: polys(x.fill ?? []) })),
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
  return on ? geom : null;
}
