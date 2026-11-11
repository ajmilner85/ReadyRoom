/**
 * CV NATOPS (NAVAIR 00-80T-105) Case III geometry: departures, marshal stacks, holds, arrivals.
 * Ported from the CATCC mockup (catcc-handoff/mockup/Main.dc.html, radials()), which was checked
 * against the NATOPS figures. Returns sampled polylines in scope coordinates (see vec.ts).
 */
import { add, angDiff, bearingOf, D2R, dir, fillet, mul, norm360, P, rot, signedDiff, type Pt, cross } from './vec.ts';

export interface ShipRef {
  /** base recovery course, deg true */
  brc: number;
  /** final bearing (angled deck), deg true; usually brc - 9 on a Nimitz */
  fb: number;
}

export const emergencyMarshalRadial = (s: ShipRef): number => norm360(s.fb + 150);
export const heloMarshalRadial = (s: ShipRef): number => norm360(s.fb + 110);
export const defaultMarshalRadial = (s: ShipRef): number => norm360(s.fb + 180);
/** CV-1 marshal fix: angels + 15 DME. */
export const fixDme = (angels: number): number => angels + 15;

// ---------------------------------------------------------------- departures (5.13.3.4.1)

/**
 * Jet Case III departure to a radial: climb out on the BRC, at 7 NM a 3 NM-radius turn onto the
 * 10 NM arc, fly the arc, lead turn onto the radial, then out to `outNm`. Radials too close to
 * the BRC for the arc get an S-turn whose intercept angle is searched from 45° down.
 */
export function departurePath(radial: number, ship: ShipRef, outNm = 50): Pt[] {
  const R = 3;
  const Dm = 10;
  const th = signedDiff(radial, ship.brc);
  const sg = th < 0 ? -1 : 1;
  const a = Math.abs(th) * D2R;
  const B = ship.brc * D2R;
  // Local frame: y forward along the BRC, x to the turn side.
  const o: Pt[] = [[0, 0]];
  const ap = (x: number, y: number) => o.push([x, y]);
  const line = (p: Pt, q: Pt, n: number) => {
    for (let i = 1; i <= n; i++) ap(p[0] + ((q[0] - p[0]) * i) / n, p[1] + ((q[1] - p[1]) * i) / n);
  };
  const ts = Math.sqrt(Math.max(0, (Dm - R) * (Dm - R) - R * R));
  const C1: Pt = [R, ts];
  line([0, 0], [0, ts], 1);
  const b1 = Math.atan2(C1[0], C1[1]);
  const b2 = a - Math.asin(R / (Dm + R));
  const turnR = (C: Pt, fr: number, to: number, N: number) => {
    for (let i = 1; i <= N; i++) {
      const ps = fr + ((to - fr) * i) / N;
      ap(C[0] - R * Math.cos(ps), C[1] + R * Math.sin(ps));
    }
  };
  const turnL = (C: Pt, fr: number, to: number, N: number) => {
    for (let i = 1; i <= N; i++) {
      const ps = fr + ((to - fr) * i) / N;
      ap(C[0] + R * Math.cos(ps), C[1] - R * Math.sin(ps));
    }
  };
  if (b2 >= b1) {
    turnR(C1, 0, b1 + Math.PI / 2, 24);
    const na = Math.max(1, Math.ceil((b2 - b1) / D2R));
    for (let i = 1; i <= na; i++) {
      const b = b1 + ((b2 - b1) * i) / na;
      ap(Dm * Math.sin(b), Dm * Math.cos(b));
    }
    const C2: Pt = [(Dm + R) * Math.sin(b2), (Dm + R) * Math.cos(b2)];
    turnL(C2, b2 + Math.PI / 2, a, 24);
  } else if (a > 0.3 * D2R) {
    let sol: { h: number; P1: Pt; t: number; C2: Pt } | null = null;
    for (let al = 45 * D2R; al > 0.2 * D2R && !sol; al -= 0.5 * D2R) {
      const h = a + al;
      const P1: Pt = [C1[0] - R * Math.cos(h), C1[1] + R * Math.sin(h)];
      const L1: Pt = [P1[0] - R * Math.cos(h), P1[1] + R * Math.sin(h)];
      const d1: Pt = [Math.sin(h), Math.cos(h)];
      const L2: Pt = [-R * Math.cos(a), R * Math.sin(a)];
      const d2: Pt = [Math.sin(a), Math.cos(a)];
      const det = -d1[0] * d2[1] + d2[0] * d1[1];
      if (Math.abs(det) < 1e-9) continue;
      const rx = L2[0] - L1[0];
      const ry = L2[1] - L1[1];
      const t = (-rx * d2[1] + d2[0] * ry) / det;
      const u = (d1[0] * ry - d1[1] * rx) / det;
      if (t >= 0 && u > 0) sol = { h, P1, t, C2: [L1[0] + t * d1[0], L1[1] + t * d1[1]] };
    }
    if (sol) {
      turnR(C1, 0, sol.h, 16);
      const E: Pt = [sol.P1[0] + sol.t * Math.sin(sol.h), sol.P1[1] + sol.t * Math.cos(sol.h)];
      if (sol.t > 0.01) line(sol.P1, E, 1);
      turnL(sol.C2, sol.h, a, 16);
    }
  }
  const Lp = o[o.length - 1];
  const rem = Math.max(1, outNm - Math.hypot(Lp[0], Lp[1]));
  line(Lp, [Lp[0] + Math.sin(a) * rem, Lp[1] + Math.cos(a) * rem], 1);
  return o.map(([x0, y]) => {
    const x = x0 * sg;
    const E = x * Math.cos(B) + y * Math.sin(B);
    const N = -x * Math.sin(B) + y * Math.cos(B);
    return [E, -N] as Pt;
  });
}

