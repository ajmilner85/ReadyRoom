#!/usr/bin/env node
/**
 * Builds the CATCC marine layer data (coastline + bathymetry contours) per DCS theatre.
 *
 *   node scripts/catcc-marine.mjs <natural-earth-geojson-dir> [Theatre ...]
 *
 * Inputs (both public domain):
 *  - Natural Earth 10m land + minor islands GeoJSON (github.com/nvkelso/natural-earth-vector, geojson/)
 *  - NOAA ETOPO1 relief (1 arc-minute), fetched from the NOAA CoastWatch ERDDAP server per theatre box
 *
 * Output: public/catcc/marine/<Theatre>.json
 *   { v, theatre, bbox: [s, w, n, e], land: number[][], coast: number[][], depth: [{ d, lines: number[][] }] }
 *   each ring/line is a flat [lon, lat, lon, lat, ...] array (3 dp). `land` rings fill with even-odd;
 *   `coast` is the shoreline only (the cut along the data box is left out).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// [south, west, north, east], depth levels (m), ETOPO stride (arc-minutes)
const THEATRES = {
  PersianGulf: { bbox: [22.5, 50.5, 31, 60.5], levels: [20, 50, 200, 1000, 2000], stride: 1 },
  Caucasus: { bbox: [40.5, 35.5, 46.5, 46], levels: [200, 1000, 2000], stride: 1 },
  Syria: { bbox: [30.5, 29.5, 38.5, 39.5], levels: [200, 1000, 2000], stride: 1 },
  SinaiMap: { bbox: [26, 28.5, 33.5, 36.5], levels: [50, 200, 1000], stride: 1 },
  MarianaIslands: { bbox: [10.5, 140.5, 22.5, 149.5], levels: [200, 1000, 3000, 6000], stride: 2 },
  Falklands: { bbox: [-58, -72, -46, -50], levels: [200, 1000, 3000], stride: 2 },
  Kola: { bbox: [64, 20, 72.5, 46], levels: [100, 200, 300], stride: 2 },
  Normandy: { bbox: [48, -4, 52, 3], levels: [20, 50], stride: 1 },
  TheChannel: { bbox: [49.5, -1.5, 52.5, 3.5], levels: [20, 50], stride: 1 },
  Iraq: { bbox: [28.5, 46, 31.5, 50.5], levels: [10, 20], stride: 1 },
};

const SIMPLIFY_DEG = 0.004; // ~0.24 NM
const MIN_LINE_NM = 3;
const r3 = (n) => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------- ETOPO grid

async function fetchGrid(bbox, stride) {
  const [s, w, n, e] = bbox;
  const url = `https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.csv?altitude%5B(${s}):${stride}:(${n})%5D%5B(${w}):${stride}:(${e})%5D`;
  let res;
  for (let tries = 0; ; tries++) {
    res = await fetch(url);
    if (res.ok || tries >= 4) break;
    await new Promise((r) => setTimeout(r, 5000 * (tries + 1))); // the ERDDAP server sheds load with 503s
  }
  if (!res.ok) throw new Error(`ETOPO ${res.status}`);
  const rows = (await res.text()).trim().split('\n').slice(2);
  const lats = [];
  const lons = [];
  const latIdx = new Map();
  const lonIdx = new Map();
  const vals = [];
  for (const r of rows) {
    const [la, lo, al] = r.split(',').map(Number);
    if (!latIdx.has(la)) latIdx.set(la, lats.push(la) - 1);
    if (!lonIdx.has(lo)) lonIdx.set(lo, lons.push(lo) - 1);
    vals.push([latIdx.get(la), lonIdx.get(lo), al]);
  }
  const z = Array.from({ length: lats.length }, () => new Float32Array(lons.length));
  for (const [i, j, al] of vals) z[i][j] = al;
  return { lats, lons, z };
}

// ---------------------------------------------------------------- marching squares

function contour({ lats, lons, z }, t) {
  const ni = lats.length;
  const nj = lons.length;
  // edge ids: horizontal edge (i, j)-(i, j+1) = 2*(i*nj+j); vertical (i, j)-(i+1, j) = 2*(i*nj+j)+1
  const pt = new Map();
  const edgePt = (id) => {
    let p = pt.get(id);
    if (p) return p;
    const k = id >> 1;
    const i = Math.floor(k / nj);
    const j = k % nj;
    const [i2, j2] = id & 1 ? [i + 1, j] : [i, j + 1];
    const a = z[i][j];
    const b = z[i2][j2];
    const f = (t - a) / (b - a);
    p = [lons[j] + (lons[j2] - lons[j]) * f, lats[i] + (lats[i2] - lats[i]) * f];
    pt.set(id, p);
    return p;
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
  // link segments into polylines
  const adj = new Map();
  segs.forEach((s, k) => {
    for (const e of s) {
      if (!adj.has(e)) adj.set(e, []);
      adj.get(e).push(k);
    }
  });
  const used = new Uint8Array(segs.length);
  const lines = [];
  for (let k0 = 0; k0 < segs.length; k0++) {
    if (used[k0]) continue;
    used[k0] = 1;
    const chain = [segs[k0][0], segs[k0][1]];
    for (const dirn of [1, -1]) {
      for (;;) {
        const end = dirn === 1 ? chain[chain.length - 1] : chain[0];
        const next = (adj.get(end) ?? []).find((k) => !used[k]);
        if (next === undefined) break;
        used[next] = 1;
        const s = segs[next];
        const o = s[0] === end ? s[1] : s[0];
        if (dirn === 1) chain.push(o);
        else chain.unshift(o);
      }
    }
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

function chaikin(l) {
  if (l.length < 3) return l;
  const closed = l[0][0] === l[l.length - 1][0] && l[0][1] === l[l.length - 1][1];
  const out = closed ? [] : [l[0]];
  for (let i = 0; i < l.length - 1; i++) {
    const [p, q] = [l[i], l[i + 1]];
    out.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]], [0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
  }
  if (closed) out.push(out[0]);
  else out.push(l[l.length - 1]);
  return out;
}

function simplify(l, tol) {
  if (l.length < 3) return l;
  if (l[0][0] === l[l.length - 1][0] && l[0][1] === l[l.length - 1][1] && l.length > 4) {
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

/** Sutherland-Hodgman clip of a closed ring to a box; also tags which output edges lie on the box. */
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
  // a ring with no box edges: one closed piece
  return pieces;
}

