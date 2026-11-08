import { describe, expect, it } from 'vitest';
import { FALLBACKS, marshalRoute, marshalTimeS, turnRadiusNm } from './maneuver.ts';
import { holdSpecForTas, tasFromIas, type HoldSpec } from './procedures.ts';
import { maxEnduranceKias } from '../dcs/aircraft.ts';
import { D2R, angDiff, bearingTo, dist, type Pt } from './vec.ts';

/**
 * Property sweep over hold entries: start positions all round the fix (near and far), every
 * heading, slow to fast aircraft, both hold directions. Every route must be bounded, continuous,
 * flown at no tighter than the turn radius, and end established on the inbound course.
 */
const RADIAL = 241;
const FIX_NM = 30;
const C = (RADIAL + 180) % 360;
const fix: Pt = [FIX_NM * Math.sin(RADIAL * D2R), -FIX_NM * Math.cos(RADIAL * D2R)];
const u: Pt = [Math.sin(C * D2R), -Math.cos(C * D2R)];

const xteOf = (p: Pt) => u[0] * (p[1] - fix[1]) - u[1] * (p[0] - fix[0]);
const along = (p: Pt) => (p[0] - fix[0]) * u[0] + (p[1] - fix[1]) * u[1];

const STATS = { entry: 0, past: 0 };

/** holds flown at max-endurance TAS at angels 15: an E-2, a Hornet, and a fast 300 kt TAS hold */
const HOLDS: HoldSpec[] = [tasFromIas(160, 15000), tasFromIas(230, 15000), 300].map(holdSpecForTas);

interface Bad {
  why: string;
  case: string;
}

function check(p0: Pt, h0: number, kt: number, hand: 'left' | 'right', hold: HoldSpec): Bad | null {
  const r = marshalRoute(p0, h0, kt, RADIAL, FIX_NM, hand, hold);
  const tag = `p0=[${p0.map((x) => x.toFixed(1))}] h0=${h0} kt=${kt} ${hand} hold R${hold.turnNm.toFixed(1)} → ${r.entry}`;
  const P = r.path;
  const last = P[P.length - 1];
  if (dist(last, fix) > 1e-6) return { why: `ends ${dist(last, fix).toFixed(2)} NM from the fix`, case: tag };
  const d0 = dist(p0, fix);
  const Rt = turnRadiusNm(kt);
  // bounded: transit no worse than a full orbit plus the distance; entry no more than ~2 hold circuits
  if (r.transitNm > d0 + 2 * Math.PI * Rt + 2 * Rt + 1) return { why: `transit ${r.transitNm.toFixed(1)} NM (direct ${d0.toFixed(1)}, R ${Rt.toFixed(1)})`, case: tag };
  if (r.entryNm > 48 * (hold.legNm / 4.2)) return { why: `entry ${r.entryNm.toFixed(1)} NM`, case: tag };
  const maxEx = Math.max(...P.map((p) => dist(p, fix)));
  // the hold's turns are wide (2-minute 180s), so a teardrop needs a long offset leg to roll out on course
  if (maxEx > d0 + 2 * Rt + 4 * hold.turnNm + 2 * hold.legNm + 1) return { why: `wanders ${maxEx.toFixed(1)} NM from the fix`, case: tag };
  // continuous
  for (let i = 1; i < P.length; i++) {
    const g = dist(P[i - 1], P[i]);
    if (g > 0.25) return { why: `jump of ${g.toFixed(2)} NM at ${i}/${P.length}`, case: tag };
  }
  // entry side: direct and teardrop go out on the holding side, parallel on the other side
  // (hold side is right of the inbound course for a right-hand pattern; xte + = right)
  if (r.entry !== 'straight-in') {
    const E = P.slice(r.entryIdx);
    const holdSide = hand === 'right' ? 1 : -1;
    const want = r.entry === 'parallel' ? -holdSide : holdSide;
    // the outbound leg must lie on the wanted side
    const O = RADIAL;
    // the leg itself: outbound heading, or the offset toward the hold side for a teardrop
    const off = Math.max(30, Math.min(75, (2 * Math.atan(hold.turnNm / hold.legNm)) / D2R));
    const legHdg = r.entry === 'teardrop' ? (O - (hand === 'right' ? 1 : -1) * off + 360) % 360 : O;
    const outb: number[] = [];
    for (let i = 2; i < E.length; i++) {
      const h1 = bearingTo(E[i - 2], E[i - 1]);
      const h2 = bearingTo(E[i - 1], E[i]);
      if (angDiff(h2, legHdg) < 5 && angDiff(h1, h2) < 0.01) outb.push(xteOf(E[i]));
    }
    const mean = outb.length ? outb.reduce((a, b) => a + b, 0) / outb.length : 0;
    if (!outb.length) return { why: `${r.entry} entry has no outbound leg`, case: tag };
    // parallel: not on the holding side; direct / teardrop: clearly on it
    if (r.entry === 'parallel' ? mean * want < -0.3 : mean * want < 0.3) return { why: `${r.entry} outbound leg on the wrong side (mean xte ${mean.toFixed(1)})`, case: tag };
    STATS.entry = Math.max(STATS.entry, r.entryNm);
    STATS.past = Math.max(STATS.past, Math.max(...E.map(along)));
  }
  // established: the last 1.5 NM before the fix lie on the inbound course (0.5 NM after a parallel
  // entry, which ends with the textbook 45° intercept)
  const estNm = r.entry === 'parallel' ? 0.5 : 1.5;
  for (let i = P.length - 1; i >= 0 && along(P[i]) > -estNm; i--) {
    if (along(P[i]) > 0.05) return { why: `approaches the fix from beyond it (along ${along(P[i]).toFixed(2)})`, case: tag };
    if (Math.abs(xteOf(P[i])) > 0.1) return { why: `not established: xte ${xteOf(P[i]).toFixed(2)} NM ${(-along(P[i])).toFixed(2)} NM out`, case: tag };
  }
  return null;
}

