import { describe, expect, it } from 'vitest';
import { orderedPath, rudderFor, SPEEDUP_KT_S, trendPath, turnRate, turnTo } from './shipTurn.ts';

describe('ship turn prediction', () => {
  it('turns faster with more rudder and speed; full rudder at 25 kt is about 1.1 deg/s (DCS R_min 665.8 m)', () => {
    expect(turnRate(25, 30)).toBeCloseTo(1.107, 2);
    expect(turnRate(25, -15)).toBeCloseTo(-0.553, 2);
    expect(rudderFor(100)).toBe(30);
    expect(turnTo(350, 10)).toBe(20);
    expect(turnTo(10, 350)).toBe(-20);
  });

  it('holding no turn runs straight ahead; a right turn bends east of north', () => {
    const s = trendPath([0, 0], 0, 30, 0, 120);
    const end = s[s.length - 1];
    expect(end[0]).toBeCloseTo(0, 6);
    expect(end[1]).toBeCloseTo(-1, 3); // 30 kt for 2 min: 1 NM north (y is south)
    const r = trendPath([0, 0], 0, 30, 0.5, 120);
    expect(r[r.length - 1][0]).toBeGreaterThan(0.3);
  });

  it('the ordered path turns onto the ordered course and steadies there', () => {
    const p = orderedPath([0, 0], 0, 25, 90, 600);
    const a = p[p.length - 2];
    const b = p[p.length - 1];
    // the last step runs due east
    expect(b[0] - a[0]).toBeGreaterThan(0);
    expect(Math.abs(b[1] - a[1])).toBeLessThan(0.002);
    // a left turn is the mirror image
    const q = orderedPath([0, 0], 0, 25, 270, 600);
    expect(q[q.length - 1][0]).toBeCloseTo(-b[0], 3);
  });

  it('follows the ordered speed: slowing shortens the path, going astern backs straight down the heading', () => {
    expect(SPEEDUP_KT_S).toBeCloseTo(0.2318, 3);
    const run = (q: [number, number][]) => q.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - q[i][0], p[1] - q[i][1]), 0);
    const fast = orderedPath([0, 0], 0, 25, 0, 180, 5, 25);
    const slow = orderedPath([0, 0], 0, 25, 0, 180, 5, 10);
    expect(run(fast)).toBeCloseTo(1.25, 2); // 25 kt for 3 min
    expect(run(slow)).toBeLessThan(run(fast) * 0.8);
    // from stopped, astern 15 kt: moves south (backwards on 000) and doesn't turn though 090 is ordered
    const back = orderedPath([0, 0], 0, 0, 90, 300, 5, -15);
    const end = back[back.length - 1];
    expect(end[1]).toBeGreaterThan(0.3);
    expect(Math.abs(end[0])).toBeLessThan(1e-9);
  });
});
