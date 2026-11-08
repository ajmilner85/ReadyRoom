/**
 * Turn-then-direct flight model for the hooked-aircraft tools (handoff §5.6), plus EAT and CPA.
 */
import { D2R, angDiff, bearingTo, dir, dist, signedDiff, type Pt } from './vec.ts';

/** Turn radius in NM for a true airspeed (kt) and bank angle: R(ft) = V² / (11.26 tan φ). */
export function turnRadiusNm(tasKt: number, bankDeg = 30): number {
  return (tasKt * tasKt) / (11.26 * Math.tan(bankDeg * D2R)) / 6076.12;
}

export interface FlyResult {
  path: Pt[];
  /** distance flown, NM */
  dist: number;
  /** heading after the turn (deg true) */
  hdg: number;
}

/**
 * Fly from p0 on heading h0 to target T: turn the shortest way at radius R until pointing at
 * T, then straight. Integrated in 0.1 NM steps (as in the mockup).
 */
export function fly(p0: Pt, h0: number, T: Pt, R: number): FlyResult {
  const path: Pt[] = [[p0[0], p0[1]]];
  let p: Pt = [p0[0], p0[1]];
  let h = h0;
  let turned = 0;
  let d = 0;
  const ds = 0.1;
  for (let i = 0; i < 6000; i++) {
    const rg = dist(p, T);
    if (rg < 0.05) break;
    const b = bearingTo(p, T);
    const df = signedDiff(b, h);
    if (Math.abs(df) < 0.5 || turned > 360) {
      path.push([T[0], T[1]]);
      d += rg;
      h = b;
      break;
    }
    const st = Math.min(Math.abs(df), ds / R / D2R);
    h += Math.sign(df) * st;
    turned += st;
    const dd = dir(h);
    p = [p[0] + dd[0] * ds, p[1] + dd[1] * ds];
    d += ds;
    path.push([p[0], p[1]]);
  }
  return { path, dist: d, hdg: ((h % 360) + 360) % 360 };
}

/**
 * Expected approach time: fix arrival time rounded up to the next whole minute, and at least
 * one minute after the previous EAT in the same stack. Times are seconds (any epoch).
 */
export function eat(fixTimeS: number, prevEatS?: number): number {
  const rounded = Math.ceil(fixTimeS / 60) * 60;
  return prevEatS === undefined ? rounded : Math.max(rounded, prevEatS + 60);
}

// ---------------------------------------------------------------- conflicts (§5.4)

export interface Kinematic {
  /** scope position, NM */
  p: Pt;
  /** course over ground (deg true) and groundspeed (kt) */
  crs: number;
  gs: number;
  altFt: number;
  /** vertical speed, ft/min */
  vsFpm?: number;
}

export interface Cpa {
  /** seconds from now to CPA (0 if diverging) */
  tS: number;
  /** lateral separation at CPA, NM */
  latNm: number;
  /** vertical separation at CPA, ft */
  vertFt: number;
  /** positions at CPA */
  a: Pt;
  b: Pt;
}

/** Closest point of approach, projecting each aircraft along its own course and speed. */
export function cpa(A: Kinematic, B: Kinematic, maxS = 600): Cpa {
  const va = dir(A.crs).map((c) => (c * A.gs) / 3600) as Pt; // NM/s
  const vb = dir(B.crs).map((c) => (c * B.gs) / 3600) as Pt;
  const dp: Pt = [B.p[0] - A.p[0], B.p[1] - A.p[1]];
  const dv: Pt = [vb[0] - va[0], vb[1] - va[1]];
  const vv = dv[0] * dv[0] + dv[1] * dv[1];
  let t = vv < 1e-12 ? 0 : -(dp[0] * dv[0] + dp[1] * dv[1]) / vv;
  t = Math.max(0, Math.min(maxS, t));
  const a: Pt = [A.p[0] + va[0] * t, A.p[1] + va[1] * t];
  const b: Pt = [B.p[0] + vb[0] * t, B.p[1] + vb[1] * t];
  const altA = A.altFt + ((A.vsFpm ?? 0) * t) / 60;
  const altB = B.altFt + ((B.vsFpm ?? 0) * t) / 60;
  return { tS: t, latNm: dist(a, b), vertFt: Math.abs(altA - altB), a, b };
}

/**
 * Lateral standard (CV NATOPS §4.3, §6.4.1.7) for a pair, by the nearer aircraft's range from
 * the carrier: 5 NM beyond 50 NM, 3 NM inside 50, 2 NM on approach inside 12, 1.5 NM on final
 * inside 5 (`onFinal` = aligned with the final bearing).
 */
export function lateralStandardNm(rangeNm: number, onFinal = false): number {
  if (rangeNm > 50) return 5;
  if (onFinal && rangeNm <= 5) return 1.5;
  if (rangeNm <= 12) return 2;
  return 3;
}

export const VERTICAL_STANDARD_FT = 1000;

export interface ConflictOptions {
  lookAheadS?: number;
  /** final bearing, to recognise aircraft on final */
  fb?: number;
}

/**
 * A conflict is predicted when, within the look-ahead window, BOTH the lateral and vertical
 * standards are lost at CPA. Positions are scope coordinates relative to the focus carrier.
 */
export function predictConflict(A: Kinematic, B: Kinematic, opts: ConflictOptions = {}): (Cpa & { latStd: number }) | null {
  const look = opts.lookAheadS ?? 120;
  const c = cpa(A, B, look);
  const range = Math.min(Math.hypot(...A.p), Math.hypot(...B.p));
  const onFinal =
    opts.fb !== undefined && [A, B].every((k) => angDiff(k.crs, opts.fb!) < 15 && Math.hypot(...k.p) < 6);
  const latStd = lateralStandardNm(range, onFinal);
  if (c.latNm < latStd && c.vertFt < VERTICAL_STANDARD_FT) return { ...c, latStd };
  return null;
}
