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
  /** assigned altitude a descending aircraft will not go below (marshal level), ft */
  floorFt?: number;
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
  /** climb/descent is extrapolated for at most this long, then the aircraft is assumed level */
  vertCapS?: number;
  /** vertical speeds below this are treated as level (noise) */
  minVsFpm?: number;
  /** final bearing, to recognise aircraft on final */
  fb?: number;
}

/**
 * A conflict is predicted when, within the look-ahead window, BOTH the lateral and vertical
 * standards are lost at CPA. Positions are scope coordinates relative to the focus carrier.
 */
export function predictConflict(A: Kinematic, B: Kinematic, opts: ConflictOptions = {}): (Cpa & { latStd: number }) | null {
  const look = opts.lookAheadS ?? 120;
  const cap = opts.vertCapS ?? 30;
  const minVs = opts.minVsFpm ?? 500;
  const c = cpa({ ...A, vsFpm: 0 }, { ...B, vsFpm: 0 }, look);
  const altAt = (k: Kinematic, t: number) => {
    const vs = Math.abs(k.vsFpm ?? 0) < minVs ? 0 : (k.vsFpm ?? 0);
    let alt = k.altFt + (vs * Math.min(t, cap)) / 60;
    if (vs < 0 && k.floorFt !== undefined) alt = Math.max(alt, Math.min(k.floorFt, k.altFt));
    return alt;
  };
  c.vertFt = Math.abs(altAt(A, c.tS) - altAt(B, c.tS));
  const range = Math.min(Math.hypot(...A.p), Math.hypot(...B.p));
  const onFinal =
    opts.fb !== undefined && [A, B].every((k) => angDiff(k.crs, opts.fb!) < 15 && Math.hypot(...k.p) < 6);
  const latStd = lateralStandardNm(range, onFinal);
  if (c.latNm < latStd && c.vertFt < VERTICAL_STANDARD_FT) return { ...c, latStd };
  return null;
}

// ---------------------------------------------------------------- marshal route with hold entry

/**
 * Turn-rate-limited path integrator: every manoeuvre is flown at the bank-angle turn radius, so
 * joins between legs are naturally filleted. Step 0.05 NM.
 */
const DS = 0.05;

interface FlyState {
  p: Pt;
  h: number;
  path: Pt[];
  dist: number;
}

const norm = (a: number) => ((a % 360) + 360) % 360;

function stepFwd(s: FlyState, turnDeg: number): void {
  s.h = norm(s.h + turnDeg);
  const d = dir(s.h);
  s.p = [s.p[0] + d[0] * DS, s.p[1] + d[1] * DS];
  s.path.push(s.p);
  s.dist += DS;
}

/** Turn in a given sense (+1 right, -1 left) until on the target heading. */
function turnTo(s: FlyState, target: number, sense: 1 | -1, R: number): void {
  const maxT = DS / R / D2R;
  for (let i = 0; i < 4000; i++) {
    const rem = sense > 0 ? norm(target - s.h) : norm(s.h - target);
    if (rem < 0.5 || rem > 359.5) break;
    stepFwd(s, sense * Math.min(maxT, rem));
  }
  s.h = norm(target);
}

/** Turn the shorter way onto a heading. */
function turnShort(s: FlyState, target: number, R: number): void {
  turnTo(s, target, signedDiff(target, s.h) >= 0 ? 1 : -1, R);
}

function straight(s: FlyState, nm: number): void {
  for (let i = 0; i < nm / DS; i++) stepFwd(s, 0);
}

/** Pure pursuit to a point (turn toward it at the turn-rate limit, then straight). */
function pursue(s: FlyState, T: Pt, R: number): void {
  const maxT = DS / R / D2R;
  let turned = 0;
  for (let i = 0; i < 20000; i++) {
    const rg = dist(s.p, T);
    if (rg < DS * 1.5) {
      s.path.push([T[0], T[1]]);
      s.dist += rg;
      s.p = [T[0], T[1]];
      return;
    }
    const df = signedDiff(bearingTo(s.p, T), s.h);
    // if circling the point inside the turn radius, fly straight to open out
    const t = turned > 400 ? 0 : Math.max(-maxT, Math.min(maxT, df));
    turned += Math.abs(t);
    stepFwd(s, t);
  }
}

/**
 * Track a course line into a fix (cross-track steering, intercept angle <= 45°, turn-rate
 * limited). Ends at the fix, established on the course.
 */
function trackTo(s: FlyState, fix: Pt, course: number, R: number): void {
  const maxT = DS / R / D2R;
  const u = dir(course);
  const look = Math.max(0.5, 0.6 * R);
  for (let i = 0; i < 20000; i++) {
    const rel: Pt = [s.p[0] - fix[0], s.p[1] - fix[1]];
    const remaining = -(rel[0] * u[0] + rel[1] * u[1]);
    if (remaining <= DS) {
      s.path.push([fix[0], fix[1]]);
      s.dist += Math.max(0, remaining);
      s.p = [fix[0], fix[1]];
      s.h = course;
      return;
    }
    const xte = u[0] * rel[1] - u[1] * rel[0]; // + = right of course
    const desired = course - Math.max(-45, Math.min(45, Math.atan(xte / look) / D2R));
    const df = signedDiff(desired, s.h);
    stepFwd(s, Math.max(-maxT, Math.min(maxT, df)));
  }
}

export type HoldEntry = 'straight-in' | 'direct' | 'teardrop' | 'parallel';

export interface MarshalRoute {
  path: Pt[];
  /** NM flown until established inbound at the fix */
  dist: number;
  /** NM flown to reach the fix (at transit speed) and in the entry manoeuvre (at hold speed) */
  transitNm: number;
  entryNm: number;
  /** index in `path` where the entry manoeuvre starts (the fix crossing) */
  entryIdx: number;
  entry: HoldEntry;
  fix: Pt;
}

