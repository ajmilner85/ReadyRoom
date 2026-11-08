#!/usr/bin/env node
/**
 * Builds the CATCC marine layer data (coastline + bathymetry) per DCS theatre.
 *
 *   node scripts/catcc-marine.mjs <GSHHS_f_L1.shp> <cache-dir> [Theatre ...]
 *
 * Inputs:
 *  - GSHHG full-resolution shoreline, level 1 (land/ocean), shapefile (LGPL; Wessel & Smith,
 *    https://www.soest.hawaii.edu/pwessel/gshhg/)
 *  - NOAA ETOPO 2022 relief (15 arc-second grid), fetched per theatre box from the NOAA CoastWatch
 *    ERDDAP server (public domain); responses are cached in <cache-dir>
 *
 * Output: public/catcc/marine/<Theatre>.json (format v2)
 *   land:  rings (even-odd fill)
 *   coast: shoreline polylines (the cut along the data box is left out)
 *   nav:   { d, fill } water shallower than d, i.e. not navigable by a carrier
 *   depth: [{ d, lines, fill, labels }] contour lines at d metres, the closed region shallower than d
 *          (even-odd fill), and label anchors [lon, lat, lon2, lat2] (a point on the line and one
 *          about 1 NM further along, for the label angle)
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
const COAST_TOL = 0.0012; // deg, ~0.07 NM
const LINE_TOL = 0.002; // ~0.12 NM
const FILL_TOL = 0.003;
const MIN_LINE_NM = 2;
const LABEL_EVERY_NM = 30;
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

/** label anchors every LABEL_EVERY_NM along a line (the first half that far in, or a third of a short line) */
function labelsOf(l) {
  const L = lengthNm(l);
  if (L < 10) return [];
  const want = [];
  for (let d = Math.min(LABEL_EVERY_NM / 2, L / 3); d < L - 2; d += LABEL_EVERY_NM) want.push(d);
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

const [, , shpPath, cacheDir, ...only] = process.argv;
if (!shpPath || !cacheDir) {
  console.error('usage: node scripts/catcc-marine.mjs <GSHHS_f_L1.shp> <cache-dir> [Theatre ...]');
  process.exit(1);
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
    for (const piece of coastOf(c, box)) {
      const sp = simplify(piece, COAST_TOL);
      if (sp.length >= 2 && lengthNm(sp) > 0.1) coast.push(flat4(sp));
    }
  }
  const grid = await fetchGrid(name, box, cfg.stride, cacheDir);
  const padded = padDeep(grid);
  const fillOf = (d) =>
    contour(padded, -d)
      .map((l) => simplify(chaikin(l), FILL_TOL))
      .filter((l) => l.length >= 4 && lengthNm(l) >= 1)
      .map(flat3);
  const depth = cfg.levels.map((d) => {
    const lines = contour(grid, -d)
      .map((l) => simplify(chaikin(l), LINE_TOL))
      .filter((l) => l.length >= 3 && lengthNm(l) >= (d >= 1000 ? 5 : MIN_LINE_NM)); // deep-water speckle dropped
    return { d, lines: lines.map(flat3), fill: fillOf(d), labels: lines.flatMap(labelsOf) };
  });
  const out = {
    v: 2,
    theatre: name,
    bbox: box,
    src: 'GSHHG 2.3.7 full-resolution shoreline (LGPL, Wessel & Smith); NOAA ETOPO 2022 15 arc-second relief',
    land,
    coast,
    nav: { d: NAV_M, fill: fillOf(NAV_M) },
    depth,
  };
  const json = JSON.stringify(out);
  writeFileSync(join(outDir, `${name}.json`), json);
  console.log(name, `${(json.length / 1024).toFixed(0)} KB`, 'land', land.length, 'coast', coast.length, depth.map((x) => `${x.d}m:${x.lines.length}/${x.labels.length}`).join(' '));
}
