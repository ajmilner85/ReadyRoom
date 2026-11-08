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

const clone = (s: FlyState): FlyState => ({ p: [s.p[0], s.p[1]], h: s.h, path: [...s.path], dist: s.dist });
/** a what-if copy that does not carry the flown path */
const probeOf = (s: FlyState): FlyState => ({ p: [s.p[0], s.p[1]], h: s.h, path: [], dist: s.dist });

/**
 * Direct to a point: turn at the turn-rate limit, then straight. Both turn senses are tried and the
 * shorter kept; a sense whose turn circle contains the point first flies straight until the point
 * is outside it, so the aircraft never orbits a fix it cannot turn onto.
 */
function direct(s: FlyState, T: Pt, R: number): void {
  const maxT = DS / R / D2R;
  const sim = (sense: 1 | -1): FlyState | null => {
    const st = clone(s);
    // no sensible route is longer than the distance plus a couple of orbits
    const cap = (dist(s.p, T) + 4 * Math.PI * R + 4 * R + 5) / DS;
    for (let i = 0; i < cap; i++) {
      const rg = dist(st.p, T);
      if (rg < DS * 1.5) {
        st.path.push([T[0], T[1]]);
        st.dist += rg;
        st.p = [T[0], T[1]];
        return st;
      }
      const df = signedDiff(bearingTo(st.p, T), st.h);
      if (Math.abs(df) <= maxT) {
        stepFwd(st, df);
        continue;
      }
      const n = dir(st.h + sense * 90);
      const c: Pt = [st.p[0] + n[0] * R, st.p[1] + n[1] * R];
      stepFwd(st, dist(c, T) < R * 1.001 ? 0 : sense * maxT);
    }
    return null;
  };
  const a = sim(1);
  const b = sim(-1);
  const best = a && b ? (a.dist <= b.dist ? a : b) : (a ?? b);
  if (best) Object.assign(s, best);
}

/**
 * Intercept and track a course line into a fix: steer toward the line at up to 45° (closing as the
 * cross-track error shrinks), turn-rate limited, from any position and heading. Ends at the fix on
 * the course. Returns how far before the fix the aircraft was established (within 0.08 NM and 5°
 * of the course from there on); 0 when it began at or past the fix.
 */
function intercept(s: FlyState, fix: Pt, C: number, R: number): number {
  const maxT = DS / R / D2R;
  const u = dir(C);
  const Rc = 1.15 * R; // capture arc, a little wider than the tightest turn
  const remOf = () => -((s.p[0] - fix[0]) * u[0] + (s.p[1] - fix[1]) * u[1]);
  const rem0 = remOf();
  if (rem0 <= DS) return 0;
  let lastOff = -1; // remaining distance when last not established
  for (let i = 0; i < 40000; i++) {
    const remaining = remOf();
    const xte = u[0] * (s.p[1] - fix[1]) - u[1] * (s.p[0] - fix[0]); // + = right of course
    if (Math.abs(xte) > 0.08 || angDiff(s.h, C) > 5) lastOff = remaining;
    if (remaining <= DS) break;
    // capture law: 45° intercept until the lead point, then the angle of an arc of radius Rc
    // tangent to the course (a turn the aircraft can fly), so it rolls out on the line
    const ax = Math.abs(xte);
    const a = ax >= Rc * (1 - Math.cos(45 * D2R)) ? 45 : Math.acos(1 - ax / Rc) / D2R;
    const desired = C - Math.sign(xte) * a;
    stepFwd(s, Math.max(-maxT, Math.min(maxT, signedDiff(desired, s.h))));
  }
  s.dist += dist(s.p, fix);
  s.path.push([fix[0], fix[1]]);
  s.p = [fix[0], fix[1]];
  s.h = C;
  return lastOff < 0 ? rem0 : Math.max(0, lastOff);
}

/** Deceleration to holding speed, kt per second (idle and boards). */
export const DECEL_KT_S = 2;

/**
 * Time (s) to fly a marshal route: the transit at the aircraft's speed, slowing at DECEL_KT_S to
 * holding speed so as to arrive at the fix at it (a slower aircraft just flies its own speed), then
 * the entry manoeuvre at holding speed.
 */
