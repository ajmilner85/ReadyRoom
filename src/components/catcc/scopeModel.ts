/**
 * Pure picture model for the CATCC scope: projects wire tracks about the focus carrier, groups
 * formations, predicts conflicts and builds flight strips. No React, no DOM: unit-tested.
 */
import { aeqd, type Projection } from '../../catcc/core/geometry/projection.ts';
import { predictConflict, type Cpa } from '../../catcc/core/geometry/maneuver.ts';
import { defaultMarshalRadial, type ShipRef } from '../../catcc/core/geometry/procedures.ts';
import { angDiff, bearingOf, dir, len, type Pt } from '../../catcc/core/geometry/vec.ts';
import { norm360 } from '../../catcc/core/geo.ts';
import type { WireTrack } from '../../catcc/core/room/protocol.ts';

/** Nimitz-class angled deck: final bearing is 9° left of the BRC. */
export const ANGLED_DECK_DEG = 9;

export interface Trail {
  t: number;
  lat: number;
  lon: number;
}

export interface ScopeTrack extends WireTrack {
  p: Pt;
  /** older positions for trail dots, newest first */
  trail: Pt[];
  /** range (NM) and bearing from the focus carrier */
  rng: number;
  brg: number;
  /** hull of the nearest carrier within 60 NM (aircraft only) */
  owner?: string;
}

export interface Carrier {
  track: ScopeTrack;
  ship: ShipRef;
  focus: boolean;
}

export interface Formation {
  id: string;
  /** DCS group name */
  group: string;
  lead: ScopeTrack;
  members: ScopeTrack[];
  /** members close enough to the lead to draw as one blob */
  collapsible: boolean;
  lowFuelLb?: number;
}

export interface Conflict {
  a: ScopeTrack;
  b: ScopeTrack;
  cpa: Cpa & { latStd: number };
}

export interface Picture {
  proj?: Projection;
  focus?: Carrier;
  carriers: Carrier[];
  air: ScopeTrack[];
  formations: Formation[];
  conflicts: Conflict[];
}

const isAir = (t: WireTrack) => t.k === 'fixedwing' || t.k === 'rotary';

/** Trail dots: positions roughly every `stepS` seconds back from now. */
export function trailPoints(hist: Trail[] | undefined, nowT: number, proj: Projection, dots = 5, stepS = 6): Pt[] {
  if (!hist?.length) return [];
  const out: Pt[] = [];
  let i = hist.length - 1;
  for (let k = 1; k <= dots; k++) {
    const want = nowT - k * stepS;
    while (i > 0 && hist[i].t > want) i--;
    if (hist[i].t > want) break;
    out.push(proj.toScope(hist[i].lat, hist[i].lon));
  }
  return out;
}

export function shipRefOf(t: WireTrack): ShipRef {
  const brc = norm360(t.crs ?? t.hdg ?? 0);
  return { brc, fb: norm360(brc - ANGLED_DECK_DEG) };
}

export function buildPicture(
  tracks: WireTrack[],
  focusHull: string | undefined,
  history: Map<string, Trail[]>,
  nowT: number,
  opts: { conflictLookAheadS?: number; vertCapS?: number; floors?: Map<string, number>; trailStepS?: number } = {},
): Picture {
  const cvs = tracks.filter((t) => t.k === 'carrier').sort((a, b) => (a.hull ?? '').localeCompare(b.hull ?? ''));
  const focusTrack = cvs.find((c) => c.hull === focusHull) ?? cvs[0];
  if (!focusTrack) return { carriers: [], air: [], formations: [], conflicts: [] };
  const proj = aeqd(focusTrack.lat, focusTrack.lon);
  const toScope = (t: WireTrack): ScopeTrack => {
    const p = proj.toScope(t.lat, t.lon);
    return { ...t, p, trail: trailPoints(history.get(t.id), nowT, proj, 5, opts.trailStepS), rng: len(p), brg: bearingOf(p) };
  };
  const carriers: Carrier[] = cvs.map((c) => ({ track: toScope(c), ship: shipRefOf(c), focus: c === focusTrack }));
  const air = tracks.filter(isAir).map(toScope);
  for (const a of air) {
    let best: { hull?: string; d: number } = { d: 60 };
    for (const c of carriers) {
      const d = Math.hypot(a.p[0] - c.track.p[0], a.p[1] - c.track.p[1]);
      if (d < best.d) best = { hull: c.track.hull, d };
    }
    a.owner = best.hull;
  }
  const formations = groupFormations(air);
  const fb = carriers.find((c) => c.focus)!.ship.fb;
  const conflicts = findConflicts(air, fb, opts.conflictLookAheadS ?? 120, opts.vertCapS ?? 30, opts.floors);
  return { proj, focus: carriers.find((c) => c.focus), carriers, air, formations, conflicts };
}

