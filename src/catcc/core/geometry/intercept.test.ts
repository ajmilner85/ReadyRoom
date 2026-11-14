import { describe, expect, it } from 'vitest';
import { interceptSolve, sternConversion, type InterceptInput } from './maneuver.ts';
import { add, bearingTo, dir, dist, mul, pathLength, sub, type Pt } from './vec.ts';

const RATES = { accel: 4, decel: 3.5 };

/** interceptee position predicted forward t seconds */
const predict = (pe: Pt, crs: number, gs: number, t: number): Pt => add(pe, mul(dir(crs), (gs * t) / 3600));

const base = (over: Partial<InterceptInput> = {}): InterceptInput => ({
  p0: [0, 0],
  h0: 0,
  v0: 350,
  vSet: 400,
  rates: RATES,
  pe: [40, -10],
  crsE: 90,
  gsE: 300,
  standoffNm: 10,
  ...over,
});

describe('interceptSolve', () => {
  it('solves a crossing intercept and ends 10 NM short of the merge', () => {
    const s = interceptSolve(base());
    expect(s.ok).toBe(true);
    // the rejoin sits one standoff before the merge, on the inbound leg
    expect(dist(s.rejoin, s.merge)).toBeCloseTo(10, 1);
    expect(s.dashed).toEqual([s.rejoin, s.merge]);
    // the solid leg starts at the interceptor and ends at the rejoin
    expect(s.solid[0][0]).toBeCloseTo(0, 6);
    expect(s.solid[0][1]).toBeCloseTo(0, 6);
    expect(dist(s.solid[s.solid.length - 1], s.rejoin)).toBeLessThan(1e-6);
  });

  it('places the merge where the interceptee will actually be', () => {
    const inp = base();
    const s = interceptSolve(inp);
    const where = predict(inp.pe, inp.crsE, inp.gsE, s.mergeS);
    expect(dist(s.merge, where)).toBeLessThan(0.3);
  });

  it('the steer heading points up the inbound leg toward the merge', () => {
    const s = interceptSolve(base());
    expect(Math.abs(((s.steerHdg - bearingTo(s.rejoin, s.merge) + 540) % 360) - 180)).toBeLessThan(1);
  });

  it('fails cleanly when the contact outruns the commanded speed', () => {
    // target 100 kt faster than the interceptor, running directly away
    const s = interceptSolve(base({ vSet: 300, pe: [0, -30], crsE: 0, gsE: 500 }));
    expect(s.ok).toBe(false);
    expect(s.solid).toEqual([]);
  });

  it('a higher commanded speed reaches the rejoin sooner', () => {
    const slow = interceptSolve(base({ vSet: 380 }));
    const fast = interceptSolve(base({ vSet: 480 }));
    expect(slow.ok && fast.ok).toBe(true);
    expect(fast.eteS).toBeLessThan(slow.eteS);
  });

  it('within the standoff it keeps the full flown path as the dashed closure (no straight collapse)', () => {
    // interceptor 3 NM dead astern of a slow target, much faster: merge is well under 10 NM away
    const s = interceptSolve(base({ p0: [0, 0], h0: 90, v0: 400, vSet: 400, pe: [3, 0], crsE: 90, gsE: 100 }));
    expect(s.ok).toBe(true);
    expect(s.distNm).toBe(0);
    expect(s.solid).toEqual([]);
    // the whole run-in is kept (integrated at 0.5 s steps), not reduced to two endpoints
    expect(s.dashed.length).toBeGreaterThan(2);
    expect(dist(s.dashed[0], [0, 0])).toBeLessThan(1e-6);
    expect(dist(s.dashed[s.dashed.length - 1], s.merge)).toBeLessThan(0.2);
  });

  it('a stern conversion on a non-maneuvering target rolls out behind it', () => {
    // interceptor 30 NM dead astern, same heading, faster: should need almost no turn
    const s = interceptSolve(base({ p0: [0, 0], h0: 0, v0: 400, vSet: 450, pe: [0, -30], crsE: 0, gsE: 250 }));
    expect(s.ok).toBe(true);
    expect(s.steerHdg).toBeCloseTo(0, 0);
  });
});

describe('sternConversion', () => {
  it('rolls out 1 NM astern, on the interceptee track and heading', () => {
    const crsE = 90;
    const r = sternConversion({ p0: [0, -5], h0: 135, vKt: 420, pe: [10, 0], crsE, gsE: 250, t0S: 0, trailNm: 1 });
    expect(r.ok).toBe(true);
    expect(r.endHdg).toBe(crsE);
    // the rollout lies on the interceptee's track line (through pe, along crsE): zero cross-track
    const u = dir(crsE);
    const rel = sub(r.end, [10, 0]);
    expect(Math.abs(u[0] * rel[1] - u[1] * rel[0])).toBeLessThan(0.05);
    // and the interceptor has settled roughly onto the target's heading before the rollout
    const n = r.path.length;
    const h = bearingTo(r.path[Math.max(0, n - 10)], r.path[n - 2]);
    expect(Math.min(Math.abs(h - crsE), 360 - Math.abs(h - crsE))).toBeLessThan(25);
  });

  it('a tail chase closes at the overtake rate, not a crawl (no speed-matching that kills closure)', () => {
    // interceptor 10 NM dead astern, co-aligned north (−y), 400 vs 311 kt (≈89 kt overtake): ~6–7 min
    const sol = interceptSolve({ p0: [0, 0], h0: 0, v0: 400, vSet: 400, rates: RATES, pe: [0, -10], crsE: 0, gsE: 311, standoffNm: 10 });
    expect(sol.ok).toBe(true);
    const stern = sternConversion({ p0: sol.rejoin, h0: sol.steerHdg, vKt: 400, pe: [0, -10], crsE: 0, gsE: 311, t0S: sol.eteS, trailNm: 1 });
    const totalMin = (sol.eteS + stern.timeS) / 60;
    expect(totalMin).toBeGreaterThan(4);
    expect(totalMin).toBeLessThan(11);
  });

  it('a fast interceptor tucks into the stern instead of orbiting the contact', () => {
    // 650 kt interceptor, slow close crossing contact: without speed-matching this orbits (~38 NM/loop)
    const r = sternConversion({ p0: [0, 0], h0: 90, vKt: 650, pe: [2, 3], crsE: 270, gsE: 267, t0S: 0, trailNm: 1 });
    expect(r.ok).toBe(true);
    // a single bounded hook; a runaway orbit at this speed/radius would be 70+ NM (multiple loops)
    expect(pathLength(r.path)).toBeLessThan(40);
  });
});