export function marshalTimeS(route: { transitNm: number; entryNm: number }, transitKt: number, holdKt: number): number {
  let transitS = (route.transitNm / transitKt) * 3600;
  if (transitKt > holdKt) {
    const decS = (transitKt - holdKt) / DECEL_KT_S;
    const decNm = (((transitKt + holdKt) / 2) * decS) / 3600;
    if (decNm <= route.transitNm) transitS = ((route.transitNm - decNm) / transitKt) * 3600 + decS;
    else {
      // too close to finish slowing before the fix: decelerate over the whole transit
      const v1 = Math.sqrt(Math.max(holdKt * holdKt, transitKt * transitKt - 2 * DECEL_KT_S * 3600 * route.transitNm));
      transitS = (transitKt - v1) / DECEL_KT_S;
    }
  }
  return transitS + (route.entryNm / Math.min(transitKt, holdKt)) * 3600;
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

/** established at least this far before the fix */
const EST_NM = 1.5;
const EST_PARALLEL_NM = 0.5;
export const FALLBACKS = { n: 0 };

/**
 * Route from an aircraft to a marshal fix, arriving established on the inbound course (handoff
 * §5.6 backlog). The transit to the fix is flown at the aircraft's turn radius; the entry is a
 * textbook direct / parallel / offset (teardrop) entry chosen by the standard sectors (the 70°
 * line: direct 180°, offset 70°, parallel 110°; mirrored for left-hand patterns), flown with the
 * hold's own turn radius and 1-minute legs:
 *   direct    turn in the hold direction to outbound, outbound to 1 min past abeam, turn inbound
 *   parallel  turn to outbound on the non-hold side, 1 min, turn > 180° toward the hold side to
 *             intercept the inbound course (at the offset angle)
 *   offset    turn into the hold side from outbound by the offset angle, 1 min, turn in the hold
 *             direction to inbound. The offset is 2·atan(R / leg): ~35° for standard-rate turns
 *             (the textbook 30°), ~65° for the CV pattern's wide turns.
 * The outbound leg is lengthened (as a pilot would) until the aircraft rolls out established at
 * least 1.5 NM before the fix (0.5 NM after a parallel entry's 45° intercept); failing that it goes
 * back out along the inbound course and comes in again.
 */
export function marshalRoute(p0: Pt, h0: number, tasKt: number, radial: number, fixNm: number, hand: 'left' | 'right', hold = HOLD): MarshalRoute {
  const Rt = turnRadiusNm(tasKt);
  const Rh = hold.turnNm;
  const Lh = hold.legNm;
  const C = norm(radial + 180); // inbound course (toward the ship)
  const O = norm(radial); // outbound heading
  const sense: 1 | -1 = hand === 'right' ? 1 : -1;
  const fix: Pt = [fixNm * Math.sin(radial * D2R), -fixNm * Math.cos(radial * D2R)];
  const s0: FlyState = { p: [p0[0], p0[1]], h: norm(h0), path: [[p0[0], p0[1]]], dist: 0 };

  // Straight-in: already behind the fix and roughly lined up, and able to establish in time.
  const u = dir(C);
  const behind = -((p0[0] - fix[0]) * u[0] + (p0[1] - fix[1]) * u[1]);
  if (behind > 2 * Rt + EST_NM && angDiff(bearingTo(p0, fix), C) < 50 && angDiff(h0, C) < 100) {
    const st = clone(s0);
    if (intercept(st, fix, C, Rt) >= EST_NM)
      return { path: st.path, dist: st.dist, transitNm: st.dist, entryNm: 0, entryIdx: st.path.length - 1, entry: 'straight-in', fix };
  }

  const s = clone(s0);
  direct(s, fix, Rt);
  const transitNm = s.dist;
  const entryIdx = s.path.length - 1;
  const f = norm(sense * signedDiff(s.h, C) + 180); // 0..360 in the hold's own frame
  const out = dir(O);
  const xteAt = (p: Pt) => u[0] * (p[1] - fix[1]) - u[1] * (p[0] - fix[0]); // + = right of the inbound course
  const entry: HoldEntry = f >= 70 && f <= 250 ? 'direct' : f < 70 ? 'teardrop' : 'parallel';
  // Offset angle for the teardrop leg and the parallel entry's intercept. The textbook 30° / 45°
  // assume standard-rate turns; in general a teardrop rolls out on the inbound course after the
  // timed leg when leg·sin θ = R·(1 + cos θ), i.e. θ = 2·atan(R / leg): ~35° for standard rate,
  // ~65° for the CV 6-minute pattern's 2-minute 180s.
  const OFF = Math.max(30, Math.min(75, (2 * Math.atan(Rh / Lh)) / D2R));
  const fly = (leg: number): { st: FlyState; est: number } => {
    const st = clone(s);
    if (entry === 'direct') {
      turnTo(st, O, sense, Rh);
      const pastAbeam = (st.p[0] - fix[0]) * out[0] + (st.p[1] - fix[1]) * out[1];
      straight(st, Math.max(0.5, leg - pastAbeam));
      turnTo(st, C, sense, Rh);
    } else if (entry === 'teardrop') {
      // offset leg toward the holding side, at least the timed minute and long enough that the turn
      // inbound rolls out on the course rather than through it
      turnShort(st, norm(O - sense * OFF), Rh);
      const after = (L: number) => {
        const t = probeOf(st);
        straight(t, L);
        turnTo(t, C, sense, Rh);
        return sense * xteAt(t.p);
      };
      let L = leg;
      if (after(L) < 0) {
        let lo = L;
        let hi = L + 16;
        for (let k = 0; k < 14; k++) {
          const m = (lo + hi) / 2;
          if (after(m) < 0) lo = m;
          else hi = m;
        }
        L = hi;
      }
      straight(st, L);
      turnTo(st, C, sense, Rh);
    } else {
      // outbound on the non-holding side, then turn > 180° toward the holding side to a 45°
      // intercept. With the hold's wide turns the short turn to outbound can carry the aircraft onto
      // the holding side, so three ways onto the outbound leg are flown and the shortest that runs
      // outbound on the non-holding side (and establishes in time) is kept:
      //   the short turn; the long turn the other way round; a 30° cut toward the non-holding side
      let best: { st: FlyState; est: number; ok: boolean } | null = null;
      for (let v = 0; v < 3; v++) {
        const t = clone(st);
        if (v === 0) turnShort(t, O, Rh);
        else if (v === 1) {
          if (angDiff(t.h, O) < 1) continue;
          turnTo(t, O, signedDiff(O, t.h) >= 0 ? -1 : 1, Rh);
        } else {
          turnShort(t, norm(O + sense * 30), Rh);
          for (let i = 0; i < 200 && -sense * xteAt(t.p) < 0.5; i++) stepFwd(t, 0);
          turnShort(t, O, Rh);
        }
        straight(t, leg);
        const side = -sense * xteAt(t.p); // + = non-holding side at the end of the outbound leg
        turnTo(t, norm(C - sense * OFF), (-sense) as 1 | -1, Rh);
        const est = intercept(t, fix, C, Rh);
        const ok = side > -0.3 && est >= EST_PARALLEL_NM;
        if (!best || (ok && !best.ok) || (ok === best.ok && t.dist < best.st.dist)) best = { st: t, est, ok };
      }
      return { st: best!.st, est: best!.est };
    }
    return { st, est: intercept(st, fix, C, Rh) };
  };
  // a parallel entry ends with the textbook 45° intercept close to the fix
  const need = entry === 'parallel' ? EST_PARALLEL_NM : EST_NM;
  let res = fly(Lh);
  for (let extra = 1; res.est < need && extra <= 6; extra++) res = fly(Lh + extra);
  if (res.est < need) {
    // go back out along the inbound course and come in again
    for (const back of [8, 12, 16, 24]) {
      const st = clone(s);
      direct(st, [fix[0] - u[0] * back, fix[1] - u[1] * back], Rh);
      res = { st, est: intercept(st, fix, C, Rh) };
      if (res.est >= need) break;
    }
    FALLBACKS.n++;
  }
  return { path: res.st.path, dist: res.st.dist, transitNm, entryNm: res.st.dist - transitNm, entryIdx, entry, fix };
}
