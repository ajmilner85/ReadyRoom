/**
 * CSG formation geometry (HANDOFF-2 §6.1). Stations are relative to the formation axis, which
 * follows the BRC: a sector is a band of relative bearing (from → to, clockwise) between two
 * ranges; a point is a bearing and range; free is no station. Ranges NM (2,000 yd = 1 NM).
 */
import type { EscortRole, Formation, Station } from '../room/ops.ts';

export const YD_PER_NM = 2000;
/** plane guard: 170R at 4,000 yd, astern on the final bearing */
export const PLANE_GUARD: Station = { kind: 'point', role: 'PG', b: 170, r: 2 };
/** a point station is kept within this of its spot, NM */
export const POINT_TOL_NM = 0.5;

const n360 = (b: number) => ((b % 360) + 360) % 360;
/** sector width, clockwise from b0 to b1, degrees (0 < w ≤ 360) */
export const sectorWidth = (s: { b0: number; b1: number }) => n360(s.b1 - s.b0) || 360;

export function inSector(s: { b0: number; b1: number; r0: number; r1: number }, relBrg: number, rng: number): boolean {
  return rng >= s.r0 && rng <= s.r1 && n360(relBrg - s.b0) <= sectorWidth(s);
}

/** A station's centre: the sector's middle (mid bearing, mid range), or the point. */
export function stationCentre(st: Station): { b: number; r: number } | null {
  if (st.kind === 'point') return { b: st.b, r: st.r };
  if (st.kind === 'sector') return { b: n360(st.b0 + sectorWidth(st) / 2), r: (st.r0 + st.r1) / 2 };
  return null;
}

/** Polar (relative bearing, range) to plan (x right / y forward of the axis), NM. */
const xy = (b: number, r: number): [number, number] => [r * Math.sin((b * Math.PI) / 180), r * Math.cos((b * Math.PI) / 180)];

/** Distance from a position to a station's area (0 inside), NM. */
export function distToStation(st: Station, relBrg: number, rng: number): number {
  if (st.kind === 'free') return 0;
  const [x, y] = xy(relBrg, rng);
  if (st.kind === 'point') {
    const [px, py] = xy(st.b, st.r);
    return Math.max(0, Math.hypot(x - px, y - py) - POINT_TOL_NM);
  }
  if (inSector(st, relBrg, rng)) return 0;
  // nearest point of the sector: clamp range into the band at the nearer bearing, or onto an edge
  let best = Infinity;
  const w = sectorWidth(st);
  const off = n360(relBrg - st.b0);
  const candidates: [number, number][] = [];
  if (off <= w) candidates.push([relBrg, Math.min(st.r1, Math.max(st.r0, rng))]);
  for (const edge of [st.b0, n360(st.b0 + w)]) {
    // project onto the edge ray, clamped to the band
    const [ex, ey] = xy(edge, 1);
    const t = Math.min(st.r1, Math.max(st.r0, x * ex + y * ey));
    candidates.push([edge, t]);
  }
  for (const [b, r] of candidates) {
    const [cx, cy] = xy(b, r);
    best = Math.min(best, Math.hypot(x - cx, y - cy));
  }
  return best;
}

export type StationState = { k: 'on' } | { k: 'off'; nm: number } | { k: 'free' };

/** Station-keeping: where a unit is relative to the carrier (true bearing, range) against its station. */
export function stationState(st: Station, brc: number, trueBrg: number, rng: number): StationState {
  if (st.kind === 'free') return { k: 'free' };
  const d = distToStation(st, n360(trueBrg - brc), rng);
  return d <= 0.05 ? { k: 'on' } : { k: 'off', nm: d };
}

export const PRESETS = ['Flight ops', 'Transit', 'Combat'] as const;

/**
 * Default layouts (the mockup's placeholders) for the escorts in order: CG, DDG-1, DDG-2; any more
 * escorts start free. `units` are the escorts' ids, cruisers first.
 */
export function defaultFormation(units: string[]): Formation {
  const L: Record<string, Station[]> = {
    'Flight ops': [
      { kind: 'sector', role: 'AAW', b0: 330, b1: 30, r0: 4, r1: 8 },
      { kind: 'sector', role: 'AAW', b0: 35, b1: 75, r0: 9, r1: 15 },
      PLANE_GUARD,
    ],
    Transit: [
      { kind: 'sector', role: 'AAW', b0: 330, b1: 30, r0: 6, r1: 10 },
      { kind: 'sector', role: 'ASW', b0: 240, b1: 300, r0: 6, r1: 10 },
      { kind: 'sector', role: 'ASW', b0: 60, b1: 120, r0: 6, r1: 10 },
    ],
    Combat: [
      { kind: 'sector', role: 'AAW', b0: 10, b1: 50, r0: 12, r1: 20 },
      { kind: 'sector', role: 'AAW', b0: 300, b1: 340, r0: 10, r1: 18 },
      { kind: 'sector', role: 'ASW', b0: 160, b1: 200, r0: 6, r1: 12 },
    ],
  };
  const presets: Formation['presets'] = {};
  for (const p of PRESETS) presets[p] = Object.fromEntries(units.map((u, i) => [u, L[p][i] ?? ({ kind: 'free', role: 'AAW' } as Station)]));
  return { active: 'Flight ops', presets };
}

/** The formation for these escorts: the stored one, filled in with defaults for escorts it doesn't know. */
export function formationFor(stored: Formation | undefined, units: string[]): Formation {
  const def = defaultFormation(units);
  if (!stored) return def;
  const presets: Formation['presets'] = {};
  for (const p of new Set([...PRESETS, ...Object.keys(stored.presets)])) {
    presets[p] = Object.fromEntries(units.map((u) => [u, stored.presets[p]?.[u] ?? def.presets[p]?.[u] ?? ({ kind: 'free', role: 'AAW' } as Station)]));
  }
  return { active: presets[stored.active] ? stored.active : 'Flight ops', presets };
}

export const ROLE_LABEL: Record<EscortRole, string> = { AAW: 'AAW', ASW: 'ASW', PG: 'Plane guard', PKT: 'Picket' };

const r3 = (n: number) => String(Math.round(n360(n)) % 360).padStart(3, '0');
export const ydOf = (nm: number) => Math.round((nm * YD_PER_NM) / 50) * 50;
/** "330–030R · 4–8 NM", "170R · 4,000 YD", "FREE" */
export function stationText(st: Station): string {
  if (st.kind === 'free') return 'FREE';
  if (st.kind === 'point') return `${r3(st.b)}R · ${st.r < 3 ? `${ydOf(st.r).toLocaleString('en-US')} YD` : `${st.r} NM`}`;
  return `${r3(st.b0)}–${r3(st.b1)}R · ${st.r0}–${st.r1} NM`;
}
