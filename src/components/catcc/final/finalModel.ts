/**
 * Approach / Final picture: each aircraft working the focus carrier placed in the final frame and
 * classed as an arrival (on final or inbound to it), a bolter on the downwind, one climbing out on the
 * upwind (bolter or waveoff, ahead of the ship), or other traffic.
 */
import { finalPos, timeToBall, turnWithWind, windVec, APPROACH_KT, slotWindow, upwindWindow, UPWIND_TURN_IN_NM, type FinalPos, type SlotResult } from '../../../catcc/core/geometry/slot.ts';
import type { CarrierWx } from '../../../catcc/core/dcs/hookProtocol.ts';
import { angDiff, type Pt } from '../../../catcc/core/geometry/vec.ts';
import { turnRadiusNm } from '../../../catcc/core/geometry/maneuver.ts';
import type { Picture, ScopeTrack } from '../scopeModel.ts';
import { SPN46_CHANNELS } from '../radar/spn46.ts';

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
  kind: 'final' | 'inbound' | 'bolter' | 'upwind' | 'other';
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
  /** climbing out ahead of the ship (bolter, waveoff), nearest the ship first */
  upwinds: FinalAc[];
  /** the ship's weather (winds at the deck and 2,000 ft) */
  wx?: CarrierWx;
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
    // past the ship on the final bearing, low, opening ahead: the upwind leg
    if (angDiff(crs, fb) < 40 && f.along < 0.3 && f.along > -6 && Math.abs(f.lat) < 1.5 && f.alongKt < -40 && t.alt < 3000) kind = 'upwind';
    else if (angDiff(crs, fb + 180) < 40 && f.along > -1 && f.along < 12 && Math.abs(f.lat) > 0.5 && Math.abs(f.lat) < 5 && t.alt < 3000) kind = 'bolter';
    // arrivals fly the approach profile: an aircraft well above it (a tanker overhead) isn't one
    else if (f.along > 0.3 && f.along < 40 && angDiff(crs, fb) < 60 && f.closureKt > 40 && t.alt < profileAlt(f.along) + 2500) {
      const offDeg = Math.abs((Math.atan2(f.lat, f.along) * 180) / Math.PI);
      kind = f.along <= 12 && offDeg < 6 ? 'final' : 'inbound';
    }
    acs.push({ t, f, kind, tBall: kind === 'final' || kind === 'inbound' ? timeToBall(f.along, f.closureKt, vFinal) : null });
  }
  const arrivals = acs.filter((a) => a.tBall !== null).sort((a, b) => a.tBall! - b.tBall!);
  const bolters = acs.filter((a) => a.kind === 'bolter').sort((a, b) => a.f.along - b.f.along);
  const upwinds = acs.filter((a) => a.kind === 'upwind').sort((a, b) => b.f.along - a.f.along);
  const cp = c.track.p;
  const toFinal = (p: Pt): [number, number] => {
    const f = finalPos([p[0] - cp[0], p[1] - cp[1]], fb, { crs: 0, gs: 0 }, { crs: 0, gs: 0 });
    return [f.along, f.lat];
  };
  return { fb, ship, vFinal, acs, arrivals, bolters, upwinds, toFinal, wx: c.track.wx };
}

/**
 * CV NATOPS (NAVAIR 00-80T-105) 3.3 separation for an aircraft under positive radar control:
 * lateral 1-1/2 NM established on final within 5 NM, 2 NM on a designated approach or the
 * downwind inside 12 NM, otherwise 3 NM (under 50 NM from the antenna) or 5 NM; vertical 1,000 ft,
 * 800 ft inside 10 NM.
 */
export function sepStd(a: FinalAc): { nm: number; ft: number } {
  const d = Math.hypot(a.f.along, a.f.lat);
  const nm = a.kind === 'final' && d <= 5 ? 1.5 : d <= 12 && a.kind !== 'other' ? 2 : d < 50 ? 3 : 5;
  return { nm, ft: d <= 10 ? 800 : 1000 };
}

/** Whether another aircraft is inside an aircraft's separation bubble: closer than both standards. */
export function sepViolated(a: FinalAc, others: FinalAc[]): boolean {
  const s = sepStd(a);
  return others.some((o) => o !== a && Math.hypot(o.f.along - a.f.along, o.f.lat - a.f.lat) < s.nm && Math.abs(o.t.alt - a.t.alt) < s.ft);
}

/** Aircraft in the carrier's pattern (arrivals and bolters) are approach traffic, whatever their sortie phase says. */
export function patternIds(fp: FinalPicture | null): Set<string> {
  return new Set((fp?.acs ?? []).filter((a) => a.kind !== 'other' && (a.kind !== 'inbound' || a.f.along <= 25)).map((a) => a.t.id));
}

