/**
 * Scope-plane vector helpers. Scope coordinates are nautical miles centred on the focus
 * carrier, +x east, +y SOUTH (SVG convention; north is -y). Bearings are degrees true.
 */
import { norm360 } from '../geo.ts';

export { norm360 };
export type Pt = [number, number];

export const D2R = Math.PI / 180;

/** Point at bearing b (deg) and range r (NM) from the origin. */
export const P = (b: number, r: number): Pt => [r * Math.sin(b * D2R), -r * Math.cos(b * D2R)];
/** Unit vector for heading h (deg). */
export const dir = (h: number): Pt => [Math.sin(h * D2R), -Math.cos(h * D2R)];
export const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
export const dot = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];
/** z-component of a×b. In scope coordinates (y down) positive means b is clockwise (right) of a. */
export const cross = (a: Pt, b: Pt): number => a[0] * b[1] - a[1] * b[0];
export const len = (a: Pt): number => Math.hypot(a[0], a[1]);
export const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Rotate clockwise by b degrees (a bearing rotation in scope coordinates). */
export const rot = (q: Pt, b: number): Pt => {
  const c = Math.cos(b * D2R);
  const s = Math.sin(b * D2R);
  return [q[0] * c - q[1] * s, q[0] * s + q[1] * c];
};
/** Signed difference a-b in (-180, 180]. */
export const signedDiff = (a: number, b: number): number => ((((a - b) % 360) + 540) % 360) - 180;
/** Absolute angular difference, 0..180. */
export const angDiff = (a: number, b: number): number => Math.abs(signedDiff(a, b));
/** Bearing (deg true) of a point from the origin. */
export const bearingOf = (q: Pt): number => norm360(Math.atan2(q[0], -q[1]) / D2R);
/** Bearing from a to b. */
export const bearingTo = (a: Pt, b: Pt): number => bearingOf(sub(b, a));

/** Total length of a polyline. */
export function pathLength(path: Pt[]): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += dist(path[i - 1], path[i]);
  return s;
}

/** Sample an arc around centre c from point a to point b, going the short way (fillets). */
export function shortArc(c: Pt, a: Pt, b: Pt, n = 12): Pt[] {
  const r = dist(c, a);
  const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]);
  let da = Math.atan2(b[1] - c[1], b[0] - c[0]) - a0;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  const out: Pt[] = [];
  for (let i = 1; i <= n; i++) {
    const t = a0 + (da * i) / n;
    out.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]);
  }
  return out;
}

/**
 * Fillet (constant-radius turn) at corner K from inbound direction dIn to outbound dOut.
 * Returns the tangent points and the sampled arc (excluding Fa, including Fb).
 */
export function fillet(K: Pt, dIn: Pt, dOut: Pt, R: number, n = 12): { Fa: Pt; Fb: Pt; arc: Pt[]; e: number } {
  const th = Math.acos(Math.max(-1, Math.min(1, dot(dIn, dOut))));
  const e = R * Math.tan(th / 2);
  const Fa = add(K, mul(dIn, -e));
  const Fb = add(K, mul(dOut, e));
  if (th < 1e-6) return { Fa, Fb, arc: [Fb], e };
  const right: Pt = [-dIn[1], dIn[0]];
  const C = add(Fa, mul(right, cross(dIn, dOut) > 0 ? R : -R));
  return { Fa, Fb, arc: shortArc(C, Fa, Fb, n), e };
}
