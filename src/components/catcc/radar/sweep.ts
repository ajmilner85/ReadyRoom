/**
 * Realistic radar update rate: hits repaint only when the antenna sweeps past them.
 *
 * Nimitz-class CATCC's marshal/approach-control search radar is the AN/SPN-43, whose antenna turns
 * at 15 RPM (a 4-second scan). The sweep is driven by the wall clock so every module and the
 * sweep line overlay agree on its bearing. Bearings are measured from the reference carrier.
 * On the Approach / Final display the ACLS radar (AN/SPN-46, spn46.ts) also paints: it tracks up to
 * two aircraft on final continuously, so those repaint every data frame.
 */
import { useEffect, useRef, useState } from 'react';
import { bearingDeg, distanceNm } from '../../../catcc/core/geo.ts';
import type { WireTrack } from '../../../catcc/core/room/protocol.ts';
import { SHIP_HISTORY_S, type Trail } from '../scopeModel.ts';
import { antennaFtOf, coverageNm, radarOf, type RadarSpec } from '../../../catcc/core/sensors/radar.ts';
import { spn46Locks, spn46Radar } from './spn46.ts';

export const SPN43_RPM = 15;
export const SCAN_S = 60 / SPN43_RPM;
/** antenna bearing (deg true) at a performance.now() time */
export const sweepAngle = (nowMs: number): number => ((nowMs / 1000) * SPN43_RPM * 6) % 360;

/** true if bearing `b` lies in the clockwise arc (a0, a1] */
export function swept(a0: number, a1: number, b: number): boolean {
  const span = (a1 - a0 + 360) % 360;
  const d = (b - a0 + 360) % 360;
  return d > 0 && d <= span;
}

export interface Painter {
  painted: Map<string, WireTrack>;
  hist: Map<string, Trail[]>;
}

/** A radar contributing paints: `swept(b)` says whether its beam covered bearing b this step. */
export interface Radar {
  id: string;
  lat: number;
  lon: number;
  /** electronically scanned: every bearing each revisit (swept() returns true on revisit steps) */
  swept: (bearing: number) => boolean;
  /** paints aircraft (air search); default true */
  air?: boolean;
  /** air search coverage against a target at this altitude (ft), NM: range capped by the horizon; unlimited when absent */
  airNm?: (targetFt: number) => number;
  /** paints ships out to its radar horizon (surface search) */
  sfc?: { rangeNm: number };
  /** a tracking radar: looks at these tracks only (its locks), not at every bearing it "sweeps" */
  only?: ReadonlySet<string>;
}

/** Radar horizon, NM, between an antenna and a target mast top (heights ft): 1.23 (√ha + √ht). */
export const horizonNm = (antFt: number, tgtFt = 80) => 1.23 * (Math.sqrt(antFt) + Math.sqrt(tgtFt));
/** AN/SPS-67 surface search: 15 RPM */
export const SPS67_RPM = 15;

/**
 * One painter step. The reference carrier (the radar's own ship) is always current; other tracks
 * repaint when any contributing radar's beam covers them this step; new contacts appear on their
 * first paint; lost contacts drop when a beam passes their last position. Returns whether
 * anything changed.
 */
