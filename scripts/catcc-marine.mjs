#!/usr/bin/env node
/**
 * Builds the CATCC marine layer data (coastline + bathymetry) per DCS theatre.
 *
 *   node scripts/catcc-marine.mjs <GSHHS_f_L1.shp> <cache-dir> --places <ne_10m_populated_places_simple.geojson>
 *        --airports <ourairports airports.csv> [Theatre ...]
 *
 * Inputs:
 *  - GSHHG full-resolution shoreline, level 1 (land/ocean), shapefile (LGPL; Wessel & Smith,
 *    https://www.soest.hawaii.edu/pwessel/gshhg/)
 *  - NOAA ETOPO 2022 relief (15 arc-second grid), fetched per theatre box from the NOAA CoastWatch
 *    ERDDAP server (public domain); responses are cached in <cache-dir>
 *  - Natural Earth 10m populated places (public domain); OurAirports airports.csv + runways.csv
 *    (public domain, https://ourairports.com/data/); island names from Wikidata (CC0), queried per
 *    theatre box and cached in <cache-dir>
 *
 * Output: public/catcc/marine/<Theatre>.json (format v2)
 *   land:  rings (even-odd fill)
 *   coast: shoreline polylines (the cut along the data box is left out)
 *   nav:   { d, fill } water shallower than d, i.e. not navigable by a carrier
 *   depth: [{ d, lines, fill, labels }] contour lines at d metres, the closed region shallower than d
 *          (even-odd fill), and label anchors [lon, lat, lon2, lat2] (a point on the line and one
 *          about 1 NM further along, for the label angle)
 *   places:   [{ n, lat, lon, r }] place names, r = 0 (major) .. 3 (minor), for zoom-dependent display
 *   airports: [{ id, n, lat, lon, r, mil, rw }] large/medium airports and military fields;
 *             rw = runways [[lat1, lon1, lat2, lon2], ...] (threshold to threshold, open runways >= 1500 ft)
 *   places entries with k: 'island' are island / island-group names (Wikidata, CC0)
 *   Every ring/line is a flat [lon, lat, lon, lat, ...] array.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// [south, west, north, east]; contour levels (m); ETOPO stride in 15" cells
const THEATRES = {
  PersianGulf: { bbox: [22.5, 50.5, 31, 60.5], levels: [20, 50, 100, 200, 500, 1000, 2000], stride: 2 },
  Caucasus: { bbox: [40.5, 35.5, 46.5, 46], levels: [50, 200, 500, 1000, 2000], stride: 2 },
  Syria: { bbox: [30.5, 29.5, 38.5, 39.5], levels: [50, 200, 500, 1000, 2000], stride: 2 },
  SinaiMap: { bbox: [26, 28.5, 33.5, 36.5], levels: [50, 200, 500, 1000], stride: 2 },
  MarianaIslands: { bbox: [10.5, 140.5, 22.5, 149.5], levels: [200, 1000, 2000, 4000, 6000, 8000], stride: 4 },
  Falklands: { bbox: [-58, -72, -46, -50], levels: [50, 100, 200, 500, 1000, 3000], stride: 4 },
  Kola: { bbox: [64, 20, 72.5, 46], levels: [50, 100, 200, 300], stride: 4 },
  Normandy: { bbox: [48, -4, 52, 3], levels: [20, 30, 50, 75], stride: 2 },
  TheChannel: { bbox: [49.5, -1.5, 52.5, 3.5], levels: [20, 30, 50], stride: 2 },
  Iraq: { bbox: [28.5, 46, 31.5, 50.5], levels: [10, 20], stride: 2 },
};

/** water shallower than this is shaded as not navigable (a CVN draws about 12 m) */
const NAV_M = 15;
const COAST_TOL = 0.0003; // deg, ~30 m: keeps the full-resolution shoreline smooth at max zoom
const LINE_TOL = 0.002; // ~0.12 NM
const MIN_LINE_NM = 2;
const LABEL_EVERY_NM = 40;
const CLOSED_LABEL_NM = 120;
const r4 = (n) => Math.round(n * 10000) / 10000;
const r3 = (n) => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------- ETOPO 2022 grid