/** Lead = lowest element number in the callsign (x-1), else lowest id. */
function leadOf(members: ScopeTrack[]): ScopeTrack {
  const el = (t: ScopeTrack) => {
    const m = /-(\d+)$/.exec(t.cs ?? '');
    return m ? Number(m[1]) : 99;
  };
  return [...members].sort((a, b) => el(a) - el(b) || a.id.localeCompare(b.id))[0];
}

export function groupFormations(air: ScopeTrack[], joinNm = 3): Formation[] {
  const groups = new Map<string, ScopeTrack[]>();
  for (const t of air) {
    const key = `${t.sd}|${t.g ?? t.id}`;
    const g = groups.get(key);
    if (g) g.push(t);
    else groups.set(key, [t]);
  }
  const out: Formation[] = [];
  for (const [key, members] of groups) {
    const lead = leadOf(members);
    const near = members.every((m) => Math.hypot(m.p[0] - lead.p[0], m.p[1] - lead.p[1]) <= joinNm);
    const fuels = members.map((m) => m.lb).filter((x): x is number => x !== undefined);
    out.push({
      id: key,
      group: members[0].g ?? members[0].id,
      lead,
      members,
      collapsible: members.length > 1 && near,
      lowFuelLb: fuels.length ? Math.min(...fuels) : undefined,
    });
  }
  return out;
}

/** Flying in company (tanker join-up, loose formation across groups): close, level and matched. */
export function inCompany(a: ScopeTrack, b: ScopeTrack): boolean {
  const lat = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]);
  return lat < 1.5 && Math.abs(a.alt - b.alt) < 1500 && angDiff(a.crs ?? a.hdg ?? 0, b.crs ?? b.hdg ?? 0) < 30 && Math.abs((a.gs ?? 0) - (b.gs ?? 0)) < 60;
}

export function findConflicts(air: ScopeTrack[], fb: number, lookAheadS: number, vertCapS = 30, floors?: Map<string, number>): Conflict[] {
  const cand = air.filter((t) => t.air !== false && t.rng <= 60 && (t.gs ?? 0) > 60);
  const best = new Map<string, Conflict>();
  for (let i = 0; i < cand.length; i++) {
    for (let j = i + 1; j < cand.length; j++) {
      const a = cand[i];
      const b = cand[j];
      // members of one flight fly formation: not a conflict
      if (a.g && a.g === b.g) continue;
      if (inCompany(a, b)) continue;
      const k = (t: ScopeTrack) => ({ p: t.p, crs: t.crs ?? t.hdg ?? 0, gs: t.gs ?? 0, altFt: t.alt, vsFpm: t.vs, floorFt: floors?.get(t.id) });
      const c = predictConflict(k(a), k(b), { lookAheadS, fb, vertCapS });
      if (!c) continue;
      // one alert per pair of flights: keep the worst (closest) member pair
      const key = [a.g ?? a.id, b.g ?? b.id].sort().join('|');
      const prev = best.get(key);
      if (!prev || c.latNm < prev.cpa.latNm) best.set(key, { a, b, cpa: c });
    }
  }
  return [...best.values()];
}

// ---------------------------------------------------------------- tags

