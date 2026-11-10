/**
 * Approach / Final picture: each aircraft working the focus carrier placed in the final frame and
 * classed as an arrival (on final or inbound to it), a bolter on the downwind, or other traffic.
 */
import { finalPos, timeToBall, turnS, APPROACH_KT, slotWindow, type FinalPos, type SlotResult } from '../../../catcc/core/geometry/slot.ts';
import { angDiff, type Pt } from '../../../catcc/core/geometry/vec.ts';
import type { Picture, ScopeTrack } from '../scopeModel.ts';

export const GS_DEG = 3.5;
/** feet per NM of the 3.5° glidepath */
export const GP_FT_PER_NM = Math.tan((GS_DEG * Math.PI) / 180) * 6076.12;
/** the Case III profile: A6 at 21 DME, platform 5,000 at 20, 1,200 by 12, level to the glidepath */
export const PROFILE: [number, number][] = [
  [21, 6000],
  [20, 5000],
  [12.1, 1200],
  [1200 / GP_FT_PER_NM, 1200],
];
export const profileAlt = (r: number): number => {
  if (r >= PROFILE[0][0]) return PROFILE[0][1];
  for (let i = 1; i < PROFILE.length; i++) {
    const [r0, a0] = PROFILE[i - 1];
    const [r1, a1] = PROFILE[i];
    if (r >= r1) return a1 + ((a0 - a1) * (r - r1)) / (r0 - r1);
  }
  return r * GP_FT_PER_NM;
};

export interface FinalAc {
  t: ScopeTrack;
  f: FinalPos;
  kind: 'final' | 'inbound' | 'bolter' | 'other';
  /** s to the ¾ NM point (arrivals) */
  tBall: number | null;
}

export interface FinalPicture {
  fb: number;
  ship: { crs: number; gs: number };
  /** approach speed relative to the ship on final, kt */
  vFinal: number;
  acs: FinalAc[];
  arrivals: FinalAc[];
  bolters: FinalAc[];
  /** a scope point (NM) as [along final, lateral] about the carrier: astern and right of the final bearing positive */
  toFinal: (p: Pt) => [number, number];
}

export function finalPicture(pic: Picture): FinalPicture | null {
  const c = pic.focus;
  if (!c) return null;
  const fb = c.ship.fb;
  const ship = { crs: c.track.crs ?? c.track.hdg ?? c.ship.brc, gs: c.track.gs ?? 0 };
  const vFinal = Math.max(80, APPROACH_KT - ship.gs);
  const acs: FinalAc[] = [];
  for (const t of pic.air) {
    if (t.air === false || (t.gs ?? 0) < 60) continue;
    if (t.owner && t.owner !== c.track.hull) continue;
    const rel: Pt = [t.p[0] - c.track.p[0], t.p[1] - c.track.p[1]];
    if (Math.hypot(...rel) > 45) continue;
    const crs = t.crs ?? t.hdg ?? 0;
    const f = finalPos(rel, fb, { crs, gs: t.gs ?? 0 }, ship);
    let kind: FinalAc['kind'] = 'other';
    if (angDiff(crs, fb + 180) < 40 && f.along > -1 && f.along < 12 && Math.abs(f.lat) > 0.5 && Math.abs(f.lat) < 5 && t.alt < 3000) kind = 'bolter';
    // arrivals fly the approach profile: an aircraft well above it (a tanker overhead) isn't one
    else if (f.along > 0.3 && f.along < 40 && angDiff(crs, fb) < 60 && f.closureKt > 40 && t.alt < profileAlt(f.along) + 2500) {
      const offDeg = Math.abs((Math.atan2(f.lat, f.along) * 180) / Math.PI);
      kind = f.along <= 12 && offDeg < 6 ? 'final' : 'inbound';
    }
    acs.push({ t, f, kind, tBall: kind === 'final' || kind === 'inbound' ? timeToBall(f.along, f.closureKt, vFinal) : null });
  }
  const arrivals = acs.filter((a) => a.tBall !== null).sort((a, b) => a.tBall! - b.tBall!);
  const bolters = acs.filter((a) => a.kind === 'bolter').sort((a, b) => a.f.along - b.f.along);
  const cp = c.track.p;
  const toFinal = (p: Pt): [number, number] => {
    const f = finalPos([p[0] - cp[0], p[1] - cp[1]], fb, { crs: 0, gs: 0 }, { crs: 0, gs: 0 });
    return [f.along, f.lat];
  };
  return { fb, ship, vFinal, acs, arrivals, bolters, toFinal };
}

/** Aircraft in the carrier's pattern (arrivals and bolters) are approach traffic, whatever their sortie phase says. */
export function patternIds(fp: FinalPicture | null): Set<string> {
  return new Set((fp?.acs ?? []).filter((a) => a.kind !== 'other' && (a.kind !== 'inbound' || a.f.along <= 25)).map((a) => a.t.id));
}

/** The slot window for a bolter against the arrivals. */
export function bolterSlot(fp: FinalPicture, b: FinalAc): SlotResult {
  return slotWindow(
    { r0: Math.max(0, b.f.along), vDw: Math.max(60, b.f.alongKt), tTurn: turnS(b.t.gs ?? 150), vFinal: fp.vFinal },
    fp.arrivals.map((a) => ({ id: a.t.bd ?? a.t.cs ?? a.t.id, t: a.tBall! })),
  );
}

/** Empty weight (lb) by DCS type, for the arresting-gear setting (empty + fuel + ~2,000 lb of stores). */
const EMPTY_LB: [RegExp, number][] = [
  [/^(FA-18|F\/A-18|EA-18G|EA_18G)/i, 24700],
  [/^F-14/i, 43700],
  [/^F-35C/i, 34800],
  [/^E-2/i, 40200],
  [/^S-3B/i, 26600],
  [/^(C2A|C-2A)/i, 33700],
  [/^T-45/i, 9400],
  [/^Rafale_M/i, 23100],
  [/^A-4E/i, 10800],
];
export function landingWeightLb(type: string, fuelLb?: number): number | null {
  const e = EMPTY_LB.find(([re]) => re.test(type))?.[1];
  if (e === undefined) return null;
  return Math.round((e + (fuelLb ?? 0) + 2000) / 500) * 500;
}