/** 250 KIAS hold: 1-minute legs (4.2 NM), 2-minute 180° turns (R 2.65 NM), as drawn on the scope. */
const HOLD = { legNm: 4.2, turnNm: 2.65 };

/**
 * Join the inbound course to the fix: intercept at ≤ 45° (30° when a new intercept is needed),
 * lead-turn onto the course, then straight to the fix.
 */
function joinInbound(s: FlyState, fix: Pt, C: number, R: number): boolean {
  const u = dir(C);
  const xteOf = () => u[0] * (s.p[1] - fix[1]) - u[1] * (s.p[0] - fix[0]); // + = right of course
  for (let i = 0; i < 3; i++) {
    const xte = xteOf();
    if (Math.abs(xte) < 0.03) break;
    const toward = xte > 0 ? -1 : 1; // turn left when right of course
    const conv = signedDiff(s.h, C) * toward; // > 0 when already converging
    if (!(conv >= 15 && conv <= 60)) turnShort(s, norm(C + toward * 30), R);
    const x2 = xteOf();
    if (Math.sign(x2) !== Math.sign(xte) || Math.abs(x2) < 0.03) break; // crossed in the turn
    const a = angDiff(s.h, C) * D2R;
    const run = Math.abs(x2) / Math.sin(a) - R * Math.tan(a / 2);
    if (run > 0) straight(s, run);
    turnShort(s, C, R);
  }
  const remaining = -((s.p[0] - fix[0]) * u[0] + (s.p[1] - fix[1]) * u[1]);
  const ok = remaining > 0.3 && Math.abs(xteOf()) < 0.06 && angDiff(s.h, C) < 3;
  if (remaining > DS) straight(s, remaining - DS);
  s.dist += dist(s.p, fix);
  s.path.push([fix[0], fix[1]]);
  s.p = [fix[0], fix[1]];
  s.h = C;
  return ok;
}

/**
 * Route from an aircraft to a marshal fix, arriving established on the inbound course (handoff
 * §5.6 backlog). The transit to the fix is flown at the aircraft's speed; the entry is a
 * textbook direct / parallel / offset (teardrop) entry chosen by the standard sectors (the 70°
 * line: direct 180°, offset 70°, parallel 110°; mirrored for left-hand patterns), flown with the
 * hold's own turn radius and 1-minute legs:
 *   direct    turn in the hold direction to outbound, outbound to 1 min past abeam, turn inbound
 *   parallel  turn to outbound on the non-hold side, 1 min, turn > 180° toward the hold side to
 *             intercept the inbound course at 45°
 *   offset    turn 30° into the hold side from outbound, 1 min, turn in the hold direction to inbound
 */
export function marshalRoute(p0: Pt, h0: number, tasKt: number, radial: number, fixNm: number, hand: 'left' | 'right', hold = HOLD): MarshalRoute {
  const Rt = turnRadiusNm(tasKt);
  const Rh = hold.turnNm;
  const Lh = hold.legNm;
  const C = norm(radial + 180); // inbound course (toward the ship)
  const O = norm(radial); // outbound heading
  const sense: 1 | -1 = hand === 'right' ? 1 : -1;
  const fix: Pt = [fixNm * Math.sin(radial * D2R), -fixNm * Math.cos(radial * D2R)];
  const s: FlyState = { p: [p0[0], p0[1]], h: norm(h0), path: [[p0[0], p0[1]]], dist: 0 };

  // Straight-in: already behind the fix and roughly lined up with the inbound course.
  const u = dir(C);
  const behind = -((p0[0] - fix[0]) * u[0] + (p0[1] - fix[1]) * u[1]);
  if (behind > 2 * Rt && angDiff(bearingTo(p0, fix), C) < 50 && angDiff(h0, C) < 100) {
    trackTo(s, fix, C, Rt);
    return { path: s.path, dist: s.dist, transitNm: s.dist, entryNm: 0, entryIdx: s.path.length - 1, entry: 'straight-in', fix };
  }

  pursue(s, fix, Rt);
  const transitNm = s.dist;
  const entryIdx = s.path.length - 1;
  const f = norm(sense * signedDiff(s.h, C) + 180); // 0..360 in the hold's own frame
  const out = dir(O);
  const entry: HoldEntry = f >= 70 && f <= 250 ? 'direct' : f < 70 ? 'teardrop' : 'parallel';
  const fly = (leg: number): { st: FlyState; ok: boolean } => {
    const st: FlyState = { p: [s.p[0], s.p[1]], h: s.h, path: [...s.path], dist: s.dist };
    if (entry === 'direct') {
      turnTo(st, O, sense, Rh);
      const pastAbeam = (st.p[0] - fix[0]) * out[0] + (st.p[1] - fix[1]) * out[1];
      straight(st, Math.max(0.5, leg - pastAbeam));
      turnTo(st, C, sense, Rh);
    } else if (entry === 'teardrop') {
      turnShort(st, norm(O - sense * 30), Rh);
      straight(st, leg);
      turnTo(st, C, sense, Rh);
    } else {
      turnShort(st, O, Rh);
      straight(st, leg);
      turnTo(st, norm(C - sense * 45), (-sense) as 1 | -1, Rh);
    }
    return { st, ok: joinInbound(st, fix, C, Rh) };
  };
  // The timed leg is 1 minute; extend it (as a pilot would) only if needed to roll out established.
  let res = fly(Lh);
  for (let extra = 1; !res.ok && extra <= 8; extra++) res = fly(Lh + extra);
  Object.assign(s, res.st);
  return { path: s.path, dist: s.dist, transitNm, entryNm: s.dist - transitNm, entryIdx, entry, fix };
}
