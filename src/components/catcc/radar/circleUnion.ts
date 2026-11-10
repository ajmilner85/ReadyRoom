/**
 * The outline of a union of circles, as arcs (for the radar blind-spot layer: coverage circles of the
 * donors). Filling a view rectangle plus these loops with the even-odd rule paints exactly the area
 * outside every circle, so no SVG mask is needed (masks are re-rasterised on every pan frame).
 *
 * Angles are radians in SVG coordinates (x right, y down): a point is c + r (cos a, sin a), and an
 * increasing angle runs clockwise on screen (SVG arc sweep flag 1).
 */
type Pt = [number, number];

export interface Circle {
  c: Pt;
  r: number;
}

/** A piece of a circle's edge from a0 to a1 (a1 > a0, at most a0 + 2π). */
export interface Arc {
  c: Pt;
  r: number;
  a0: number;
  a1: number;
}

const TAU = Math.PI * 2;
const at = (c: Pt, r: number, a: number): Pt => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];

/** The arcs of the circles' edges that lie inside no other circle: the union's boundary. */
export function unionArcs(input: Circle[]): Arc[] {
  // drop empty and duplicate circles (two donors at one spot with one range)
  const cs: Circle[] = [];
  for (const k of input) {
    if (!(k.r > 0)) continue;
    if (cs.some((o) => Math.hypot(o.c[0] - k.c[0], o.c[1] - k.c[1]) < 1e-9 && Math.abs(o.r - k.r) < 1e-9)) continue;
    cs.push(k);
  }
  const out: Arc[] = [];
  for (let i = 0; i < cs.length; i++) {
    const { c, r } = cs[i];
    const eps = 1e-9 * Math.max(1, r);
    const inside = (p: Pt, skip: number) => cs.some((o, j) => j !== skip && Math.hypot(p[0] - o.c[0], p[1] - o.c[1]) < o.r - eps);
    // wholly inside another circle: none of its edge is on the boundary
    if (cs.some((o, j) => j !== i && Math.hypot(o.c[0] - c[0], o.c[1] - c[1]) + r <= o.r + eps)) continue;
    const cuts: number[] = [];
    for (let j = 0; j < cs.length; j++) {
      if (j === i) continue;
      const o = cs[j];
      const dx = o.c[0] - c[0];
      const dy = o.c[1] - c[1];
      const d = Math.hypot(dx, dy);
      if (d >= r + o.r || d <= Math.abs(r - o.r)) continue;
      const base = Math.atan2(dy, dx);
      const h = Math.acos(Math.max(-1, Math.min(1, (r * r + d * d - o.r * o.r) / (2 * r * d))));
      cuts.push(((base - h) % TAU + TAU) % TAU, ((base + h) % TAU + TAU) % TAU);
    }
    if (!cuts.length) {
      if (!inside(at(c, r, 0), i)) out.push({ c, r, a0: 0, a1: TAU });
      continue;
    }
    cuts.sort((a, b) => a - b);
    for (let k = 0; k < cuts.length; k++) {
      const a0 = cuts[k];
      const a1 = k + 1 < cuts.length ? cuts[k + 1] : cuts[0] + TAU;
      if (a1 - a0 < 1e-12) continue;
      if (!inside(at(c, r, (a0 + a1) / 2), i)) out.push({ c, r, a0, a1 });
    }
  }
  return out;
}

const f = (n: number) => (Math.round(n * 1000) / 1000).toString();

/** SVG path for one arc, starting with a move to its start unless `cont`. Full circles as two halves. */
export function arcPath(a: Arc, cont = false): string {
  const s = at(a.c, a.r, a.a0);
  let d = cont ? '' : `M${f(s[0])} ${f(s[1])}`;
  const span = a.a1 - a.a0;
  if (span >= TAU - 1e-9) {
    const m = at(a.c, a.r, a.a0 + Math.PI);
    return `${d}A${f(a.r)} ${f(a.r)} 0 0 1 ${f(m[0])} ${f(m[1])}A${f(a.r)} ${f(a.r)} 0 0 1 ${f(s[0])} ${f(s[1])}`;
  }
  const e = at(a.c, a.r, a.a1);
  d += `A${f(a.r)} ${f(a.r)} 0 ${span > Math.PI ? 1 : 0} 1 ${f(e[0])} ${f(e[1])}`;
  return d;
}

/** Closed loops of the union's boundary, chained end to start, as one path ("M…A…A…Z M…"). */
export function unionLoopsPath(arcs: Arc[]): string {
  const left = [...arcs];
  const parts: string[] = [];
  while (left.length) {
    const first = left.shift()!;
    let d = arcPath(first);
    if (first.a1 - first.a0 < TAU - 1e-9) {
      let cur = first;
      for (let guard = 0; guard < 1000; guard++) {
        const end = at(cur.c, cur.r, cur.a1);
        const tol = 1e-6 * Math.max(1, cur.r);
        const s0 = at(first.c, first.r, first.a0);
        if (Math.hypot(end[0] - s0[0], end[1] - s0[1]) < tol && cur !== first) break;
        let bi = -1;
        let bd = Infinity;
        for (let k = 0; k < left.length; k++) {
          const s = at(left[k].c, left[k].r, left[k].a0);
          const dd = Math.hypot(end[0] - s[0], end[1] - s[1]);
          if (dd < bd) {
            bd = dd;
            bi = k;
          }
        }
        if (bi < 0 || bd > 1e-4 * Math.max(1, cur.r)) break;
        cur = left.splice(bi, 1)[0];
        d += arcPath(cur, true);
      }
    }
    parts.push(`${d}Z`);
  }
  return parts.join('');
}

/**
 * The part of an arc inside the angular window [w0, w1] (w1 > w0) of the same circle, or null.
 * Used to stroke only what is in view.
 */
export function clipArc(a: Arc, w0: number, w1: number): Arc[] {
  const out: Arc[] = [];
  for (const k of [-1, 0, 1]) {
    const lo = Math.max(a.a0, w0 + k * TAU);
    const hi = Math.min(a.a1, w1 + k * TAU);
    if (hi - lo > 1e-9) out.push({ ...a, a0: lo, a1: hi });
  }
  return out;
}
