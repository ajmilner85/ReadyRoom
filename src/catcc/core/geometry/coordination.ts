/**
 * Coordination line between two carriers' airspace.
 *
 * A line is stored relative to a reference carrier as { brg, off }: `brg` is the line's
 * direction (0–179°) and `off` the perpendicular distance (NM) from the reference ship to the
 * line, measured toward the other carrier.
 *
 * The automatic line separates two sets of protected areas (each ship, and each of its marshal
 * holds as a whole). Every bearing is tried. Where a clean separator exists the line goes midway
 * across the widest gap. Where none does (holds of the two carriers overlap), the line goes where
 * it cuts least into the areas, measured per area as its deepest point on the wrong side plus a
 * margin, with ships weighted far above holds so a ship is never crossed to spare a hold.
 * Near-ties lean toward the ships' mean course.
 */
import { add, angDiff, dir, dot, mul, sub, type Pt } from './vec.ts';

export interface CoordSetting {
  brg: number;
  off: number;
}

export interface CoordGeom extends CoordSetting {
  /** foot of the perpendicular from the reference ship, a point on the line */
  p0: Pt;
  /** unit direction along the line */
  u: Pt;
  /** unit normal pointing from the reference carrier's side to the other's */
  n: Pt;
  auto: boolean;
}

const norm180 = (a: number) => ((a % 180) + 180) % 180;

/** Line geometry from a setting, for a reference ship at `ref` and the other ship at `other`. */
export function coordGeom(s: CoordSetting, ref: Pt, other: Pt, auto = false): CoordGeom {
  const u = dir(s.brg);
  let n = dir(s.brg + 90);
  if (dot(n, sub(other, ref)) < 0) n = mul(n, -1);
  return { brg: norm180(s.brg), off: s.off, p0: add(ref, mul(n, s.off)), u, n, auto };
}

/** Express a line given in another carrier's frame in the reference carrier's frame. */
export function reframe(g: CoordGeom, ref: Pt, other: Pt): CoordSetting {
  let n = dir(g.brg + 90);
  if (dot(n, sub(other, ref)) < 0) n = mul(n, -1);
  return { brg: g.brg, off: dot(sub(g.p0, ref), n) };
}

/** Signed distance from the line (negative on the reference carrier's side). */
export const sideOf = (q: Pt, g: CoordGeom): number => dot(sub(q, g.p0), g.n);

export interface CoordArea {
  pts: Pt[];
  /** a ship (heavily weighted, wider margin) rather than a hold */
  ship?: boolean;
}

const SHIP = { w: 25, m: 5 };
const HOLD = { w: 1, m: 2 };

export function autoCoordLine(refAreas: CoordArea[], otherAreas: CoordArea[], ref: Pt, other: Pt, meanCourse?: number): CoordSetting {
  let best: { s: CoordSetting; score: number } | null = null;
  for (let b = 0; b < 180; b++) {
    let n = dir(b + 90);
    if (dot(n, sub(other, ref)) < 0) n = mul(n, -1);
    const pr = (q: Pt) => dot(sub(q, ref), n);
    // per area: the extreme projection toward the other side, its weight and margin
    const A = refAreas.map((ar) => ({ e: Math.max(...ar.pts.map(pr)), ...(ar.ship ? SHIP : HOLD) }));
    const B = otherAreas.map((ar) => ({ e: Math.min(...ar.pts.map(pr)), ...(ar.ship ? SHIP : HOLD) }));
    // cost(o): how far the line at offset o cuts into the areas' margins (weighted). It is convex
    // piecewise linear, so its minimum lies on a breakpoint.
    const cost = (o: number) => A.reduce((t, x) => t + x.w * Math.max(0, x.e + x.m - o), 0) + B.reduce((t, x) => t + x.w * Math.max(0, o - x.e + x.m), 0);
    const lo = Math.max(...A.map((x) => x.e + x.m));
    const hi = Math.min(...B.map((x) => x.e - x.m));
    let s: CoordSetting;
    let score: number;
    if (hi >= lo) {
      // clean separation with margins to spare: midway across the widest clear band
      s = { brg: b, off: (lo + hi) / 2 };
      score = 1e6 + (hi - lo);
    } else {
      const bps = [...A.map((x) => x.e + x.m), ...B.map((x) => x.e - x.m)].sort((p, q) => p - q);
      let c = Infinity;
      for (const o of bps) c = Math.min(c, cost(o));
      const flat = bps.filter((o) => cost(o) <= c + 1e-9);
      s = { brg: b, off: (flat[0] + flat[flat.length - 1]) / 2 };
      score = -c;
    }
    const lean = meanCourse === undefined ? 0 : angDiff(b, meanCourse) > 90 ? angDiff(b + 180, meanCourse) : angDiff(b, meanCourse);
    score -= lean * 0.002; // lean only breaks near-ties
    if (!best || score > best.score) best = { s, score };
  }
  return best!.s;
}