export function paintRadars(P: Painter, tracks: WireTrack[], refId: string, radars: Radar[], mt: number, keepS = 60): boolean {
  if (!tracks.some((t) => t.id === refId) || !radars.length) return false;
  const isShip = (t: WireTrack) => t.k === 'ship' || t.k === 'carrier';
  // aircraft: an air-search beam passing them inside its coverage for their altitude;
  // ships: a surface-search beam passing them within its horizon
  const looks = (r: Radar, id: string) => !r.only || r.only.has(id);
  const sees = (r: Radar, t: WireTrack) => {
    if (!looks(r, t.id)) return false;
    if (isShip(t)) return !!r.sfc && distanceNm(r.lat, r.lon, t.lat, t.lon) <= r.sfc.rangeNm;
    if (r.air === false) return false;
    return !r.airNm || distanceNm(r.lat, r.lon, t.lat, t.lon) <= r.airNm(t.alt);
  };
  const hitT = (t: WireTrack) => radars.some((r) => sees(r, t) && r.swept(bearingDeg(r.lat, r.lon, t.lat, t.lon)));
  // a contact swept by a radar of its kind that no radar can see any more (out of range, below the horizon) is lost
  const ofKind = (r: Radar, t: WireTrack) => looks(r, t.id) && (isShip(t) ? !!r.sfc : r.air !== false);
  const lost = (t: WireTrack) => radars.some((r) => ofKind(r, t) && r.swept(bearingDeg(r.lat, r.lon, t.lat, t.lon))) && !radars.some((r) => sees(r, t));
  let changed = false;
  const seen = new Set<string>();
  for (const t of tracks) {
    seen.add(t.id);
    if (t.id === refId) {
      if (P.painted.get(t.id) !== t) {
        P.painted.set(t.id, t);
        changed = true;
      }
      continue;
    }
    if (!hitT(t)) {
      if (P.painted.has(t.id) && lost(t)) {
        P.painted.delete(t.id);
        P.hist.delete(t.id);
        changed = true;
      }
      continue;
    }
    let h = P.hist.get(t.id);
    // already painted from this frame (a tracking radar looks every step; the data changes once a frame)
    if (h?.length && h[h.length - 1].t === mt && P.painted.has(t.id)) continue;
    if (!h) P.hist.set(t.id, (h = []));
    if (h.length && h[h.length - 1].t > mt + 5) h.length = 0; // time ran backwards: a new run
    P.painted.set(t.id, trackerVelocity(t, h, mt));
    if (!h.length || h[h.length - 1].t < mt) h.push({ t: mt, lat: t.lat, lon: t.lon, alt: t.alt, ...(t.air === false ? { gnd: true } : {}) });
    while (h.length > 2 && h[0].t < mt - (isShip(t) ? Math.max(keepS, SHIP_HISTORY_S) : keepS)) h.shift();
    changed = true;
  }
  for (const [id, t] of P.painted) {
    if (seen.has(id) || !radars.some((r) => looks(r, id) && r.swept(bearingDeg(r.lat, r.lon, t.lat, t.lon)))) continue;
    P.painted.delete(id);
    P.hist.delete(id);
    changed = true;
  }
  return changed;
}

/** paints closer together than this (s) are too noisy to difference: use an older one */
export const TRACKER_MIN_DT_S = 3;

/**
 * The radar tracker's velocity: course and ground speed differenced from the newest earlier paint
 * at least TRACKER_MIN_DT_S old, instead of DCS's instantaneous velocity. It lags in turns by about
 * half the paint interval, as a real tracker does. With no usable earlier paint, DCS's is kept.
 */
export function trackerVelocity(t: WireTrack, h: Trail[], mt: number): WireTrack {
  for (let i = h.length - 1; i >= 0; i--) {
    const p = h[i];
    const dt = mt - p.t;
    if (dt < TRACKER_MIN_DT_S) continue;
    if (dt > 30) break; // a stale paint says nothing about the present
    const nm = distanceNm(p.lat, p.lon, t.lat, t.lon);
    const gs = (nm / dt) * 3600;
    return { ...t, gs, crs: gs > 1 ? bearingDeg(p.lat, p.lon, t.lat, t.lon) : t.crs };
  }
  return t;
}

/** Single-radar step from antenna bearing a0 to a1 (own carrier only). */
export function paintStep(P: Painter, tracks: WireTrack[], refId: string, mt: number, a0: number, a1: number, keepS = 60): boolean {
  const ref = tracks.find((t) => t.id === refId);
  if (!ref) return false;
  return paintRadars(P, tracks, refId, [{ id: refId, lat: ref.lat, lon: ref.lon, swept: (b) => swept(a0, a1, b), sfc: { rangeNm: horizonNm(CVN_SFC_ANT_FT) } }], mt, keepS);
}

// ---------------------------------------------------------------- ship datalink

