/**
 * Realistic radar update rate: hits repaint only when the antenna sweeps past them.
 *
 * Nimitz-class CATCC's marshal/approach-control search radar is the AN/SPN-43, whose antenna turns
 * at 15 RPM (a 4-second scan). The sweep is driven by the wall clock so every module and the
 * sweep line overlay agree on its bearing. Bearings are measured from the reference carrier.
 */
import { useEffect, useRef, useState } from 'react';
import { bearingDeg, distanceNm } from '../../../catcc/core/geo.ts';
import type { WireTrack } from '../../../catcc/core/room/protocol.ts';
import type { Trail } from '../scopeModel.ts';

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
}

/**
 * One painter step. The reference carrier (the radar's own ship) is always current; other tracks
 * repaint when any contributing radar's beam covers them this step; new contacts appear on their
 * first paint; lost contacts drop when a beam passes their last position. Returns whether
 * anything changed.
 */
export function paintRadars(P: Painter, tracks: WireTrack[], refId: string, radars: Radar[], mt: number, keepS = 60): boolean {
  if (!tracks.some((t) => t.id === refId) || !radars.length) return false;
  const hit = (lat: number, lon: number) => radars.some((r) => r.swept(bearingDeg(r.lat, r.lon, lat, lon)));
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
    if (!hit(t.lat, t.lon)) continue;
    P.painted.set(t.id, t);
    let h = P.hist.get(t.id);
    if (!h) P.hist.set(t.id, (h = []));
    if (!h.length || h[h.length - 1].t < mt) h.push({ t: mt, lat: t.lat, lon: t.lon });
    while (h.length > 2 && h[0].t < mt - keepS) h.shift();
    changed = true;
  }
  for (const [id, t] of P.painted) {
    if (seen.has(id) || !hit(t.lat, t.lon)) continue;
    P.painted.delete(id);
    P.hist.delete(id);
    changed = true;
  }
  return changed;
}

/** Single-radar step from antenna bearing a0 to a1 (own carrier only). */
export function paintStep(P: Painter, tracks: WireTrack[], refId: string, mt: number, a0: number, a1: number, keepS = 60): boolean {
  const ref = tracks.find((t) => t.id === refId);
  if (!ref) return false;
  return paintRadars(P, tracks, refId, [{ id: refId, lat: ref.lat, lon: ref.lon, swept: (b) => swept(a0, a1, b) }], mt, keepS);
}

// ---------------------------------------------------------------- ship datalink

/** Air-search radars by DCS ship type: rotating antennas (RPM) or phased arrays (revisit, s). */
const SHIP_RADARS: [RegExp, { rpm: number } | { revisitS: number }][] = [
  [/Arleigh|TICONDEROG|Ticonderoga|USS_Arleigh/i, { revisitS: 1 }], // AN/SPY-1 (Aegis)
  [/PERRY|Oliver/i, { rpm: 6 }], // AN/SPS-49
];
/** escorts count as part of a carrier group within this range of a friendly carrier */
const CSG_RADIUS_NM = 30;

const phaseOf = (id: string) => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
};

/**
 * The radars contributing paints between wall-clock times t0 and t1 (ms). Without datalink only
 * our carrier's SPN-43. With datalink (Link 16 / CEC style track sharing): every friendly carrier's
 * SPN-43 (own phase each) plus escorts with a known air-search radar within CSG_RADIUS_NM of a
 * friendly carrier.
 */
export function radarsFor(tracks: WireTrack[], refId: string, t0: number, t1: number, datalink: boolean): Radar[] {
  const ref = tracks.find((t) => t.id === refId);
  if (!ref) return [];
  const rot = (t: WireTrack, rpm: number, phase: number): Radar => {
    const a0 = ((t0 / 1000) * rpm * 6 + phase) % 360;
    const a1 = ((t1 / 1000) * rpm * 6 + phase) % 360;
    return { id: t.id, lat: t.lat, lon: t.lon, swept: (b) => swept(a0, a1, b) };
  };
  const out: Radar[] = [rot(ref, SPN43_RPM, 0)];
  if (!datalink) return out;
  const carriers = tracks.filter((t) => t.k === 'carrier' && t.sd === ref.sd);
  for (const c of carriers) if (c.id !== refId) out.push(rot(c, SPN43_RPM, phaseOf(c.id)));
  for (const s of tracks) {
    if (s.k !== 'ship' || s.sd !== ref.sd) continue;
    if (!carriers.some((c) => distanceNm(c.lat, c.lon, s.lat, s.lon) <= CSG_RADIUS_NM)) continue;
    const spec = SHIP_RADARS.find(([re]) => re.test(s.ty))?.[1];
    if (!spec) continue;
    if ('rpm' in spec) out.push(rot(s, spec.rpm, phaseOf(s.id)));
    else {
      const due = Math.floor(t1 / (spec.revisitS * 1000)) !== Math.floor(t0 / (spec.revisitS * 1000));
      out.push({ id: s.id, lat: s.lat, lon: s.lon, swept: () => due });
    }
  }
  return out;
}

/** Paints `tracks` on the sweep(s) while enabled; null when disabled (use the live picture). */
export function useSweep(tracks: WireTrack[], mt: number, refId: string | undefined, enabled: boolean, datalink = false): { tracks: WireTrack[]; hist: Map<string, Trail[]> } | null {
  const latest = useRef({ tracks, mt, refId, datalink });
  latest.current = { tracks, mt, refId, datalink };
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
    const step = () => {
      const L = latest.current;
      const now = performance.now();
      if (!L.refId) return;
      if (prev === null || prevRef !== L.refId) {
        // first scan (or a new reference carrier): start from the live picture, then sweep
        P.current = { painted: new Map(L.tracks.map((t) => [t.id, t])), hist: new Map() };
        prev = now;
        prevRef = L.refId;
        setOut({ tracks: [...P.current.painted.values()], hist: P.current.hist });
        return;
      }
      const radars = radarsFor(L.tracks, L.refId, prev, now, L.datalink);
      if (paintRadars(P.current, L.tracks, L.refId, radars, L.mt)) setOut({ tracks: [...P.current.painted.values()], hist: P.current.hist });
      prev = now;
    };
    const id = setInterval(step, 100);
    step();
    return () => clearInterval(id);
  }, [enabled]);
  return enabled ? out : null;
}