/** The slot window for a bolter against the arrivals. */
const KT_PER_MS = 1 / 0.514444;

/** Wind (kt, the way it blows) at an altitude: the deck wind blended toward the 2,000 ft wind. */
export function windAt(wx: CarrierWx | undefined, altFt: number): Pt | null {
  if (!wx || wx.d0 == null || wx.s0 == null) return null;
  const w0 = windVec(wx.d0, wx.s0 * KT_PER_MS);
  if (wx.d2 == null || wx.s2 == null) return w0;
  const w2 = windVec(wx.d2, wx.s2 * KT_PER_MS);
  const f = Math.max(0, Math.min(1, altFt / 2000));
  return [w0[0] + (w2[0] - w0[0]) * f, w0[1] + (w2[1] - w0[1]) * f];
}

export function bolterSlot(fp: FinalPicture, b: FinalAc): SlotResult & { tas: number; latDrift: number } {
  // the turn flown at true airspeed in the wind at its altitude, while the air mass and the ship move
  const turn = turnWithWind({ crs: b.t.crs ?? b.t.hdg ?? 0, gs: b.t.gs ?? 150 }, fp.ship, fp.fb, windAt(fp.wx, b.t.alt));
  const tTurn = turn.tTurn;
  // turn-in points are DME (distance from the ship), abeam on the downwind: range along the final = √(DME² − offset²)
  const off = Math.abs(b.f.lat);
  const options = BOLTER_DME.filter((d) => d > off).map((d) => ({ key: `${d} DME`, x: Math.sqrt(d * d - off * off) }));
  const r = slotWindow(
    { r0: Math.max(0, b.f.along), vDw: Math.max(60, b.f.alongKt), tTurn, vFinal: fp.vFinal, drift: turn.drift },
    fp.arrivals.map((a) => ({ id: a.t.bd ?? a.t.cs ?? a.t.id, t: a.tBall! })),
    { options },
  );
  return { ...r, tas: turn.tas, latDrift: turn.latDrift };
}

/**
 * When to turn an aircraft on the upwind downwind: the window of range ahead (NM) against the
 * arrivals, assuming it turns in to final at 6 DME. Turns at true airspeed in the wind at its
 * altitude; the downwind opening speed from that airspeed, the wind and the ship's motion.
 */
export function upwindSlot(fp: FinalPicture, u: FinalAc): SlotResult & { x0: number; offNm: number } {
  const crs = u.t.crs ?? u.t.hdg ?? fp.fb;
  const wind = windAt(fp.wx, u.t.alt);
  const up = turnWithWind({ crs, gs: u.t.gs ?? 150 }, fp.ship, fp.fb, wind);
  // the downwind leg, flown on the reciprocal at the same airspeed
  const D = Math.PI / 180;
  const w: Pt = wind ?? [0, 0];
  const dwV: Pt = [Math.sin((fp.fb + 180) * D) * up.tas + w[0], -Math.cos((fp.fb + 180) * D) * up.tas + w[1]];
  const dwCrs = (Math.atan2(dwV[0], -dwV[1]) / D + 360) % 360;
  const dwGs = Math.hypot(dwV[0], dwV[1]);
  const vDw = finalPos([0, 0], fp.fb, { crs: dwCrs, gs: dwGs }, fp.ship).alongKt;
  const dn = turnWithWind({ crs: dwCrs, gs: dwGs }, fp.ship, fp.fb, wind);
  // abeam on the downwind a turn's diameter out: 6 DME there is √(36 − offset²) along the final
  const off = 2 * turnRadiusNm(Math.max(100, up.tas), 25);
  const x0 = Math.sqrt(Math.max(1, UPWIND_TURN_IN_NM ** 2 - off * off));
  const r = upwindWindow(
    { u0: Math.max(0, -u.f.along), vUp: -u.f.alongKt, vDw, tTurn: up.tTurn, vFinal: fp.vFinal, d1: up.drift, d2: dn.drift, x0 },
    fp.arrivals.map((a) => ({ id: a.t.bd ?? a.t.cs ?? a.t.id, t: a.tBall! })),
    { options: UPWIND_DME.map((d) => ({ key: `${d} NM`, x: d })) },
  );
  return { ...r, x0, offNm: off };
}

/** The AZ/EL scope's coverage: out to 6 NM of the glidepath origin, ±6° in azimuth, ±3° about the glideslope. */
export const AZEL_NM = 6;
export const AZEL_AZ_DEG = 6;
export const AZEL_EL_DEG = 3;

export interface GlideDev {
  /** azimuth (localizer) deviation, °: right of course (the pilot's right, inbound) positive */
  az: number;
  /** elevation (glideslope) deviation, °: above the glidepath positive */
  el: number;
  /** range from the glidepath origin over the ground, NM */
  r: number;
}