/** Air-search radars by DCS ship type: rotating antennas (RPM) or phased arrays (revisit, s). */
const SHIP_RADARS: [RegExp, { rpm: number } | { revisitS: number }][] = [
  [/Arleigh|TICONDEROG|Ticonderoga|USS_Arleigh/i, { revisitS: 1 }], // AN/SPY-1 (Aegis)
  [/PERRY|Oliver/i, { rpm: 6 }], // AN/SPS-49
];
/** carrier surface-search (AN/SPS-67) antenna height, ft */
const CVN_SFC_ANT_FT = 150;
/** Surface-search radars by DCS ship type: RPM and antenna height (ft). */
const SHIP_SFC_RADARS: [RegExp, { rpm: number; antFt: number }][] = [
  [/Arleigh|USS_Arleigh/i, { rpm: SPS67_RPM, antFt: 100 }], // AN/SPS-67
  [/TICONDEROG|Ticonderoga/i, { rpm: SPS67_RPM, antFt: 110 }], // AN/SPS-67
  [/PERRY|Oliver/i, { rpm: 16, antFt: 90 }], // AN/SPS-55
];
/** Airborne early warning: AN/APS-145 (E-2C) / APY-9 (E-2D) rotodome, 6 RPM, with a maritime surface mode. */
const AEW_RPM = 6;
/** its surface search reaches the radar horizon from its altitude, capped at this, NM */
const AEW_SFC_MAX_NM = 200;
/** escorts count as part of a carrier group within this range of a friendly carrier */
const CSG_RADIUS_NM = 30;
/** a carrier whose type isn't in the radar table: AN/SPS-48E */
const CVN_AIR = radarOf('CVN_71')!;

/** a radar's antenna bearing offset (deg) from the shared clock; our carrier's is 0 */
export const phaseOf = (id: string) => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
};

/** air coverage for a radar on track t (range capped by the horizon to the target's altitude) */
const airCov = (spec: RadarSpec, t: WireTrack) => {
  const ant = antennaFtOf(spec, t.alt);
  return (tgtFt: number) => coverageNm(spec, ant, tgtFt);
};

/** An AEW aircraft radiating: airborne and above 500 ft. */
export const isAewUp = (t: WireTrack) => radarOf(t.ty)?.kind === 'aew' && t.air !== false && t.alt >= 500;

/**
 * The radars contributing paints between wall-clock times t0 and t1 (ms). Without datalink only
 * our carrier's own radars. With datalink (Link 16 / CEC style track sharing): every friendly
 * carrier's, escorts with a known radar within CSG_RADIUS_NM of a friendly carrier, and friendly
 * AEW aircraft in the air. Air search is limited by each radar's range and its horizon to the
 * target's altitude, so low flyers beyond the ships' horizon are seen only by AEW. `locks`: the
 * aircraft our carrier's SPN-46 tracks (see spn46.ts), painted every step besides the sweeps.
 */
export function radarsFor(tracks: WireTrack[], refId: string, t0: number, t1: number, datalink: boolean, locks: readonly string[] = []): Radar[] {
  const ref = tracks.find((t) => t.id === refId);
  if (!ref) return [];
  const rot = (t: WireTrack, rpm: number, phase: number): Radar => {
    const a0 = ((t0 / 1000) * rpm * 6 + phase) % 360;
    const a1 = ((t1 / 1000) * rpm * 6 + phase) % 360;
    return { id: t.id, lat: t.lat, lon: t.lon, swept: (b) => swept(a0, a1, b) };
  };
  const sfc = (t: WireTrack, rpm: number, antFt: number): Radar => ({ ...rot(t, rpm, (phaseOf(t.id) + 137) % 360), id: `${t.id}:sfc`, air: false, sfc: { rangeNm: horizonNm(antFt) } });
  const carrierAir = (c: WireTrack, phase: number): Radar => ({ ...rot(c, SPN43_RPM, phase), airNm: airCov(radarOf(c.ty) ?? CVN_AIR, c) });
  // our carrier: air search (SPN-43 timing, SPS-48E coverage) and SPS-67 surface search
  const out: Radar[] = [carrierAir(ref, 0), sfc(ref, SPS67_RPM, CVN_SFC_ANT_FT)];
  if (locks.length) out.push(spn46Radar(ref, locks));
  if (!datalink) return out;
  const carriers = tracks.filter((t) => t.k === 'carrier' && t.sd === ref.sd);
  for (const c of carriers) if (c.id !== refId) out.push(carrierAir(c, phaseOf(c.id)), sfc(c, SPS67_RPM, CVN_SFC_ANT_FT));
  for (const s of tracks) {
    if (s.k !== 'ship' || s.sd !== ref.sd) continue;
    if (!carriers.some((c) => distanceNm(c.lat, c.lon, s.lat, s.lon) <= CSG_RADIUS_NM)) continue;
    const ss = SHIP_SFC_RADARS.find(([re]) => re.test(s.ty))?.[1];
    if (ss) out.push(sfc(s, ss.rpm, ss.antFt));
    const spec = SHIP_RADARS.find(([re]) => re.test(s.ty))?.[1];
    const cov = radarOf(s.ty);
    if (!spec) continue;
    const airNm = cov ? airCov(cov, s) : undefined;
    if ('rpm' in spec) out.push({ ...rot(s, spec.rpm, phaseOf(s.id)), airNm });
    else {
      const due = Math.floor(t1 / (spec.revisitS * 1000)) !== Math.floor(t0 / (spec.revisitS * 1000));
      out.push({ id: s.id, lat: s.lat, lon: s.lon, swept: () => due, airNm });
    }
  }
  // friendly AEW in the air: air search to its range/horizon, and ships out to its horizon
  for (const a of tracks) {
    if (a.sd !== ref.sd || !isAewUp(a)) continue;
    const spec = radarOf(a.ty)!;
    out.push({ ...rot(a, AEW_RPM, phaseOf(a.id)), airNm: airCov(spec, a) });
    out.push({ ...rot(a, AEW_RPM, phaseOf(a.id)), id: `${a.id}:sfc`, air: false, sfc: { rangeNm: Math.min(AEW_SFC_MAX_NM, horizonNm(a.alt)) } });
  }
  return out;
}