// ---------------------------------------------------------------- holds (6.4.1.1)

export interface HoldSpec {
  /** length of each straight leg, NM */
  legNm: number;
  /** turn radius, NM */
  turnNm: number;
}

/** Mockup default: 250 kt, 1-minute legs (4.2 NM), 2-minute 180° turns (R 2.65 NM): a 6-minute pattern. */
export const HOLD_250: HoldSpec = { legNm: 4.2, turnNm: 2.65 };

/** Hold dimensions for a true airspeed: 1-minute legs, 2-minute 180° turns. */
export function holdSpecForTas(tasKt: number): HoldSpec {
  return { legNm: tasKt / 60, turnNm: (tasKt * (2 / 60)) / Math.PI };
}

/** Rough TAS from IAS and altitude (2 % per 1,000 ft), adequate for protected-airspace sizing. */
export const tasFromIas = (iasKt: number, altFt: number): number => iasKt * (1 + 0.02 * (altFt / 1000));

/**
 * Racetrack on a marshal radial with the inbound leg over the fix (fix at `fixNm` DME, the leg
 * extending outward). Left-hand patterns put the outbound leg clockwise of the radial as seen
 * looking inbound; right-hand patterns mirror it. Returns a closed, sampled loop starting at the fix.
 */
export function holdPattern(radial: number, fixNm: number, hand: 'left' | 'right', spec: HoldSpec = HOLD_250, n = 16): Pt[] {
  const a = fixNm;
  const b = fixNm + spec.legNm;
  const R = spec.turnNm;
  const s = hand === 'left' ? 1 : -1;
  const local: Pt[] = [[0, -a], [0, -b]];
  for (let i = 1; i <= n; i++) {
    const t = Math.PI + (Math.PI * i) / n; // far turn, bulging outward (-y)
    local.push([s * (R + R * Math.cos(t)), -b + R * Math.sin(t)]);
  }
  local.push([s * 2 * R, -a]);
  for (let i = 1; i <= n; i++) {
    const t = (Math.PI * i) / n; // near turn, bulging toward the ship (+y)
    local.push([s * (R + R * Math.cos(t)), -a + R * Math.sin(t)]);
  }
  return local.map((q) => rot(q, radial));
}

// ---------------------------------------------------------------- arrival (6.4.7.3)

export type ArrivalMode = 'straight' | 'intercept' | 'arc' | 'direct';

/**
 * CV-1 arrival from a marshal fix: inbound on the radial; at 20 DME turn toward the FB (2 × the
 * offset if within 10° of the FB reciprocal, else 30°); join the FB with 1.5 NM turns, either by
 * a normal intercept astern of the ship or, if the leg reaches 12 DME first, via the 12 DME arc.
 * Ends at `endNm` on the final bearing.
 */
