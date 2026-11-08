import { describe, expect, it } from 'vitest';
import { autoCoordLine, coordGeom, reframe, sideOf, type CoordArea } from './coordination.ts';
import { fixDme, holdPattern } from './procedures.ts';
import { add, angDiff, P, type Pt } from './vec.ts';

/** ship points + its stack hold (241R relative, fix 21 DME), like the screenshot */
const hold = (ship: Pt, radial: number, angels = 6): CoordArea => ({ pts: holdPattern(radial, fixDme(angels), 'left').map((q) => add(q, ship)) });
const area = (ship: Pt, stackRadial: number): CoordArea[] => [{ pts: [ship], ship: true }, hold(ship, stackRadial)];
const pts = (as: CoordArea[]) => as.flatMap((a) => a.pts);

describe('coordination line', () => {
  it('separates both ships and both marshal stacks (screenshot: carriers abeam but offset along track)', () => {
    const ref: Pt = [0, 0];
    const other = P(140, 15); // CVN-72 SE of CVN-71, both on 070
    const A = area(ref, 241);
    const B = area(other, 241);
    const s = autoCoordLine(A, B, ref, other, 70);
    const g = coordGeom(s, ref, other, true);
    expect(Math.max(...pts(A).map((q) => sideOf(q, g)))).toBeLessThan(0);
    expect(Math.min(...pts(B).map((q) => sideOf(q, g)))).toBeGreaterThan(0);
    // roughly parallel to the ships' course, not the old ship-to-ship bisector (050°)
    expect(angDiff(g.brg, 70) < 25 || angDiff(g.brg + 180, 70) < 25).toBe(true);
  });

  it('runs across the gap for carriers in trail', () => {
    const ref: Pt = [0, 0];
    const other = P(70, 20); // directly ahead on the same course
    const g = coordGeom(autoCoordLine([{ pts: [ref], ship: true }], [{ pts: [other], ship: true }], ref, other, 70), ref, other, true);
    expect(angDiff(g.brg, 160) < 2 || angDiff(g.brg + 180, 160) < 2).toBe(true);
    expect(g.off).toBeCloseTo(10, 1);
  });

  it('cuts least into overlapping holds and keeps both ships well clear (emergency stack overlapping the other A stack)', () => {
    const ref: Pt = [0, 0];
    const other = P(141, 16); // measured off the screenshot
    const A = [...area(ref, 241), hold(ref, 211)]; // our A 241 and E 211
    const B = [...area(other, 241)]; // their A 241 sits under our E stack
    const g = coordGeom(autoCoordLine(A, B, ref, other, 70), ref, other, true);
    expect(sideOf(ref, g)).toBeLessThan(-5);
    expect(sideOf(other, g)).toBeGreaterThan(5);
    // our A stack is entirely on our side; the overlap is split rather than one stack swallowed
    expect(Math.max(...A[1].pts.map((q) => sideOf(q, g)))).toBeLessThan(0);
    const cutE = Math.max(...A[2].pts.map((q) => sideOf(q, g)));
    const cutB = -Math.min(...B[1].pts.map((q) => sideOf(q, g)));
    expect(cutE + cutB).toBeLessThan(5); // the overlap is only grazed, not one stack swallowed
  });

  it('reframes a line set by the other carrier into our frame', () => {
    const a: Pt = [0, 0];
    const b: Pt = [12, 9];
    const fromB = coordGeom({ brg: 70, off: 6 }, b, a);
    const s = reframe(fromB, a, b);
    const back = coordGeom(s, a, b);
    expect(Math.abs(sideOf(fromB.p0, back))).toBeLessThan(1e-9);
    expect(back.brg).toBe(70);
  });
});