async function fetchGrid(name, bbox, stride, cacheDir) {
  const [s, w, n, e] = bbox;
  const file = join(cacheDir, `${name}-${stride}.csv`);
  let text;
  if (existsSync(file)) text = readFileSync(file, 'utf8');
  else {
    const url = `https://coastwatch.pfeg.noaa.gov/erddap/griddap/ETOPO_2022_v1_15s.csv?z%5B(${s}):${stride}:(${n})%5D%5B(${w}):${stride}:(${e})%5D`;
    let res;
    for (let tries = 0; ; tries++) {
      res = await fetch(url);
      if (res.ok || tries >= 5) break;
      await new Promise((r) => setTimeout(r, 8000 * (tries + 1))); // the ERDDAP server sheds load with 503s
    }
    if (!res.ok) throw new Error(`ETOPO ${res.status}`);
    text = await res.text();
    writeFileSync(file, text);
  }
  const lats = [];
  const lons = [];
  const latIdx = new Map();
  const lonIdx = new Map();
  const I = [];
  const J = [];
  const Z = [];
  let pos = text.indexOf('\n', text.indexOf('\n') + 1) + 1; // skip the two header rows
  while (pos < text.length) {
    let end = text.indexOf('\n', pos);
    if (end < 0) end = text.length;
    const line = text.slice(pos, end);
    pos = end + 1;
    if (!line) continue;
    const c1 = line.indexOf(',');
    const c2 = line.indexOf(',', c1 + 1);
    const la = +line.slice(0, c1);
    const lo = +line.slice(c1 + 1, c2);
    const zv = +line.slice(c2 + 1);
    let i = latIdx.get(la);
    if (i === undefined) latIdx.set(la, (i = lats.push(la) - 1));
    let j = lonIdx.get(lo);
    if (j === undefined) lonIdx.set(lo, (j = lons.push(lo) - 1));
    I.push(i);
    J.push(j);
    Z.push(Number.isFinite(zv) ? zv : 0);
  }
  const z = Array.from({ length: lats.length }, () => new Float32Array(lons.length));
  for (let k = 0; k < Z.length; k++) z[I[k]][J[k]] = Z[k];
  return { lats, lons, z };
}

/** the grid with a one-cell border of very deep water, so every "shallower than t" contour closes */
function padDeep({ lats, lons, z }) {
  const dl = lats[1] - lats[0];
  const dn = lons[1] - lons[0];
  const L = [lats[0] - dl, ...lats, lats[lats.length - 1] + dl];
  const N = [lons[0] - dn, ...lons, lons[lons.length - 1] + dn];
  const Z = L.map((_, i) => {
    const row = new Float32Array(N.length).fill(-1e5);
    if (i > 0 && i < L.length - 1) row.set(z[i - 1], 1);
    return row;
  });
  return { lats: L, lons: N, z: Z };
}

// ---------------------------------------------------------------- GSHHG shapefile (polygons)

function readShp(path, box) {
  const buf = readFileSync(path);
  const out = [];
  const [s, w, n, e] = box;
  let o = 100;
  while (o + 8 <= buf.length) {
    const len = buf.readInt32BE(o + 4) * 2;
    const c = o + 8;
    o = c + len;
    if (buf.readInt32LE(c) !== 5) continue;
    const x0 = buf.readDoubleLE(c + 4);
    const y0 = buf.readDoubleLE(c + 12);
    const x1 = buf.readDoubleLE(c + 20);
    const y1 = buf.readDoubleLE(c + 28);
    if (x1 < w || x0 > e || y1 < s || y0 > n) continue;
    const np = buf.readInt32LE(c + 36);
    const npt = buf.readInt32LE(c + 40);
    const parts = [];
    for (let k = 0; k < np; k++) parts.push(buf.readInt32LE(c + 44 + 4 * k));
    parts.push(npt);
    const p0 = c + 44 + 4 * np;
    for (let k = 0; k < np; k++) {
      const ring = [];
      for (let q = parts[k]; q < parts[k + 1]; q++) ring.push([buf.readDoubleLE(p0 + 16 * q), buf.readDoubleLE(p0 + 16 * q + 8)]);
      out.push(ring);
    }
  }
  return out;
}