describe('marshal entries: property sweep', () => {
  it('every start / heading / speed / hand gives a sane route', () => {
    const bad: Bad[] = [];
    let n = 0;
    for (const rng of [0.5, 2, 4, 7, 12, 25])
      for (let b = 0; b < 360; b += 30)
        for (let h0 = 0; h0 < 360; h0 += 45)
          for (const kt of [140, 300, 450])
            for (const hold of HOLDS)
            for (const hand of ['left', 'right'] as const) {
              const p0: Pt = [fix[0] + rng * Math.sin(b * D2R), fix[1] - rng * Math.cos(b * D2R)];
              const e = check(p0, h0, kt, hand, hold);
              n++;
              if (e) bad.push(e);
            }
    console.log(`fallbacks ${FALLBACKS.n}/${n}; longest entry ${STATS.entry.toFixed(1)} NM; farthest past the fix ${STATS.past.toFixed(1)} NM`);
    const kinds: Record<string, number> = {};
    for (const b of bad) {
      const k = b.why.replace(/[-\d.]+/g, '#') + ' / ' + b.case.split('→ ')[1];
      kinds[k] = (kinds[k] ?? 0) + 1;
    }
    console.log(kinds);
    if (bad.length) console.log(`${bad.length}/${n} bad\n` + bad.slice(0, 40).map((b) => `${b.why}  |  ${b.case}`).join('\n'));
    expect(bad.length).toBe(0);
  }, 120_000);
});

describe('max-endurance hold speed', () => {
  it('knows the carrier types and defaults to 250', () => {
    expect(maxEnduranceKias('FA-18C_hornet')).toBe(230);
    expect(maxEnduranceKias('E-2C')).toBe(160);
    expect(maxEnduranceKias('SH-60B')).toBe(70);
    expect(maxEnduranceKias('KC135MPRS')).toBe(250);
    expect(maxEnduranceKias(undefined)).toBe(250);
  });

  it('times the transit with the slow-down to holding speed, then the entry at holding speed', () => {
    // 60 NM at 400 kt slowing at 2 kt/s to 300: 50 s and 4.86 NM of deceleration
    const t = marshalTimeS({ transitNm: 60, entryNm: 25 }, 400, 300);
    expect(t).toBeCloseTo(((60 - 4.861) / 400) * 3600 + 50 + (25 / 300) * 3600, 0);
    // slower than holding speed: no slow-down, entry at its own speed
    expect(marshalTimeS({ transitNm: 10, entryNm: 10 }, 200, 300)).toBeCloseTo(180 + 180, 6);
    // too close to finish slowing: decelerating the whole way still beats flying it at hold speed
    const near = marshalTimeS({ transitNm: 1, entryNm: 0 }, 450, 250);
    expect(near).toBeLessThan((1 / 250) * 3600);
    expect(near).toBeGreaterThan((1 / 450) * 3600);
  });

  it('a slower hold gives a tighter entry', () => {
    const fix: Pt = [FIX_NM * Math.sin(RADIAL * D2R), -FIX_NM * Math.cos(RADIAL * D2R)];
    let slow = 0;
    let fast = 0;
    for (let b = 0; b < 360; b += 30) {
      const p0: Pt = [fix[0] + 20 * Math.sin(b * D2R), fix[1] - 20 * Math.cos(b * D2R)];
      slow += marshalRoute(p0, (b + 180) % 360, 300, RADIAL, FIX_NM, 'left', holdSpecForTas(160)).entryNm;
      fast += marshalRoute(p0, (b + 180) % 360, 300, RADIAL, FIX_NM, 'left', holdSpecForTas(300)).entryNm;
    }
    expect(slow).toBeGreaterThan(0);
    expect(slow).toBeLessThan(fast * 0.75);
  });
});
