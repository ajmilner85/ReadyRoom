/**
 * Turn-then-direct flight model for the hooked-aircraft tools (handoff §5.6), plus EAT and CPA.
 */
import { add, cross, D2R, angDiff, bearingTo, dir, dist, dot, len, mul, signedDiff, sub, type Pt } from './vec.ts';

/** Turn radius in NM for a true airspeed (kt) and bank angle: R(ft) = V² / (11.26 tan φ). */
export function turnRadiusNm(tasKt: number, bankDeg = 30): number {
  return (tasKt * tasKt) / (11.26 * Math.tan(bankDeg * D2R)) / 6076.12;
}

/**
 * Radius (NM) of an energy-sustaining max-rate turn at a true airspeed. The load factor a fighter can
 * hold varies with speed: lift-limited (∝ V²) below the corner speed, then the thrust-limited
 * sustained g (Ps = 0) falls off above it — so the turn is tightest near corner, wider slow or fast.
 * A generic fast-jet envelope (corner ~420 KTAS, 7.5 g structural), adequate to depict intercept
 * geometry, not type-specific performance. R = V² / (g·√(n²−1)).
 */
export function sustainedTurnRadiusNm(tasKt: number): number {
  const Vc = 420; // corner speed, KTAS
  const gMax = 7.5; // structural limit
  const gLift = gMax * Math.min(1, (tasKt / Vc) ** 2); // lift limit (low speed)
  const gThrust = Math.max(2, gMax - 0.012 * Math.max(0, tasKt - Vc)); // sustained limit (above corner)
  const n = Math.max(1.5, Math.min(gLift, tasKt <= Vc ? gMax : gThrust));
  const vFps = Math.max(tasKt, 60) * 1.68781;
  return (vFps * vFps) / (32.174 * Math.sqrt(Math.max(0.1, n * n - 1))) / 6076.12;
}

export interface FlyResult {
  path: Pt[];
  /** ground distance flown, NM */
  dist: number;
  /** heading to steer after the turn (deg true; the crab heading in wind) */
  hdg: number;
  /** time flown, s — only when a true airspeed was supplied (so wind can be timed) */
  timeS?: number;
}

/**
 * Fly from p0 on heading h0 to a ground point T: turn the shortest way at radius R until the ground
 * track points at T, then straight. Integrated in 0.1 NM steps (as in the mockup). With `opts.wind`
 * (kt, scope coords) and `opts.vKt` (true airspeed) the aircraft flies its TAS through the moving air
 * and crabs to hold the ground track, so the drawn path, the steer heading and the returned time are
 * wind-correct; without them it is the original calm turn-then-straight at unit ground speed.
 */