// ---------------------------------------------------------------- marching squares

function contour({ lats, lons, z }, t) {
  const ni = lats.length;
  const nj = lons.length;
  // edge ids: horizontal edge (i, j)-(i, j+1) = 2*(i*nj+j); vertical (i, j)-(i+1, j) = 2*(i*nj+j)+1
  const edgePt = (id) => {
    const k = id >> 1;
    const i = Math.floor(k / nj);
    const j = k % nj;
    const [i2, j2] = id & 1 ? [i + 1, j] : [i, j + 1];
    const a = z[i][j];
    const b = z[i2][j2];
    const f = (t - a) / (b - a);
    return [lons[j] + (lons[j2] - lons[j]) * f, lats[i] + (lats[i2] - lats[i]) * f];
  };
  const segs = [];
  const H = (i, j) => 2 * (i * nj + j);
  const V = (i, j) => 2 * (i * nj + j) + 1;
  for (let i = 0; i < ni - 1; i++) {
    for (let j = 0; j < nj - 1; j++) {
      const a = z[i][j] > t ? 1 : 0; // SW
      const b = z[i][j + 1] > t ? 1 : 0; // SE
      const c = z[i + 1][j + 1] > t ? 1 : 0; // NE
      const d = z[i + 1][j] > t ? 1 : 0; // NW
      const idx = a | (b << 1) | (c << 2) | (d << 3);
      if (idx === 0 || idx === 15) continue;
      const S = H(i, j);
      const N = H(i + 1, j);
      const W = V(i, j);
      const E = V(i, j + 1);
      const centre = (z[i][j] + z[i][j + 1] + z[i + 1][j + 1] + z[i + 1][j]) / 4 > t;
      switch (idx) {
        case 1: case 14: segs.push([W, S]); break;
        case 2: case 13: segs.push([S, E]); break;
        case 3: case 12: segs.push([W, E]); break;
        case 4: case 11: segs.push([E, N]); break;
        case 6: case 9: segs.push([S, N]); break;
        case 7: case 8: segs.push([W, N]); break;
        case 5: if (centre) segs.push([W, N], [S, E]); else segs.push([W, S], [E, N]); break;
        case 10: if (centre) segs.push([W, S], [E, N]); else segs.push([W, N], [S, E]); break;
      }
    }
  }
  // link segments into polylines (each edge point joins at most two segments)
  const adj = new Map();
  segs.forEach((s, k) => {
    for (const e of s) {
      const a = adj.get(e);
      if (a) a.push(k);
      else adj.set(e, [k]);
    }
  });
  const used = new Uint8Array(segs.length);
  const walk = (start, from) => {
    const out = [];
    let end = start;
    for (;;) {
      const next = (adj.get(end) ?? []).find((k) => !used[k]);
      if (next === undefined) return out;
      used[next] = 1;
      const s = segs[next];
      end = s[0] === end ? s[1] : s[0];
      out.push(end);
    }
  };
  const lines = [];
  for (let k0 = 0; k0 < segs.length; k0++) {
    if (used[k0]) continue;
    used[k0] = 1;
    const fwd = walk(segs[k0][1]);
    const back = walk(segs[k0][0]);
    const chain = [...back.reverse(), segs[k0][0], segs[k0][1], ...fwd];
    lines.push(chain.map(edgePt));
  }
  return lines;
}

// ---------------------------------------------------------------- geometry helpers

const nm = (a, b) => {
  const k = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  return Math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * 60;
};
const lengthNm = (l) => l.reduce((s, p, i) => (i ? s + nm(l[i - 1], p) : 0), 0);
const isClosed = (l) => l.length > 3 && l[0][0] === l[l.length - 1][0] && l[0][1] === l[l.length - 1][1];

function chaikin(l) {
  if (l.length < 3) return l;
  const closed = isClosed(l);
  const out = closed ? [] : [l[0]];
  for (let i = 0; i < l.length - 1; i++) {
    const [p, q] = [l[i], l[i + 1]];
    out.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]], [0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
  }
  out.push(closed ? out[0] : l[l.length - 1]);
  return out;
}