export function arrivalPath(radial: number, fixNm: number, ship: ShipRef, endNm = 1.3): { path: Pt[]; mode: ArrivalMode } {
  const FB = ship.fb;
  const REC = norm360(FB + 180);
  const AR2 = 1.5;
  const A12 = 12;
  const fix = P(radial, fixNm);
  const K1 = P(radial, 20);
  const h1 = norm360(radial + 180);
  const diff = signedDiff(radial, REC);
  const ab = Math.abs(diff);
  if (ab < 1) return { path: [fix, P(REC, A12), P(REC, 0.75)], mode: 'straight' };

  const off = ab <= 10 ? 2 * ab : 30;
  const left = diff < 0;
  const hi = left ? h1 - off : h1 + off;
  const d1 = dir(h1);
  const d2 = dir(hi);
  const d3 = dir(FB);
  const v = dir(REC);
  const t = -cross(K1, v) / cross(d2, v);
  const K2 = add(K1, mul(d2, t));
  const lam = K2[0] * v[0] + K2[1] * v[1];
  const f1 = fillet(K1, d1, d2, AR2);
  const head: Pt[] = [fix, f1.Fa, ...f1.arc];

  const bb = K1[0] * d2[0] + K1[1] * d2[1];
  const cc = K1[0] * K1[0] + K1[1] * K1[1] - A12 * A12;
  const disc = bb * bb - cc;
  const tx = disc >= 0 ? -bb - Math.sqrt(disc) : -1;
  const hitsFB = t > 0 && lam > 2;
  const hitsArc = tx > 0;
  const bX0 = hitsArc ? bearingOf(add(K1, mul(d2, tx))) : 0;
  const remain = left ? norm360(REC - bX0) : norm360(bX0 - REC);

  if (hitsFB && (!hitsArc || t <= tx || remain < 20 || remain > 300)) {
    const f2 = fillet(K2, d2, d3, AR2);
    return { path: [...head, f2.Fa, ...f2.arc, P(REC, endNm)], mode: 'intercept' };
  }
  if (!hitsArc) return { path: [...head, P(REC, A12), P(REC, endNm)], mode: 'direct' };

  // Fly the leg to 12 DME, lead onto the 12 DME arc, then a 1.5 NM turn off the arc onto the FB.
  const X = add(K1, mul(d2, tx));
  const cw = left; // a left turn moves the jet to larger bearings: clockwise round the arc
  const bX = bearingOf(X);
  const lead = 1.5 / A12 / D2R;
  const bY = cw ? bX + lead : bX - lead;
  const Y = P(bY, A12);
  const Xpre = add(X, mul(d2, -1.5));
  const mside = dir(cw ? REC - 90 : REC + 90);
  const tf = Math.sqrt((A12 - AR2) * (A12 - AR2) - AR2 * AR2);
  const C = add(mul(v, tf), mul(mside, AR2));
  const Ta = mul(C, A12 / (A12 - AR2));
  const Tf = mul(v, tf);
  const bTa = bearingOf(Ta);
  const span = cw ? norm360(bTa - bY) : norm360(bY - bTa);

  const out: Pt[] = [...head, Xpre];
  for (let i = 1; i <= 8; i++) {
    const s = i / 8; // quadratic Bezier Xpre -> (X) -> Y
    out.push([
      (1 - s) * (1 - s) * Xpre[0] + 2 * (1 - s) * s * X[0] + s * s * Y[0],
      (1 - s) * (1 - s) * Xpre[1] + 2 * (1 - s) * s * X[1] + s * s * Y[1],
    ]);
  }
  const steps = Math.max(2, Math.ceil(span / 2));
  for (let i = 1; i <= steps; i++) out.push(P(bY + ((cw ? 1 : -1) * span * i) / steps, A12));
  const C0 = C;
  const r0 = Math.atan2(Ta[1] - C0[1], Ta[0] - C0[0]);
  let dr = Math.atan2(Tf[1] - C0[1], Tf[0] - C0[0]) - r0;
  while (dr > Math.PI) dr -= 2 * Math.PI;
  while (dr < -Math.PI) dr += 2 * Math.PI;
  for (let i = 1; i <= 12; i++) out.push([C0[0] + AR2 * Math.cos(r0 + (dr * i) / 12), C0[1] + AR2 * Math.sin(r0 + (dr * i) / 12)]);
  out.push(P(REC, endNm));
  return { path: out, mode: 'arc' };
}

// ---------------------------------------------------------------- radials manager rules

export interface RadialCheck {
  err?: string;
  warn?: string;
}

const r3 = (n: number) => String(Math.round(norm360(n)) % 360).padStart(3, '0');