export function fly(p0: Pt, h0: number, T: Pt, R: number, opts: { wind?: Pt; vKt?: number } = {}): FlyResult {
  const wind = opts.wind ?? [0, 0];
  const vKt = opts.vKt ?? 0;
  const timed = vKt > 0;
  const windy = (wind[0] !== 0 || wind[1] !== 0) && timed;
  const vNmS = vKt / 3600;
  const wNmS = mul(wind, 1 / 3600);
  const path: Pt[] = [[p0[0], p0[1]]];
  let p: Pt = [p0[0], p0[1]];
  let h = h0;
  let turned = 0;
  let d = 0;
  let t = 0;
  const ds = 0.1;
  for (let i = 0; i < 6000; i++) {
    const rg = dist(p, T);
    if (rg < 0.05) break;
    const aim = windy ? crabHeading(bearingTo(p, T), vKt, wind) : bearingTo(p, T);
    const df = signedDiff(aim, h);
    if (Math.abs(df) < 0.5 || turned > 360) {
      path.push([T[0], T[1]]);
      d += rg;
      if (timed) t += rg / Math.max(windy ? len(add(mul(dir(h), vNmS), wNmS)) : vNmS, 1e-6);
      h = aim;
      break;
    }
    const st = Math.min(Math.abs(df), ds / R / D2R);
    h += Math.sign(df) * st;
    turned += st;
    if (windy) {
      const stepT = ds / vNmS; // time to fly ds of air path
      const gv = add(mul(dir(h), vNmS), wNmS); // ground velocity
      p = [p[0] + gv[0] * stepT, p[1] + gv[1] * stepT];
      d += len(gv) * stepT;
      t += stepT;
    } else {
      const dd = dir(h);
      p = [p[0] + dd[0] * ds, p[1] + dd[1] * ds];
      d += ds;
      if (timed) t += ds / vNmS;
    }
    path.push([p[0], p[1]]);
  }
  return { path, dist: d, hdg: ((h % 360) + 360) % 360, timeS: timed ? t : undefined };
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

/**
 * The carrier's own pattern (bolter / waveoff downwind, the turn to final, final itself) is
 * separated procedurally: aircraft there pass each other at a mile or so by design. Within this
 * range and below this altitude, the lateral standard is PATTERN_LAT_NM (pairs both on final keep
 * the 1.5 NM in-trail standard).
 */
export const PATTERN_RANGE_NM = 10;
export const PATTERN_TOP_FT = 2500;
export const PATTERN_LAT_NM = 1;

export interface ConflictOptions {
  lookAheadS?: number;
  /** climb/descent is extrapolated for at most this long, then the aircraft is assumed level */
  vertCapS?: number;
  /** vertical speeds below this are treated as level (noise) */
  minVsFpm?: number;
  /** final bearing, to recognise aircraft on final */
  fb?: number;
  /** the focus carrier's course and groundspeed: an arrival's time to touchdown is its closure on the ship */
  ship?: { crs: number; gs: number };
}

/** Final: astern within this range, inside FINAL_DEG of the centreline, on the final bearing and closing. */
export const FINAL_NM = 12;
export const FINAL_DEG = 6;
/** an opening pair keeps its alert this long past its closest point, so a pass doesn't flicker at the abeam */
export const CONFLICT_HOLD_S = 6;
const STEP_S = 1;

/** An aircraft established on final: range astern of the ship, closure on it (kt) and time to touchdown (s). */
export function onFinalOf(k: Kinematic, fb: number, ship?: { crs: number; gs: number }): { along: number; closureKt: number; tTdS: number } | null {
  const u = dir(fb);
  const along = -dot(k.p, u);
  const lat = dot(k.p, dir(fb + 90));
  if (along <= 0 || along > FINAL_NM || angDiff(k.crs, fb) > 20) return null;
  if (Math.abs((Math.atan2(lat, along) * 180) / Math.PI) > FINAL_DEG) return null;
  const closureKt = k.gs * Math.cos((k.crs - fb) * D2R) - (ship ? ship.gs * Math.cos((ship.crs - fb) * D2R) : 0);
  if (closureKt < 40) return null;
  return { along, closureKt, tTdS: (along * 3600) / closureKt };
}

/**
 * A conflict is a predicted loss of separation: at some moment in the look-ahead window BOTH the
 * lateral and the vertical standard are lost, and the pair is getting there, not leaving it.
 *
 * - Relative motion: each aircraft flies its course and groundspeed (climb/descent for vertCapS, not
 *   below its floor). The worst moment is where max(lateral / lateral std, vertical / vertical std)
 *   is least; under 1 is a loss. A pair inside the bubble that is opening or holding steady isn't a
 *   conflict (its worst moment lies behind it); one still closing is, and a pass stays alerted for
 *   CONFLICT_HOLD_S after its closest point. A pair already inside and only creeping closer
 *   (under 5% of the standard, track noise on a steady pair) isn't news either.
 * - Landing: an aircraft established on final (onFinalOf) is predicted only up to its touchdown. A
 *   leader that traps before its trailer closes to the standard is no conflict with it: the interval
 *   at the ramp is the slot timeline's business, and a bolter or waveoff climbing out ahead is opening.
 * - Standards (CV NATOPS 3.3): two aircraft both established on final are in trail, 1-1/2 NM when the
 *   trailer is within 5 NM of the ship, else 2 NM. Otherwise the carrier pattern (both inside
 *   PATTERN_RANGE_NM below PATTERN_TOP_FT) passes at PATTERN_LAT_NM, and everything else takes
 *   lateralStandardNm by the nearer aircraft's range. Vertical VERTICAL_STANDARD_FT.
 *
 * Positions are scope coordinates relative to the focus carrier.
 */
export function predictConflict(A: Kinematic, B: Kinematic, opts: ConflictOptions = {}): (Cpa & { latStd: number }) | null {
  const look = opts.lookAheadS ?? 120;
  const cap = opts.vertCapS ?? 30;
  const minVs = opts.minVsFpm ?? 500;
  const altAt = (k: Kinematic, t: number) => {
    const vs = Math.abs(k.vsFpm ?? 0) < minVs ? 0 : (k.vsFpm ?? 0);
    let alt = k.altFt + (vs * Math.max(-cap, Math.min(t, cap))) / 60;
    if (vs < 0 && k.floorFt !== undefined && t > 0) alt = Math.max(alt, Math.min(k.floorFt, k.altFt));
    return alt;
  };
  const fa = opts.fb !== undefined ? onFinalOf(A, opts.fb, opts.ship) : null;
  const fbn = opts.fb !== undefined ? onFinalOf(B, opts.fb, opts.ship) : null;
  const range = Math.min(Math.hypot(...A.p), Math.hypot(...B.p));
  const inPattern = [A, B].every((k) => Math.hypot(...k.p) < PATTERN_RANGE_NM && k.altFt < PATTERN_TOP_FT);
  const latStd = fa && fbn ? (Math.max(fa.along, fbn.along) <= 5 ? 1.5 : 2) : inPattern ? PATTERN_LAT_NM : lateralStandardNm(range);
  const end = Math.min(look, fa?.tTdS ?? Infinity, fbn?.tTdS ?? Infinity);
  const va = mul(dir(A.crs), A.gs / 3600);
  const vb = mul(dir(B.crs), B.gs / 3600);
  const at = (t: number) => {
    const a = add(A.p, mul(va, t));
    const b = add(B.p, mul(vb, t));
    const latNm = dist(a, b);
    const vertFt = Math.abs(altAt(A, t) - altAt(B, t));
    return { tS: t, latNm, vertFt, a, b, s: Math.max(latNm / latStd, vertFt / VERTICAL_STANDARD_FT) };
  };
  const ts: number[] = [];
  for (let t = -CONFLICT_HOLD_S; t < end; t += STEP_S) ts.push(t);
  ts.push(Math.max(end, 0));
  // the lateral CPA itself, when it falls inside the window
  const dv = sub(vb, va);
  const vv = dot(dv, dv);
  if (vv > 1e-12) {
    const tc = -dot(sub(B.p, A.p), dv) / vv;
    if (tc > -CONFLICT_HOLD_S && tc < end) ts.push(tc);
  }
  let w = at(ts[0]);
  for (const t of ts) {
    const c = at(t);
    if (c.s < w.s - 1e-9) w = c;
  }
  if (w.s >= 1 || w.tS <= -CONFLICT_HOLD_S) return null;
  // already inside and only creeping closer (track noise on a steady pair): not news
  const now = at(0);
  if (now.s < 1 && w.tS > CONFLICT_HOLD_S && now.s - w.s < 0.05) return null;
  // just past the closest point: report where the pair is now
  const r = w.tS < 0 ? now : w;
  return { tS: r.tS, latNm: r.latNm, vertFt: r.vertFt, a: r.a, b: r.b, latStd };
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



const clone = (s: FlyState): FlyState => ({ p: [s.p[0], s.p[1]], h: s.h, path: [...s.path], dist: s.dist });
/** a what-if copy that does not carry the flown path */
const probeOf = (s: FlyState): FlyState => ({ p: [s.p[0], s.p[1]], h: s.h, path: [], dist: s.dist });

/**
 * Direct to a point: turn at the turn-rate limit, then straight. Both turn senses are tried and the
 * shorter kept; a sense whose turn circle contains the point first flies straight until the point
 * is outside it, so the aircraft never orbits a fix it cannot turn onto. `stop` ends it early (at a
 * lead-turn point).
 */
function direct(s: FlyState, T: Pt, R: number, stop?: (p: Pt, h: number) => boolean): void {
  const maxT = DS / R / D2R;
  const sim = (sense: 1 | -1): FlyState | null => {
    const st = clone(s);
    // no sensible route is longer than the distance plus a couple of orbits
    const cap = (dist(s.p, T) + 4 * Math.PI * R + 4 * R + 5) / DS;
    for (let i = 0; i < cap; i++) {
      const rg = dist(st.p, T);
      if (stop && stop(st.p, st.h)) return st;
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
 * of the course from there on); 0 when it began at or past the fix. `cut` is the steepest intercept
 * (90° for a lead turn onto a leg); without `snap` it stops abeam the end point instead of on it.
 */
function intercept(s: FlyState, fix: Pt, C: number, R: number, opt: { cut?: number; snap?: boolean } = {}): number {
  const cut = opt.cut ?? 45;
  const snap = opt.snap ?? true;
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
    // (linear within 0.05 NM of the line: the arc law is infinitely steep there and would chatter)
    const NEAR = 0.05;
    const a = ax >= Rc * (1 - Math.cos(cut * D2R)) ? cut : ax >= NEAR ? Math.acos(1 - ax / Rc) / D2R : (ax / NEAR) * (Math.acos(1 - NEAR / Rc) / D2R);
    const desired = C - Math.sign(xte) * a;
    stepFwd(s, Math.max(-maxT, Math.min(maxT, signedDiff(desired, s.h))));
  }
  if (!snap) return lastOff < 0 ? rem0 : Math.max(0, lastOff);
  s.dist += dist(s.p, fix);
  // a last step much shorter than DS would draw a spurious hook onto the fix: replace it instead
  if (s.path.length > 1 && dist(s.path[s.path.length - 1], fix) < DS * 0.6) s.path.pop();
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
 *
 * `windAlongTransitKt` is the wind component along the transit (+ tailwind): the transit is one long,
 * roughly straight leg where wind directly adds to or subtracts from closure, so it is flown at a
 * ground speed of airspeed + wind. The entry is a near-closed racetrack whose legs cancel, so it is
 * left at holding airspeed. Default 0 reproduces the still-air time exactly.
 */
export function marshalTimeS(route: { transitNm: number; entryNm: number }, transitKt: number, holdKt: number, windAlongTransitKt = 0): number {
  const gT = Math.max(50, transitKt + windAlongTransitKt); // transit ground speed
  const gH = Math.max(40, holdKt + windAlongTransitKt); // ground speed once slowed to holding airspeed
  let transitS = (route.transitNm / gT) * 3600;
  if (gT > gH) {
    const decS = (gT - gH) / DECEL_KT_S;
    const decNm = (((gT + gH) / 2) * decS) / 3600;
    if (decNm <= route.transitNm) transitS = ((route.transitNm - decNm) / gT) * 3600 + decS;
    else {
      // too close to finish slowing before the fix: decelerate over the whole transit
      const v1 = Math.sqrt(Math.max(gH * gH, gT * gT - 2 * DECEL_KT_S * 3600 * route.transitNm));
      transitS = (gT - v1) / DECEL_KT_S;
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
const EST_PARALLEL_NM = 1.0;
export const FALLBACKS = { n: 0 };

/**
 * Route from an aircraft to a marshal fix, arriving established on the inbound course (handoff
 * §5.6 backlog). The entry is chosen by the standard sectors (the 70° line: direct 180°, offset
 * 70°, parallel 110°; mirrored for left-hand patterns) from the heading the aircraft would arrive
 * at the fix with. Only the final inbound crossing of the fix is a fly-over: the entry's first leg
 * is joined with a lead turn (fly-by), flown at holding speed with the hold's turn radius:
 *   direct    join the pattern's outbound leg (abeam the fix, holding side), 1 min, turn inbound
 *   parallel  join the outbound radial at the fix, 1 min, turn > 180° toward the holding side to
 *             intercept the inbound course at the offset angle
 *   offset    join the offset leg from the fix (θ toward the holding side), 1 min, turn in the hold
 *             direction onto the inbound course. θ = 2·atan(R / leg): ~35° for standard-rate turns
 *             (the textbook 30°), ~65° for the CV pattern's wide turns.
 * The leg is lengthened (as a pilot would) until the aircraft rolls out established at least 1.5 NM
 * before the fix (1 NM after a parallel entry's intercept); failing that it goes back out along the
 * inbound course and comes in again. The transit (to the lead point) is at the aircraft's speed.
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

  // Entry type by the 70° sectors, from the heading the aircraft would have arriving at the fix.
  const probe = probeOf(s0);
  direct(probe, fix, Rt);
  const f = norm(sense * signedDiff(probe.h, C) + 180); // 0..360 in the hold's own frame
  const entry: HoldEntry = f >= 70 && f <= 250 ? 'direct' : f < 70 ? 'teardrop' : 'parallel';
  // Offset angle for the teardrop leg and the parallel entry's intercept. The textbook 30° / 45°
  // assume standard-rate turns; a teardrop rolls out on the inbound course after a leg L when
  // L·sin θ = R·(1 + cos θ), i.e. θ = 2·atan(R / L): ~35° standard rate, ~65° for the CV 6-minute
  // pattern's 2-minute 180s.
  const offFor = (L: number) => Math.max(20, Math.min(75, (2 * Math.atan(Rh / L)) / D2R));
  const OFF = offFor(Lh);
  const xteAt = (p: Pt) => u[0] * (p[1] - fix[1]) - u[1] * (p[0] - fix[0]); // + = right of the inbound course

  // The aircraft's heading arriving at the fix, and the transit up to it.
  const arrival = probeOf(s0);
  direct(arrival, fix, Rt);
  const hArr = arrival.h;
  const out = dir(O);

  /**
   * Fly one entry: the first turn at the fix onto heading H1 is a fly-by (a fillet of the hold's
   * radius begun R·tan(D/2) before the fix, rolling out on the line through the fix) when it is at
   * most 150° and the turn in the entry's direction is the short way; otherwise the fix is flown
   * over and then the turn made. Then the timed leg (measured from the fix / abeam it), then the
   * turn inbound. Only the final inbound crossing of the fix is always a fly-over.
   */
  const plan = (H1: number, firstSense: 1 | -1 | 0, L: number, keep: boolean): { st: FlyState; transitNm: number; entryIdx: number; legSide: number } => {
    const st = keep ? clone(s0) : { ...probeOf(s0), path: [] as Pt[] };
    const sd: 1 | -1 = firstSense || (signedDiff(H1, hArr) >= 0 ? 1 : -1);
    const turn = sd > 0 ? norm(H1 - hArr) : norm(hArr - H1);
    const flyBy = turn <= 150;
    if (flyBy) {
      const lead = Rh * Math.tan(((turn / 2) * Math.PI) / 180);
      direct(st, fix, Rt, (p, h) => dist(p, fix) <= lead && angDiff(h, bearingTo(p, fix)) < 1);
    } else direct(st, fix, Rt);
    const transitNm = st.dist;
    const entryIdx = st.path.length - 1;
    turnTo(st, H1, sd, Rh);
    const u1 = dir(H1);
    const along = (st.p[0] - fix[0]) * u1[0] + (st.p[1] - fix[1]) * u1[1];
    for (let i = 0; i < Math.max(0.5, L - along) / DS; i++) stepFwd(st, 0);
    const legSide = sense * xteAt(st.p); // + = holding side, at the end of the leg
    if (entry === 'parallel') turnTo(st, norm(C - sense * OFF), (-sense) as 1 | -1, Rh);
    else turnTo(st, C, sense, Rh);
    return { st, transitNm, entryIdx, legSide };
  };
  // direct: in the hold direction to O - sense·θ; teardrop: the short way to O - sense·θ;
  // parallel: the short way onto the outbound radial. θ (direct, teardrop) is solved so the turn
  // inbound rolls out on the course, searched near the nominal angle (0 direct, OFF teardrop) over a
  // range where the first turn does not wrap.
  const firstSense: 1 | -1 | 0 = entry === 'direct' ? sense : 0;
  const solveTheta = (L: number): number => {
    if (entry === 'parallel') return 0;
    const nominal = entry === 'direct' ? 0 : OFF;
    const [lo, hi] = entry === 'direct' ? [-45, 60] : [10, 80];
    const miss = (th: number) => sense * xteAt(plan(norm(O - sense * th), firstSense, L, false).st.p); // + = short of the course
    const sideOk = (th: number) => plan(norm(O - sense * th), firstSense, L, false).legSide > 0.3;
    const ft = (th: number) => {
      const H1 = norm(O - sense * th);
      return entry === 'direct' ? norm(sense * (H1 - hArr)) : signedDiff(H1, hArr);
    };
    let best: number | null = null;
    let prev: { th: number; v: number; f: number } | null = null;
    for (let th = lo; th <= hi + 1e-9; th += 5) {
      const cur = { th, v: miss(th), f: ft(th) };
      if (prev && Math.sign(prev.v) !== Math.sign(cur.v) && Math.abs(cur.f - prev.f) < 20) {
        let a = prev;
        let b = cur;
        for (let k = 0; k < 12; k++) {
          const m = (a.th + b.th) / 2;
          const mv = { th: m, v: miss(m), f: ft(m) };
          if (Math.sign(mv.v) === Math.sign(a.v)) a = mv;
          else b = mv;
        }
        const root = (a.th + b.th) / 2;
        if (sideOk(root) && (best === null || Math.abs(root - nominal) < Math.abs(best - nominal))) best = root;
      }
      prev = cur;
    }
    return best ?? nominal;
  };
  const fly = (L: number): { st: FlyState; est: number; transitNm: number; entryIdx: number } => {
    if (entry === 'parallel') {
      // outbound on the radial or the non-holding side: the first turn the short way, or (when the
      // fix is flown over and that would carry the aircraft onto the holding side) the other way
      // (chosen by side alone; the leg is lengthened afterwards if it does not establish in time)
      let pick: ReturnType<typeof plan> | null = null;
      for (const fs of [0, 1, -1] as const) {
        const r = plan(O, fs, L, true);
        if (r.legSide < 0.3 && (!pick || fs === 0 || r.st.dist < pick.st.dist)) pick = r;
        if (pick && fs === 0) break;
      }
      pick ??= plan(O, 0, L, true);
      return { ...pick, est: intercept(pick.st, fix, C, Rh) };
    }
    const th = solveTheta(L);
    const r = plan(norm(O - sense * th), firstSense, L, true);
    return { ...r, est: intercept(r.st, fix, C, Rh) };
  };
  void out;
  const need = entry === 'parallel' ? EST_PARALLEL_NM : EST_NM;
  let res = fly(Lh);
  for (let extra = 1; res.est < need && extra <= 8; extra++) res = fly(Lh + extra);
  if (res.est < need) {
    // go back out along the inbound course and come in again
    for (const back of [8, 12, 16, 24]) {
      const st = clone(s0);
      direct(st, fix, Rt);
      const transitNm = st.dist;
      const entryIdx = st.path.length - 1;
      direct(st, [fix[0] - u[0] * back, fix[1] - u[1] * back], Rh);
      res = { st, est: intercept(st, fix, C, Rh), transitNm, entryIdx };
      if (res.est >= need) break;
    }
    FALLBACKS.n++;
  }
  return { path: res.st.path, dist: res.st.dist, transitNm: res.transitNm, entryNm: res.st.dist - res.transitNm, entryIdx: res.entryIdx, entry, fix };
}

// ---------------------------------------------------------------- intercept (vector to a rejoin)

/** Interceptor longitudinal response: how fast it can change groundspeed, kt/s. */
export interface AccelRates {
  accel: number;
  decel: number;
}

export interface InterceptInput {
  /** interceptor position (scope NM), current heading (deg true) and current TRUE AIRSPEED (kt) */
  p0: Pt;
  h0: number;
  v0: number;
  /** commanded true airspeed to fly, kt */
  vSet: number;
  rates: AccelRates;
  /** interceptee position, course (deg true) and groundspeed (kt) */
  pe: Pt;
  crsE: number;
  gsE: number;
  /** how far short of the contact the interceptor is vectored (the visual-rejoin point), NM */
  standoffNm: number;
  /** wind at the intercept altitude as a velocity the air moves TOWARD (kt, scope coords); default calm */
  wind?: Pt;
}

export interface InterceptSolution {
  /** false when the interceptee cannot be caught at the commanded speed */
  ok: boolean;
  /** collision / merge point (where the interceptor would arrive abeam the contact) */
  merge: Pt;
  /** rejoin point: standoffNm short of the merge on the interceptor's inbound leg */
  rejoin: Pt;
  /** p0 -> rejoin, the commanded leg (drawn solid) */
  solid: Pt[];
  /** rejoin -> merge, the visual-closure continuation (drawn dashed) */
  dashed: Pt[];
  /** inbound heading into the merge, deg true */
  steerHdg: number;
  /** track distance to the rejoin point, NM */
  distNm: number;
  /** time to the rejoin point, s */
  eteS: number;
  /** time to the merge, s */
  mergeS: number;
}

interface AccelFlight {
  path: Pt[];
  /** cumulative distance at each vertex, NM */
  cum: number[];
  /** cumulative time at each vertex, s */
  time: number[];
  dist: number;
  timeS: number;
  hdg: number;
}

const clampN = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/**
 * Air heading (deg true) that holds a ground course `gc` at true airspeed `tas` in `wind` (kt, the
 * velocity the air moves toward): the wind-correction (crab) angle cancels the cross-course wind.
 * When the crosswind exceeds the airspeed the track cannot be held and the nose crabs fully into it.
 */
function crabHeading(gc: number, tas: number, wind: Pt): number {
  const wperp = cross(dir(gc), wind); // kt, + to the right of the course
  const crab = Math.asin(clampN(-wperp / Math.max(tas, 1), -1, 1)) / D2R;
  return ((gc + crab) % 360 + 360) % 360;
}

/**
 * Fly to a fixed point at the turn-rate limit while accelerating/decelerating toward vSet, in wind.
 * The aircraft flies its true airspeed through a moving air mass: each step it crabs to hold the
 * ground course toward T and advances by its ground velocity (air velocity + wind). Turn rate is
 * limited by the TAS-based radius (bank acts on the air). Time-stepped (dt 0.5 s) so a changing speed
 * (hence radius) and the wind drift are integrated honestly, recording cumulative GROUND distance and
 * time at every vertex so the path can later be split at a distance short of T. Calm wind ([0,0])
 * reduces exactly to a turn-then-straight run at groundspeed = TAS.
 */
function flyAccel(inp: { p0: Pt; h0: number; v0: number; vSet: number; rates: AccelRates; wind?: Pt }, T: Pt): AccelFlight {
  const dt = 0.5;
  const wNmS = mul(inp.wind ?? [0, 0], 1 / 3600); // wind velocity, NM/s
  let p: Pt = [inp.p0[0], inp.p0[1]];
  let h = ((inp.h0 % 360) + 360) % 360;
  let v = inp.v0;
  let t = 0;
  let total = 0;
  const path: Pt[] = [[p[0], p[1]]];
  const cum = [0];
  const time = [0];
  for (let i = 0; i < 8000; i++) {
    const gv = add(mul(dir(h), v / 3600), wNmS); // ground velocity at the current heading/speed, NM/s
    const gsNmS = len(gv);
    const rg = dist(p, T);
    if (rg <= Math.max(gsNmS * dt, 0.05)) {
      total += rg;
      t += rg / Math.max(gsNmS, 1e-6);
      h = bearingTo(p, T);
      path.push([T[0], T[1]]);
      cum.push(total);
      time.push(t);
      break;
    }
    const dv = inp.vSet - v;
    const rate = dv >= 0 ? inp.rates.accel : inp.rates.decel;
    v += clampN(dv, -rate * dt, rate * dt);
    const R = sustainedTurnRadiusNm(v);
    const maxTurn = ((v / 3600) / R) / D2R * dt; // deg this step
    const hDes = crabHeading(bearingTo(p, T), v, inp.wind ?? [0, 0]);
    h = ((h + clampN(signedDiff(hDes, h), -maxTurn, maxTurn)) % 360 + 360) % 360;
    const stepVec = mul(add(mul(dir(h), v / 3600), wNmS), dt); // ground step this interval
    p = [p[0] + stepVec[0], p[1] + stepVec[1]];
    total += len(stepVec);
    t += dt;
    path.push([p[0], p[1]]);
    cum.push(total);
    time.push(t);
  }
  return { path, cum, time, dist: total, timeS: t, hdg: h };
}

/** The point (and arrival time) a given distance along a flown path. */
function splitAt(fl: AccelFlight, cut: number): { pt: Pt; idx: number; timeS: number } {
  if (cut <= 0) return { pt: fl.path[0], idx: 1, timeS: 0 };
  for (let i = 1; i < fl.cum.length; i++) {
    if (fl.cum[i] >= cut) {
      const seg = fl.cum[i] - fl.cum[i - 1] || 1e-9;
      const f = (cut - fl.cum[i - 1]) / seg;
      const a = fl.path[i - 1];
      const b = fl.path[i];
      return { pt: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], idx: i, timeS: fl.time[i - 1] + (fl.time[i] - fl.time[i - 1]) * f };
    }
  }
  return { pt: fl.path[fl.path.length - 1], idx: fl.path.length - 1, timeS: fl.timeS };
}

/**
 * Lead-collision intercept to a rejoin: the interceptor flies a turn-rate-limited, accel/decel-aware
 * path to where the (constant-velocity) interceptee will be, truncated `standoffNm` short so the
 * solid leg ends at the rejoin point and a dashed leg continues to the merge. A moving target makes
 * this a fixed point — the realised arrival time re-predicts the interceptee's position — seeded by
 * the analytic constant-speed collision triangle. `ok` is false when the contact simply outruns the
 * commanded speed (no positive collision time).
 */
export function interceptSolve(inp: InterceptInput): InterceptSolution {
  const ev = mul(dir(inp.crsE), inp.gsE / 3600); // interceptee ground velocity, NM/s
  const wNmS = mul(inp.wind ?? [0, 0], 1 / 3600);
  const predict = (ts: number): Pt => add(inp.pe, mul(ev, ts));

  // analytic lead-collision seed, worked in the air mass so the commanded TAS is the straight-line
  // speed: in that frame the target drifts at (ev − wind), so |R0 + (ev − wind)·t| = vSet·t.
  const R0 = sub(inp.pe, inp.p0);
  const s = inp.vSet / 3600;
  const evRel = sub(ev, wNmS);
  const a = dot(evRel, evRel) - s * s;
  const b = 2 * dot(R0, evRel);
  const c = dot(R0, R0);
  let t0 = NaN;
  if (Math.abs(a) < 1e-9) {
    if (b < 0) t0 = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const roots = [(-b - sq) / (2 * a), (-b + sq) / (2 * a)].filter((r) => r > 0).sort((x, y) => x - y);
      if (roots.length) t0 = roots[0];
    }
  }
  const reachable = Number.isFinite(t0) && t0 > 0 && t0 < 4000;

  let C = predict(reachable ? t0 : 120);
  let fl = flyAccel(inp, C);
  let ok = reachable;
  for (let k = 0; k < 12; k++) {
    const Cn = predict(fl.timeS);
    const moved = dist(Cn, C);
    C = Cn;
    fl = flyAccel(inp, C);
    if (fl.timeS > 3600) {
      ok = false;
      break;
    }
    if (moved < 0.05) break;
  }
  if (!ok) return { ok: false, merge: C, rejoin: inp.p0, solid: [], dashed: [], steerHdg: fl.hdg, distNm: fl.dist, eteS: fl.timeS, mergeS: fl.timeS };

  const cut = fl.dist - inp.standoffNm;
  if (cut <= 0) {
    // already within the standoff: the whole (turning) run-in is visual closure — all dashed, no
    // commanded leg and no rejoin point, but the flown path is kept so the turn still shows
    return { ok: true, merge: C, rejoin: inp.p0, solid: [], dashed: fl.path, steerHdg: fl.hdg, distNm: 0, eteS: 0, mergeS: fl.timeS };
  }
  const sp = splitAt(fl, cut);
  const E = sp.pt;
  const solid = [...fl.path.slice(0, sp.idx), E];
  return { ok: true, merge: C, rejoin: E, solid, dashed: [E, C], steerHdg: bearingTo(E, C), distNm: cut, eteS: sp.timeS, mergeS: fl.timeS };
}

// ---------------------------------------------------------------- stern conversion (rejoin to the six)

export interface SternInput {
  /** the visual point (where the stern conversion begins) and the interceptor's heading there */
  p0: Pt;
  h0: number;
  /** interceptor speed through the conversion, kt */
  vKt: number;
  /** interceptee position (now), course (deg true) and groundspeed (kt) */
  pe: Pt;
  crsE: number;
  gsE: number;
  /** seconds from now until the interceptor reaches p0, so the interceptee can be projected forward */
  t0S: number;
  /** roll out this far behind the interceptee, NM */
  trailNm: number;
  /** wind at the conversion altitude as a velocity the air moves TOWARD (kt, scope coords); default calm */
  wind?: Pt;
}

export interface SternSolution {
  /** false if the interceptor could not settle into the stern within the integration window */
  ok: boolean;
  /** visual point -> 1 NM astern, a pursuit curve into the six */
  path: Pt[];
  /** the rollout point (trailNm behind the interceptee) and the heading there (the interceptee's) */
  end: Pt;
  endHdg: number;
  /** time from the visual point to the rollout, s */
  timeS: number;
}

/**
 * Stern conversion from the visual point: a turn-rate-limited pursuit curve onto a point trailNm
 * behind the (moving) interceptee, rolling out on its heading — the counterturn into the six that a
 * controller calls once the interceptor is visual. A pursuit curve to a trailing point naturally
 * carves into the stern (the lead needed to aim at the trail point falls to zero as the interceptor
 * settles behind), which is the displacement-turn idea without needing a separately flown offset.
 *
 * Flown at the commanded speed with the energy-sustaining max-rate turn radius (so a fast interceptor
 * still turns tightly rather than orbiting). Integrated forward in time (dt 0.5 s) so the target's
 * motion is honest; no fixed point needed. A guard truncates the path at the closest approach if the
 * pursuit would overshoot and orbit (e.g. a very fast interceptor onto a slow close contact).
 */
export function sternConversion(inp: SternInput): SternSolution {
  const dt = 0.5;
  const vNmS = inp.vKt / 3600;
  const wind = inp.wind ?? [0, 0];
  const wNmS = mul(wind, 1 / 3600);
  const R = sustainedTurnRadiusNm(inp.vKt);
  const maxTurn = (vNmS / R) / D2R * dt; // deg per step
  const ev = mul(dir(inp.crsE), inp.gsE / 3600); // interceptee ground velocity, NM/s
  const trail = mul(dir(inp.crsE), -inp.trailNm); // offset from the interceptee to the trail point
  const trailAt = (ts: number): Pt => add(add(inp.pe, mul(ev, ts)), trail);
  const gsAlong = (gc: number): number => len(add(mul(dir(crabHeading(gc, inp.vKt, wind)), vNmS), wNmS)); // ground speed holding course gc
  let p: Pt = [inp.p0[0], inp.p0[1]];
  let h = ((inp.h0 % 360) + 360) % 360;
  let t = 0;
  const path: Pt[] = [[p[0], p[1]]];
  let minD = Infinity;
  let minIdx = 0;
  for (let i = 0; i < 4000; i++) {
    const F = trailAt(inp.t0S + t);
    const rg = dist(p, F);
    const gsF = gsAlong(bearingTo(p, F));
    if (rg <= Math.max(gsF * dt * 1.5, 0.05)) {
      path.push([F[0], F[1]]);
      return { ok: true, path, end: F, endHdg: inp.crsE, timeS: t + rg / Math.max(gsF, 1e-6) };
    }
    if (rg < minD) {
      minD = rg;
      minIdx = path.length - 1;
    } else if (rg > minD + 1.5) {
      // overshot the stern and pulling away — stop at the closest approach rather than orbit
      const trimmed = path.slice(0, minIdx + 1);
      return { ok: true, path: trimmed, end: trimmed[trimmed.length - 1], endHdg: inp.crsE, timeS: t };
    }
    const hDes = crabHeading(bearingTo(p, F), inp.vKt, wind); // crab to track the trail point in wind
    h = ((h + clampN(signedDiff(hDes, h), -maxTurn, maxTurn)) % 360 + 360) % 360;
    const gv = add(mul(dir(h), vNmS), wNmS); // ground velocity
    p = [p[0] + gv[0] * dt, p[1] + gv[1] * dt];
    t += dt;
    path.push([p[0], p[1]]);
  }
  return { ok: false, path, end: trailAt(inp.t0S + t), endHdg: inp.crsE, timeS: t };
}