/**
 * Angular deviation from the glidepath centreline, seen from its origin: the touchdown point
 * (along 0, lat 0 in the final frame, 0 ft, as on the Elevation and Azimuth scopes). Null at or
 * past the origin, where there are no angles to measure.
 */
export function glideDeviation(along: number, lat: number, altFt: number): GlideDev | null {
  if (along <= 0.05) return null;
  const r = Math.hypot(along, lat);
  const D = 180 / Math.PI;
  return { az: Math.atan2(lat, along) * D, el: Math.atan2(altFt / 6076.12, r) * D - GS_DEG, r };
}

/** the AZ/EL plot's half-width in display units (viewBox 400 × 400, centre 200 200) */
export const AZEL_HALF = 170;
/**
 * Where a deviation is drawn on the AZ/EL display (viewBox 400 × 400): as seen from the ship looking
 * out along the approach, so high is up but azimuth is mirrored. An aircraft right of course (the
 * pilot's right, inbound, az +) is drawn left of centre.
 */
export const azElX = (az: number) => 200 - (az / AZEL_AZ_DEG) * AZEL_HALF;
export const azElY = (el: number) => 200 - (el / AZEL_EL_DEG) * AZEL_HALF;

export interface AzElContact {
  a: FinalAc;
  dev: GlideDev;
}

/** Aircraft inside the AZ/EL scope's coverage, nearest the origin first: the first is the primary contact, the rest ghosts. */
export function azElPicture(fp: FinalPicture | null): AzElContact[] {
  const out: AzElContact[] = [];
  for (const a of fp?.acs ?? []) {
    const dev = glideDeviation(a.f.along, a.f.lat, a.t.alt);
    if (!dev || dev.r > AZEL_NM || Math.abs(dev.az) > AZEL_AZ_DEG || Math.abs(dev.el) > AZEL_EL_DEG) continue;
    out.push({ a, dev });
  }
  return out.sort((x, y) => x.dev.r - y.dev.r);
}

/** A row of the AZ/EL track table: an aircraft the SPN-46 holds, its ground range from the glidepath origin. */
export interface AzElTrack {
  a: FinalAc;
  /** NM over the ground from the glidepath origin */
  r: number;
  /** where it is on the scope; null while it is outside the AZ/EL field (the SPN-46 locks out to 8 NM, the scope shows 6) */
  dev: GlideDev | null;
}

export interface AzElSelection {
  /** the contact drawn bright, with its trail and tag; null when the primary track is outside the field */
  prim: AzElContact | null;
  /** everything else in the field */
  ghosts: AzElContact[];
  /** the table: the held aircraft, nearest first, at most the SPN-46's two channels */
  tracked: AzElTrack[];
  /** the primary row's aircraft id */
  primaryId: string | null;
  /** the primary track is not the nearest one */
  notNearest: boolean;
}

/**
 * The AZ/EL display's contacts and track table. With the SPN-46 holding aircraft (`locks`, as the
 * Landing aids LOCK-ON list shows them), the table lists them nearest first and the primary is the one
 * picked (`pick`), or the nearest when nothing is picked or the pick is no longer held; every other
 * aircraft in the field, held or not, is a ghost. With nothing held (ACLS off, or nobody in the gate)
 * the table is empty and the nearest aircraft in the field is the contact, as before.
 */
export function azElSelect(fp: FinalPicture | null, locks: readonly string[] | null | undefined, pick: string | null | undefined): AzElSelection {
  const field = azElPicture(fp);
  const tracked: AzElTrack[] = (fp?.acs ?? [])
    .filter((a) => locks?.includes(a.t.id))
    .map((a) => ({ a, r: Math.hypot(a.f.along, a.f.lat), dev: field.find((c) => c.a === a)?.dev ?? null }))
    .sort((x, y) => x.r - y.r)
    .slice(0, SPN46_CHANNELS);
  if (!tracked.length) return { prim: field[0] ?? null, ghosts: field.slice(1), tracked, primaryId: null, notNearest: false };
  const primary = tracked.find((k) => k.a.t.id === pick) ?? tracked[0];
  const prim = field.find((c) => c.a === primary.a) ?? null;
  return { prim, ghosts: field.filter((c) => c !== prim), tracked, primaryId: primary.a.t.id, notNearest: primary !== tracked[0] };
}

/** turn-downwind ranges offered for an aircraft on the upwind, NM ahead */
export const UPWIND_DME = [1.5, 2.5, 3.5];

/** turn-in DMEs offered for a bolter */
export const BOLTER_DME = [4, 6, 8];

/** DME (distance from the ship) at a range along the final, for an aircraft offset `lat` NM. */
export const dmeAt = (x: number, lat: number) => Math.hypot(x, lat);

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