const flat = (l) => l.flatMap((p) => [r3(p[0]), r3(p[1])]);

// ---------------------------------------------------------------- main

const [, , neDir, ...only] = process.argv;
if (!neDir) {
  console.error('usage: node scripts/catcc-marine.mjs <natural-earth-geojson-dir> [Theatre ...]');
  process.exit(1);
}
const polys = [];
for (const f of ['ne_10m_land.geojson', 'ne_10m_minor_islands.geojson']) {
  const gj = JSON.parse(readFileSync(join(neDir, f), 'utf8'));
  for (const ft of gj.features) {
    const g = ft.geometry;
    if (!g) continue;
    for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []) polys.push(poly);
  }
}
const outDir = join(process.cwd(), 'public', 'catcc', 'marine');
mkdirSync(outDir, { recursive: true });

for (const [name, cfg] of Object.entries(THEATRES)) {
  if (only.length && !only.includes(name)) continue;
  const box = cfg.bbox;
  const land = [];
  const coast = [];
  for (const poly of polys) {
    for (const ring of poly) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [x, y] of ring) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      if (x1 < box[1] || x0 > box[3] || y1 < box[0] || y0 > box[2]) continue;
      const c = clipRing(ring, box);
      if (!c) continue;
      const sr = simplify(c, SIMPLIFY_DEG * 0.75);
      if (sr.length < 4) continue;
      land.push(flat(sr));
      for (const piece of coastOf(c, box)) {
        const sp = simplify(piece, SIMPLIFY_DEG * 0.75);
        if (sp.length >= 2 && lengthNm(sp) > 0.3) coast.push(flat(sp));
      }
    }
  }
  const grid = await fetchGrid(box, cfg.stride);
  const depth = cfg.levels.map((d) => ({
    d,
    lines: contour(grid, -d)
      .map((l) => simplify(chaikin(l), SIMPLIFY_DEG))
      .filter((l) => l.length >= 3 && lengthNm(l) >= MIN_LINE_NM)
      .map(flat),
  }));
  const out = { v: 1, theatre: name, bbox: box, src: 'Natural Earth 10m land; NOAA ETOPO1', land, coast, depth };
  const json = JSON.stringify(out);
  writeFileSync(join(outDir, `${name}.json`), json);
  console.log(name, `${(json.length / 1024).toFixed(0)} KB`, 'land', land.length, 'coast', coast.length, depth.map((x) => `${x.d}m:${x.lines.length}`).join(' '));
}