function simplify(l, tol) {
  if (l.length < 3) return l;
  if (isClosed(l) && l.length > 4) {
    // closed ring: split at the point farthest from the start, simplify both halves
    let far = 1;
    for (let i = 1; i < l.length - 1; i++) if (nm(l[0], l[i]) > nm(l[0], l[far])) far = i;
    return [...simplifyOpen(l.slice(0, far + 1), tol).slice(0, -1), ...simplifyOpen(l.slice(far), tol)];
  }
  return simplifyOpen(l, tol);
}

function simplifyOpen(l, tol) {
  if (l.length < 3) return l;
  const k = Math.cos((l[0][1] * Math.PI) / 180);
  const keep = new Uint8Array(l.length);
  keep[0] = keep[l.length - 1] = 1;
  const stack = [[0, l.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = [l[a][0] * k, l[a][1]];
    const [bx, by] = [l[b][0] * k, l[b][1]];
    const dx = bx - ax;
    const dy = by - ay;
    const L = Math.hypot(dx, dy) || 1e-12;
    let worst = -1;
    let wd = 0;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((l[i][0] * k - ax) * dy - (l[i][1] - ay) * dx) / L;
      if (d > wd) [wd, worst] = [d, i];
    }
    if (wd > tol && worst > 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return l.filter((_, i) => keep[i]);
}

/** Sutherland-Hodgman clip of a closed ring to a box. */
function clipRing(ring, [s, w, n, e]) {
  const planes = [
    [(p) => p[0] >= w, (p, q) => [w, p[1] + ((q[1] - p[1]) * (w - p[0])) / (q[0] - p[0])]],
    [(p) => p[0] <= e, (p, q) => [e, p[1] + ((q[1] - p[1]) * (e - p[0])) / (q[0] - p[0])]],
    [(p) => p[1] >= s, (p, q) => [p[0] + ((q[0] - p[0]) * (s - p[1])) / (q[1] - p[1]), s]],
    [(p) => p[1] <= n, (p, q) => [p[0] + ((q[0] - p[0]) * (n - p[1])) / (q[1] - p[1]), n]],
  ];
  let out = ring.slice(0, -1);
  for (const [inside, cut] of planes) {
    if (!out.length) break;
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const p = src[i];
      const q = src[(i + 1) % src.length];
      if (inside(q)) {
        if (!inside(p)) out.push(cut(p, q));
        out.push(q);
      } else if (inside(p)) out.push(cut(p, q));
    }
  }
  return out.length >= 3 ? [...out, out[0]] : null;
}

const onBox = (p, [s, w, n, e]) => Math.abs(p[0] - w) < 1e-9 || Math.abs(p[0] - e) < 1e-9 || Math.abs(p[1] - s) < 1e-9 || Math.abs(p[1] - n) < 1e-9;

/** shoreline pieces of a clipped ring: drop edges running along the box */
function coastOf(ring, box) {
  const pieces = [];
  let cur = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const p = ring[i];
    const q = ring[i + 1];
    const along = onBox(p, box) && onBox(q, box) && (Math.abs(p[0] - q[0]) < 1e-9 || Math.abs(p[1] - q[1]) < 1e-9);
    if (along) {
      if (cur.length > 1) pieces.push(cur);
      cur = [];
    } else {
      if (!cur.length) cur.push(p);
      cur.push(q);
    }
  }
  if (cur.length > 1) pieces.push(cur);
  return pieces;
}

/**
 * Label anchors along a contour. Open lines: one every LABEL_EVERY_NM. Closed loops: by perimeter,
 * one per CLOSED_LABEL_NM (at least one), evenly spaced; loops under 10 NM get none.
 */