/**
 * Departure radial placement (5.13.1): >= 20° from other departure radials and from reserved
 * (holding) radials, including the emergency and helo marshal radials.
 */
export function checkDepartureRadial(b: number, ship: ShipRef, others: number[], stackRadials: { r: number; name: string }[]): RadialCheck {
  for (const r of others) if (angDiff(b, r) < 20) return { err: `${Math.round(angDiff(b, r))}° from ${r3(r)}R` };
  const reserved = [...stackRadials, { r: emergencyMarshalRadial(ship), name: 'emergency marshal' }, { r: heloMarshalRadial(ship), name: 'helo marshal' }];
  for (const x of reserved) if (angDiff(b, x.r) < 20) return { err: `Reserved · ${x.name}` };
  return {};
}

// ---------------------------------------------------------------- stack separation

/** Levels a stack is taken to occupy from its base (the marshal panel's default band: base..base+5). */
export const STACK_BAND = 6;
/** CV NATOPS radar separation: 3 NM within 50 NM of the antenna (radar > 7 RPM), 5 NM beyond. */
export const sepNmAt = (dme: number): number => (dme > 50 ? 5 : 3);

const segDist = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const loopDist = (A: Pt[], B: Pt[]): number => {
  let m = Infinity;
  for (const [P, Q] of [[A, B], [B, A]] as const) for (const p of P) for (let i = 0; i < Q.length; i++) m = Math.min(m, segDist(p, Q[i], Q[(i + 1) % Q.length]));
  return m;
};

const sepDegMemo = new Map<number, number>();
/**
 * Smallest radial offset (deg, 0.5° steps) at which two left-hand marshal holds at the same
 * altitude keep radar separation: fixes at angels + 15 DME, 250 KIAS holds sized for TAS at that
 * altitude (1-minute legs, 2-minute turns), nearest points of the racetracks at least sepNmAt(DME)
 * apart, whichever side the other stack is on. About 24° at angels 6, 15° at angels 30.
 */
export function stackSepDeg(angels: number): number {
  const hit = sepDegMemo.get(angels);
  if (hit !== undefined) return hit;
  const dme = angels + 15;
  const spec = holdSpecForTas(tasFromIas(250, angels * 1000));
  const sep = sepNmAt(dme);
  const A = holdPattern(180, dme, 'left', spec, 24);
  let need = 120;
  for (let d = 1; d <= 120; d += 0.5) {
    if (loopDist(A, holdPattern(180 + d, dme, 'left', spec, 24)) >= sep && loopDist(A, holdPattern(180 - d, dme, 'left', spec, 24)) >= sep) {
      need = d;
      break;
    }
  }
  sepDegMemo.set(angels, need);
  return need;
}

/** Lowest altitude (angels) two stacks' bands share, or null when they are vertically separated. */
export function sharedAngels(baseA: number, baseB: number, band = STACK_BAND): number | null {
  const lo = Math.max(baseA, baseB);
  const hi = Math.min(baseA, baseB) + band - 1;
  return lo <= hi ? lo : null;
}

/** The stack-to-stack separation problem for a stack at radial b with base `base`, if any. */
export function stackConflict(b: number, base: number, otherStacks: { r: number; id: string; base: number }[]): string | null {
  for (const m of otherStacks) {
    const at = sharedAngels(base, m.base);
    if (at === null) continue;
    const need = stackSepDeg(at);
    if (angDiff(b, m.r) < need) return `${Math.round(angDiff(b, m.r))}° from stack ${m.id} (A${at}: needs ${Math.ceil(need)}°)`;
  }
  return null;
}

/**
 * Marshal stack placement: 20° clear of departure radials, and radar separation from every other
 * stack whose altitude band it shares (see stackSepDeg); stacks in separate bands may share a radial
 * sector. `base` is the stack's base angels (a new stack starts at 6).
 */
export function checkStackRadial(b: number, ship: ShipRef, depRadials: number[], otherStacks: { r: number; id: string; base: number }[], base = 6): RadialCheck {
  for (const r of depRadials) if (angDiff(b, r) < 20) return { err: `${Math.round(angDiff(b, r))}° from DEP ${r3(r)}R` };
  const c = stackConflict(b, base, otherStacks);
  if (c) return { err: c };
  if (angDiff(b, ship.brc) < 90) return { warn: 'Bow-on recovery' };
  return {};
}
