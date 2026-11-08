/**
 * Data-tag deconfliction (handoff §5.3 backlog "automatic tag placement"). Tags keep the
 * mockup's geometry: 45° leader on an intercardinal, starting 0.7 from the hit; the box starts
 * (east) or ends (west) at the leader end with the first row centred on it. Each tag chooses a
 * quadrant and a leader length so that no two tags overlap, avoiding other hits and the view
 * edge where possible. Units: "ref" units scaled by k (NM per ref unit) about the hit.
 */
import type { Pt } from '../../../catcc/core/geometry/vec.ts';

export interface TagSpec {
  id: string;
  /** hit position, scope NM */
  p: Pt;
  /** box size in ref units */
  w: number;
  h: number;
  /** unit vector of the velocity, scope coords (tags prefer the opposite side) */
  v?: Pt;
  /** lower = placed first */
  priority: number;
}

export interface TagPlace {
  /** quadrant: [±1, ±1] (x east, y south) */
  q: Pt;
  /** leader length, ref units (leader runs from 0.7 to L along the 45° diagonal) */
  L: number;
}

export const LEADER_LENGTHS = [2.4, 3.8, 5.2, 6.8];
const QUADS: Pt[] = [
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Tag box (scope NM) for a placement. */
export function tagBox(t: { p: Pt; w: number; h: number }, pl: TagPlace, k: number): Box {
  const s = Math.SQRT1_2;
  const ex = pl.q[0] * pl.L * s;
  const ey = pl.q[1] * pl.L * s;
  const rx = pl.q[0] > 0 ? ex + 0.05 : ex - 0.05 - t.w;
  const ry = ey + 0.32 - 0.85;
  return { x0: t.p[0] + rx * k, y0: t.p[1] + ry * k, x1: t.p[0] + (rx + t.w) * k, y1: t.p[1] + (ry + t.h) * k };
}

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const area = (a: Box) => (a.x1 - a.x0) * (a.y1 - a.y0);

/**
 * Greedy placement in priority order. `prev` keeps last frame's choices so tags don't jump:
 * a previous placement that is still clear wins.
 */
export function layoutTags(
  tags: TagSpec[],
  opts: { k: number; hitK: number; view: Box; prev?: Map<string, TagPlace>; obstacles?: Pt[] },
): Map<string, TagPlace> {
  const { k, hitK, view, prev } = opts;
  const placed: Box[] = [];
  const out = new Map<string, TagPlace>();
  const hits = opts.obstacles ?? tags.map((t) => t.p);
  const HR = 0.8; // hit symbol half-size plus a little clearance, ref units
  const hitBox = (p: Pt): Box => ({ x0: p[0] - HR * hitK, y0: p[1] - HR * hitK, x1: p[0] + HR * hitK, y1: p[1] + HR * hitK });
  const hitArea = (2 * HR * hitK) ** 2;
  const sorted = [...tags].sort((a, b) => a.priority - b.priority);
  for (const t of sorted) {
    let best: { pl: TagPlace; score: number } | null = null;
    const cands: TagPlace[] = [];
    const pv = prev?.get(t.id);
    if (pv) cands.push(pv);
    for (const L of LEADER_LENGTHS) for (const q of QUADS) cands.push({ q, L });
    for (const pl of cands) {
      const b = tagBox(t, pl, k);
      const a = area(b);
      let tagOv = 0;
      for (const o of placed) tagOv += overlap(b, o);
      // other aircraft covered by this tag, each as a fraction of its own symbol: covering any
      // part of a hit costs far more than a longer leader or giving up last frame's spot
      let hitCov = 0;
      for (const h of hits) if (h !== t.p) hitCov += overlap(b, hitBox(h)) / hitArea;
      const outside = a - overlap(b, view);
      const along = t.v ? pl.q[0] * t.v[0] + pl.q[1] * t.v[1] : 0; // -2 (opposite) .. +2 (on the vector)
      const clear = tagOv === 0 && hitCov === 0;
      const score =
        (tagOv / a) * 1000 + // never on another tag
        (hitCov > 0 ? 60 + hitCov * 200 : 0) + // keep other aircraft visible
        (outside / a) * 200 + // stay on the scope
        along * 3 + // away from the velocity vector
        (pl.L - LEADER_LENGTHS[0]) * 1.5 - // short leaders preferred
        (pv && pl === pv && clear ? 8 : 0); // stickiness only for a previous placement that is still clear
      if (!best || score < best.score) best = { pl, score };
    }
    out.set(t.id, best!.pl);
    placed.push(tagBox(t, best!.pl, k));
  }
  return out;
}
