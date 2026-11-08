/**
 * Coordination line between two carriers' airspace.
 *
 * A line is stored relative to a reference carrier as { brg, off }: `brg` is the line's
 * direction (0–179°) and `off` the perpendicular distance (NM) from the reference ship to the
 * line, measured toward the other carrier.
 *
 * The automatic line is the maximum-margin separator between each carrier's protected points
 * (ship plus its marshal holds): every bearing is tried, the line placed midway between the two
 * point sets along its normal, and the widest gap wins (ties lean toward the ships' mean course).
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

export function autoCoordLine(refPts: Pt[], otherPts: Pt[], ref: Pt, other: Pt, meanCourse?: number): CoordSetting {
  let best: { s: CoordSetting; score: number } | null = null;
  for (let b = 0; b < 180; b++) {
    let n = dir(b + 90);
    if (dot(n, sub(other, ref)) < 0) n = mul(n, -1);
    const pa = refPts.map((q) => dot(sub(q, ref), n));
    const pb = otherPts.map((q) => dot(sub(q, ref), n));
    const gap = Math.min(...pb) - Math.max(...pa);
    const off = (Math.min(...pb) + Math.max(...pa)) / 2;
    const lean = meanCourse === undefined ? 0 : angDiff(b, meanCourse) > 90 ? angDiff(b + 180, meanCourse) : angDiff(b, meanCourse);
    const score = gap - lean * 0.002; // lean only breaks near-ties
    if (!best || score > best.score) best = { s: { brg: b, off }, score };
  }
  return best!.s;
}
