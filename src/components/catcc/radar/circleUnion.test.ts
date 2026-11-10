import { describe, expect, it } from 'vitest';
import { clipArc, unionArcs, unionLoopsPath } from './circleUnion.ts';

const len = (arcs: { r: number; a0: number; a1: number }[]) => arcs.reduce((s, a) => s + a.r * (a.a1 - a.a0), 0);

describe('union of circles', () => {
  it('a lone circle is its own outline; one inside another adds nothing', () => {
    const a = unionArcs([{ c: [0, 0], r: 10 }, { c: [2, 0], r: 3 }]);
    expect(a).toHaveLength(1);
    expect(len(a)).toBeCloseTo(2 * Math.PI * 10, 6);
  });

  it('two overlapping circles: the outer arcs only, chained into one closed loop', () => {
    // centres 10 apart, radius 10: each loses the 120° inside the other
    const a = unionArcs([{ c: [0, 0], r: 10 }, { c: [10, 0], r: 10 }]);
    expect(a).toHaveLength(2);
    expect(len(a)).toBeCloseTo(2 * (2 * Math.PI * 10 * (240 / 360)), 6);
    const d = unionLoopsPath(a);
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d.match(/Z/g)).toHaveLength(1);
  });

  it('separate circles are separate loops; duplicates count once', () => {
    const d = unionLoopsPath(unionArcs([{ c: [0, 0], r: 5 }, { c: [0, 0], r: 5 }, { c: [50, 0], r: 5 }]));
    expect(d.match(/M/g)).toHaveLength(2);
  });

  it('a ring of circles leaves a hole: an outer loop and an inner loop', () => {
    const cs = Array.from({ length: 6 }, (_, i) => ({ c: [20 * Math.cos((i * Math.PI) / 3), 20 * Math.sin((i * Math.PI) / 3)] as [number, number], r: 12 }));
    const d = unionLoopsPath(unionArcs(cs));
    expect(d.match(/M/g)).toHaveLength(2);
  });

  it('clips an arc to a window, across the 0/2π seam', () => {
    const arc = { c: [0, 0] as [number, number], r: 1, a0: 0, a1: 2 * Math.PI };
    const parts = clipArc(arc, -0.5, 0.5);
    expect(len(parts)).toBeCloseTo(1, 6);
  });
});