/** Scan period (s) of a donor's radar, for the scope's rotating donor marker. */
export function scanPeriodS(ty: string): number {
  const r = radarOf(ty);
  if (r?.kind === 'aew') return 60 / AEW_RPM;
  if (r?.kind === 'ship' && /^(CVN_7[1-5]|Stennis|VINSON|CV_59|Forrestal|LHA_Tarawa)/i.test(ty)) return SCAN_S;
  const spec = SHIP_RADARS.find(([re]) => re.test(ty))?.[1];
  if (spec) return 'rpm' in spec ? 60 / spec.rpm : spec.revisitS;
  return SCAN_S;
}
/**
 * Paints `tracks` on the sweep(s) while enabled; null when disabled (use the live picture).
 * `acls`: the focus carrier's SPN-46 feeds this display (the Approach / Final display with the ACLS
 * up): aircraft it has locked repaint every frame, everything else on the SPN-43 sweep.
 */
export function useSweep(tracks: WireTrack[], mt: number, refId: string | undefined, enabled: boolean, datalink = false, acls = false): { tracks: WireTrack[]; hist: Map<string, Trail[]> } | null {
  const latest = useRef({ tracks, mt, refId, datalink, acls });
  latest.current = { tracks, mt, refId, datalink, acls };
  const P = useRef<Painter>({ painted: new Map(), hist: new Map() });
  const [out, setOut] = useState<{ tracks: WireTrack[]; hist: Map<string, Trail[]> } | null>(null);
  useEffect(() => {
    P.current = { painted: new Map(), hist: new Map() };
    if (!enabled) {
      setOut(null);
      return;
    }
    let prev: number | null = null;
    let prevRef: string | undefined;
    let locks: string[] = [];
    const step = () => {
      const L = latest.current;
      const now = performance.now();
      if (!L.refId) return;
      if (prev === null || prevRef !== L.refId) {
        // first scan (or a new reference carrier): start from the live picture, then sweep
        P.current = { painted: new Map(L.tracks.map((t) => [t.id, t])), hist: new Map() };
        prev = now;
        prevRef = L.refId;
        locks = [];
        setOut({ tracks: [...P.current.painted.values()], hist: P.current.hist });
        return;
      }
      const cv = L.tracks.find((t) => t.id === L.refId);
      locks = cv ? spn46Locks(locks, L.tracks, cv, L.acls) : [];
      const radars = radarsFor(L.tracks, L.refId, prev, now, L.datalink, locks);
      if (paintRadars(P.current, L.tracks, L.refId, radars, L.mt)) setOut({ tracks: [...P.current.painted.values()], hist: P.current.hist });
      prev = now;
    };
    const id = setInterval(step, 100);
    step();
    return () => clearInterval(id);
  }, [enabled]);
  return enabled ? out : null;
}