function labelsOf(l, closed) {
  const L = lengthNm(l);
  if (L < 10) return [];
  const want = [];
  if (closed) {
    const n = Math.max(1, Math.floor(L / CLOSED_LABEL_NM));
    for (let k = 0; k < n; k++) want.push((L * (k + 0.5)) / n);
  } else for (let d = Math.min(LABEL_EVERY_NM / 2, L / 3); d < L - 2; d += LABEL_EVERY_NM) want.push(d);
  const out = [];
  let acc = 0;
  let k = 0;
  for (let i = 1; i < l.length && k < want.length; i++) {
    const seg = nm(l[i - 1], l[i]);
    while (k < want.length && acc + seg >= want[k]) {
      const f = seg > 0 ? (want[k] - acc) / seg : 0;
      const p = [l[i - 1][0] + (l[i][0] - l[i - 1][0]) * f, l[i - 1][1] + (l[i][1] - l[i - 1][1]) * f];
      let j = i;
      while (j < l.length - 1 && nm(p, l[j]) < 1) j++;
      out.push([r3(p[0]), r3(p[1]), r3(l[j][0]), r3(l[j][1])]);
      k++;
    }
    acc += seg;
  }
  return out;
}

const flat3 = (l) => l.flatMap((p) => [r3(p[0]), r3(p[1])]);
const flat4 = (l) => l.flatMap((p) => [r4(p[0]), r4(p[1])]);

// ---------------------------------------------------------------- main

const args = process.argv.slice(2);
const opt = (k) => {
  const i = args.indexOf(k);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const placesPath = opt('--places');
const airportsPath = opt('--airports');
const runwaysPath = opt('--runways');
const [shpPath, cacheDir, ...only] = args;
if (!shpPath || !cacheDir) {
  console.error('usage: node scripts/catcc-marine.mjs <GSHHS_f_L1.shp> <cache-dir> [--places <geojson>] [--airports <csv>] [Theatre ...]');
  process.exit(1);
}

/** minimal CSV parser (quoted fields, embedded commas) */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let f = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(f);
      f = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(f);
      rows.push(row);
      row = [];
      f = '';
    } else f += ch;
  }
  if (f || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows;
}

const PLACES = placesPath
  ? JSON.parse(readFileSync(placesPath, 'utf8')).features.map((ft) => {
      const p = ft.properties;
      const sr = p.scalerank ?? 10;
      return { n: p.nameascii || p.name, lat: r4(p.latitude), lon: r4(p.longitude), r: sr <= 3 ? 0 : sr <= 6 ? 1 : sr <= 8 ? 2 : 3 };
    })
  : [];
const MIL = /air ?base|air force|\bAFB\b|\bAB\b|naval air|air station|\bNAS\b|military|airfield/i;
const AIRPORTS = (() => {
  if (!airportsPath) return [];
  const rows = parseCsv(readFileSync(airportsPath, 'utf8'));
  const h = rows[0];
  const c = (k) => h.indexOf(k);
  const [iT, iN, iLa, iLo, iId, iIcao, iGps, iSch] = ['type', 'name', 'latitude_deg', 'longitude_deg', 'ident', 'icao_code', 'gps_code', 'scheduled_service'].map(c);
  const out = [];
  for (const r of rows.slice(1)) {
    const type = r[iT];
    const name = r[iN] ?? '';
    const mil = MIL.test(name);
    if (!(type === 'large_airport' || type === 'medium_airport' || (type === 'small_airport' && mil))) continue;
    out.push({ ident: r[iId], id: r[iIcao] || r[iGps] || r[iId], n: name, lat: r4(+r[iLa]), lon: r4(+r[iLo]), r: type === 'large_airport' || (type === 'medium_airport' && mil) ? 0 : type === 'medium_airport' && r[iSch] === 'yes' ? 1 : 2, mil });
  }
  return out;
})();
const inBox = (x, [s, w, n, e]) => x.lat >= s && x.lat <= n && x.lon >= w && x.lon <= e;

