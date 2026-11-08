/**
 * Realistic radar update rate: hits repaint only when the antenna sweeps past them.
 *
 * Nimitz-class CATCC's marshal/approach-control search radar is the AN/SPN-43, whose antenna turns
 * at 15 RPM (a 4-second scan). The sweep is driven by the wall clock so every module and the
 * sweep line overlay agree on its bearing. Bearings are measured from the reference carrier.
 */
import { useEffect, useRef, useState } from 'react';
import { bearingDeg } from '../../../catcc/core/geo.ts';
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

/**
 * One painter step from antenna bearing a0 to a1. The reference carrier (the radar's own ship) is
 * always current; others repaint when swept, new contacts appear on their first paint and lost
 * contacts drop when the sweep passes their last position. Returns whether anything changed.
 */
export function paintStep(P: Painter, tracks: WireTrack[], refId: string, mt: number, a0: number, a1: number, keepS = 60): boolean {
  const ref = tracks.find((t) => t.id === refId);
  if (!ref) return false;
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
    if (!swept(a0, a1, bearingDeg(ref.lat, ref.lon, t.lat, t.lon))) continue;
    P.painted.set(t.id, t);
    let h = P.hist.get(t.id);
    if (!h) P.hist.set(t.id, (h = []));
    h.push({ t: mt, lat: t.lat, lon: t.lon });
    while (h.length > 2 && h[0].t < mt - keepS) h.shift();
    changed = true;
  }
  for (const [id, t] of P.painted) {
    if (seen.has(id) || !swept(a0, a1, bearingDeg(ref.lat, ref.lon, t.lat, t.lon))) continue;
    P.painted.delete(id);
    P.hist.delete(id);
    changed = true;
  }
  return changed;
}

/** Paints `tracks` on the sweep while enabled; null when disabled (use the live picture). */
export function useSweep(tracks: WireTrack[], mt: number, refId: string | undefined, enabled: boolean): { tracks: WireTrack[]; hist: Map<string, Trail[]> } | null {
  const latest = useRef({ tracks, mt, refId });
  latest.current = { tracks, mt, refId };
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
      const a = sweepAngle(performance.now());
      if (!L.refId) return;
      if (prev === null || prevRef !== L.refId) {
        // first scan (or a new reference carrier): start from the live picture, then sweep
        P.current = { painted: new Map(L.tracks.map((t) => [t.id, t])), hist: new Map() };
        prev = a;
        prevRef = L.refId;
        setOut({ tracks: [...P.current.painted.values()], hist: P.current.hist });
        return;
      }
      if (paintStep(P.current, L.tracks, L.refId, L.mt, prev, a)) setOut({ tracks: [...P.current.painted.values()], hist: P.current.hist });
      prev = a;
    };
    const id = setInterval(step, 100);
    step();
    return () => clearInterval(id);
  }, [enabled]);
  return enabled ? out : null;
}