const SHORT_TYPES: Record<string, string> = {
  'FA-18C_hornet': 'F18C',
  'FA-18A': 'F18A',
  'F-14B': 'F14B',
  'F-14A-135-GR': 'F14A',
  AV8BNA: 'AV8B',
  'S-3B Tanker': 'S3T',
  'S-3B': 'S3B',
  'E-2C': 'E2C',
  KC135MPRS: 'K35M',
  'KC-135': 'K35R',
  KC130: 'K130',
  'SH-60B': 'H60',
  'UH-60A': 'H60',
  'CH-47F': 'H47',
  'F-16C_50': 'F16C',
  'F-15ESE': 'F15E',
};
export const shortType = (ty: string): string => SHORT_TYPES[ty] ?? ty.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4);

export const fuelK = (lb: number | undefined): string => (lb === undefined ? '' : (lb / 1000).toFixed(1));

export function tagRows(t: ScopeTrack, formation?: Formation, collapsed = false): string[] {
  const label = t.bd ?? t.cs ?? t.pi ?? t.id;
  const fuel = t.lb !== undefined ? fuelK(t.lb) : t.f !== undefined ? `${Math.round(t.f * 100)}%` : '';
  const arrow = (t.vs ?? 0) > 300 ? '↑' : (t.vs ?? 0) < -300 ? '↓' : '';
  const rows = [`${label} ${shortType(t.ty)}${fuel ? ` ${fuel}` : ''}`, `${arrow}${String(Math.round(t.alt / 100)).padStart(3, '0')} ${Math.round(t.gs ?? 0)}`];
  if (collapsed && formation) rows.push(`FLT ×${formation.members.length}${formation.lowFuelLb !== undefined ? ` · LOW ${fuelK(formation.lowFuelLb)}` : ''}`);
  return rows;
}

// ---------------------------------------------------------------- strips

export type Phase = 'departure' | 'inbound' | 'marshal' | 'approach' | 'support' | 'other';
export const PHASE_ORDER: Phase[] = ['departure', 'inbound', 'marshal', 'approach', 'support', 'other'];
export const PHASE_LABEL: Record<Phase, string> = {
  departure: 'Departure',
  inbound: 'Inbound',
  marshal: 'Marshal',
  approach: 'Approach',
  support: 'Support',
  other: 'Other',
};

const SUPPORT = /tanker|kc1|kc-|e-2|e-3|s-3b|h-60|sh-60|uh-60|ch-47/i;

/**
 * Heuristic phase until strips are driven by ReadyRoom flight assignments and controller drag
 * (handoff §9.1): support types; assigned to marshal; inside 12 NM, low and closing = approach;
 * closing = inbound; opening inside 60 NM = departure.
 */
export function phaseOf(f: Formation, marshalled: Set<string>): Phase {
  const t = f.lead;
  if (SUPPORT.test(t.ty)) return 'support';
  if (f.members.some((m) => marshalled.has(m.id))) return 'marshal';
  const crs = t.crs ?? t.hdg ?? 0;
  const closing = angDiff(crs, norm360(t.brg + 180)) < 70;
  if (t.rng <= 12 && t.alt < 6000 && closing) return 'approach';
  if (closing) return 'inbound';
  if (t.rng <= 60) return 'departure';
  return 'other';
}

/** Default stack when none is configured: CV-1 marshal 180° relative to the FB, angels 6. */
export const defaultStack = (ship: ShipRef) => ({ id: 'A', r: Math.round(defaultMarshalRadial(ship)), base: 6 });

/** 30 s of travel, capped at 2.5 NM (handoff §5.2). */
export function velocityEnd(t: ScopeTrack): Pt | undefined {
  if (t.gs === undefined || t.gs < 20) return undefined;
  const d = Math.min(2.5, (t.gs * 30) / 3600);
  const v = dir(t.crs ?? t.hdg ?? 0);
  return [t.p[0] + v[0] * d, t.p[1] + v[1] * d];
}

/** Display-settings multipliers (handoff §8); step 2 of each slider is the default. */
export interface ScopeScale {
  hits: number;
  tags: number;
  lines: number;
  text: number;
}

export const DEFAULT_SCALE: ScopeScale = { hits: 1.3, tags: 1.3, lines: 1.5, text: 1.3 };