/** runways by airport ident: [[lat1, lon1, lat2, lon2]] */
const RUNWAYS = (() => {
  const m = new Map();
  if (!runwaysPath) return m;
  const rows = parseCsv(readFileSync(runwaysPath, 'utf8'));
  const h = rows[0];
  const c = (k) => h.indexOf(k);
  const ix = Object.fromEntries(['airport_ident', 'length_ft', 'closed', 'le_latitude_deg', 'le_longitude_deg', 'le_heading_degT', 'he_latitude_deg', 'he_longitude_deg', 'le_ident'].map((k) => [k, c(k)]));
  for (const r of rows.slice(1)) {
    if (r[ix.closed] === '1') continue;
    const len = +r[ix.length_ft];
    if (!(len >= 1500)) continue;
    const ap = r[ix.airport_ident];
    let a = [+r[ix.le_latitude_deg], +r[ix.le_longitude_deg], +r[ix.he_latitude_deg], +r[ix.he_longitude_deg]];
    let rel = false;
    if (!a.every((v) => Number.isFinite(v) && v !== 0)) {
      // no threshold coordinates: centre on the airport later, from the heading (or the runway number) and length
      let hdg = +r[ix.le_heading_degT];
      if (!Number.isFinite(hdg) || r[ix.le_heading_degT] === '') hdg = (parseInt(r[ix.le_ident], 10) || NaN) * 10;
      if (!Number.isFinite(hdg)) continue;
      a = [hdg, len];
      rel = true;
    }
    if (!m.has(ap)) m.set(ap, []);
    m.get(ap).push({ a, rel });
  }
  return m;
})();
function runwaysOf(ap) {
  return (RUNWAYS.get(ap.ident) ?? []).map(({ a, rel }) => {
    if (!rel) return a.map(r4);
    const [hdg, len] = a;
    const half = (len * 0.3048) / 2 / 1852 / 60; // deg of latitude
    const k = Math.cos((ap.lat * Math.PI) / 180);
    const dy = half * Math.cos((hdg * Math.PI) / 180);
    const dx = (half * Math.sin((hdg * Math.PI) / 180)) / k;
    return [ap.lat - dy, ap.lon - dx, ap.lat + dy, ap.lon + dx].map(r4);
  });
}

/** Wikidata islands in a box; big boxes time out, so on failure the box is split into quarters */
async function wikidataIslands([s, w, n, e], depth = 0) {
  const q = `SELECT ?i ?name ?c ?sl WHERE { SERVICE wikibase:box { ?i wdt:P625 ?c . bd:serviceParam wikibase:cornerSouthWest "Point(${w} ${s})"^^geo:wktLiteral . bd:serviceParam wikibase:cornerNorthEast "Point(${e} ${n})"^^geo:wktLiteral . } ?i wdt:P31 ?t . VALUES ?t { wd:Q23442 wd:Q1402592 wd:Q42523 } ?i wikibase:sitelinks ?sl . FILTER(?sl >= 8) ?i rdfs:label ?name . FILTER(lang(?name) = "en") }`;
  for (let tries = 0; tries < 2; tries++) {
    const res = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(q)}`, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'CATCC-marine-builder/1.0 (offline data build)' } });
    if (res.ok) {
      return (await res.json()).results.bindings.map((b) => {
        const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.c.value);
        return { n: b.name.value, lon: +m[1], lat: +m[2], sl: +b.sl.value };
      });
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (depth >= 3) throw new Error('Wikidata keeps timing out');
  const [ms, mw] = [(s + n) / 2, (w + e) / 2];
  const parts = [];
  for (const bx of [[s, w, ms, mw], [s, mw, ms, e], [ms, w, n, mw], [ms, mw, n, e]]) parts.push(...(await wikidataIslands(bx, depth + 1)));
  return parts;
}

/** island names in a box from Wikidata (CC0); rank by sitelinks */
async function islandsIn(name, box, cacheDir) {
  const file = join(cacheDir, `${name}-islands.json`);
  let rows;
  if (existsSync(file)) rows = JSON.parse(readFileSync(file, 'utf8'));
  else {
    rows = await wikidataIslands(box);
    writeFileSync(file, JSON.stringify(rows));
  }
  const seen = new Set();
  return rows
    .sort((a, b) => b.sl - a.sl)
    .filter((x) => !seen.has(x.n) && seen.add(x.n))
    .map((x) => ({ n: x.n, lat: r4(x.lat), lon: r4(x.lon), r: x.sl >= 60 ? 0 : x.sl >= 25 ? 1 : x.sl >= 12 ? 2 : 3, k: 'island' }));
}
mkdirSync(cacheDir, { recursive: true });
const outDir = join(process.cwd(), 'public', 'catcc', 'marine');
mkdirSync(outDir, { recursive: true });

for (const [name, cfg] of Object.entries(THEATRES)) {
  if (only.length && !only.includes(name)) continue;
  const box = cfg.bbox;
  const land = [];
  const coast = [];
  for (const ring of readShp(shpPath, box)) {
    const c = clipRing(ring, box);
    if (!c) continue;
    const sr = simplify(c, COAST_TOL);
    if (sr.length < 4) continue;
    land.push(flat4(sr));
    // the shoreline is the simplified land ring itself (minus the cut along the box), so the two match
    for (const piece of coastOf(sr, box)) if (piece.length >= 2) coast.push(flat4(piece));
  }
  const grid = await fetchGrid(name, box, cfg.stride, cacheDir);
  const padded = padDeep(grid);
  // Every contour comes from the deep-padded grid, so it is a closed ring: the ring fills the region
  // shallower than d, and the same ring minus its run along the data border is the stroked line.
  // One geometry for both, so shading and line always coincide.
  const { lats, lons } = grid;
  const dl = Math.abs(lats[1] - lats[0]) * 0.3;
  const dn = Math.abs(lons[1] - lons[0]) * 0.3;
  const [la0, la1] = [Math.min(lats[0], lats[lats.length - 1]), Math.max(lats[0], lats[lats.length - 1])];
  const [lo0, lo1] = [Math.min(lons[0], lons[lons.length - 1]), Math.max(lons[0], lons[lons.length - 1])];
  const onBorder = (p) => p[1] < la0 + dl || p[1] > la1 - dl || p[0] < lo0 + dn || p[0] > lo1 - dn;
  const level = (d, minNm) => {
    const fill = [];
    const lines = [];
    const labels = [];
    for (const raw of contour(padded, -d)) {
      const ring = simplify(chaikin(raw), LINE_TOL);
      if (ring.length < 4 || lengthNm(ring) < 1) continue;
      fill.push(flat3(ring));
      const pts = ring.slice(0, -1);
      const k0 = pts.findIndex(onBorder);
      if (k0 < 0) {
        if (lengthNm(ring) >= minNm) {
          lines.push(flat3(ring));
          labels.push(...labelsOf(ring, true));
        }
        continue;
      }
      // rotate to start on a border point, then cut out the border runs
      const rot = [...pts.slice(k0), ...pts.slice(0, k0), pts[k0]];
      let cur = [];
      const flush = () => {
        if (cur.length >= 2 && lengthNm(cur) >= minNm) {
          lines.push(flat3(cur));
          labels.push(...labelsOf(cur, false));
        }
        cur = [];
      };
      for (const p of rot) {
        if (onBorder(p)) flush();
        else cur.push(p);
      }
      flush();
    }
    return { fill, lines, labels };
  };
  const depth = cfg.levels.map((d) => ({ d, ...level(d, d >= 1000 ? 5 : MIN_LINE_NM) })); // deep-water speckle dropped
  const nav = level(NAV_M, MIN_LINE_NM);
  const out = {
    v: 4,
    theatre: name,
    bbox: box,
    src: 'GSHHG 2.3.7 full-resolution shoreline (LGPL, Wessel & Smith); NOAA ETOPO 2022 15 arc-second relief; Natural Earth populated places; OurAirports',
    land,
    coast,
    nav: { d: NAV_M, fill: nav.fill },
    places: [...(await islandsIn(name, box, cacheDir)), ...PLACES.filter((x) => inBox(x, box))],
    airports: AIRPORTS.filter((x) => inBox(x, box)).map(({ ident, ...a }) => ({ ...a, rw: runwaysOf({ ident, ...a }) })),
    depth,
  };
  const json = JSON.stringify(out);
  writeFileSync(join(outDir, `${name}.json`), json);
  console.log(name, `${(json.length / 1024).toFixed(0)} KB`, 'places', out.places.length, 'airports', out.airports.length, 'land', land.length, 'coast', coast.length, depth.map((x) => `${x.d}m:${x.lines.length}/${x.labels.length}`).join(' '));
}
