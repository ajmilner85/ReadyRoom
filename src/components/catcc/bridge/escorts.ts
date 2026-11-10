/** The focus carrier's escorts and how each is keeping its formation station. */
import type { Station } from '../../../catcc/core/room/ops.ts';
import { stationState } from '../../../catcc/core/geometry/formation.ts';
import { radarOf } from '../../../catcc/core/sensors/radar.ts';
import { bearingOf, len, sub } from '../../../catcc/core/geometry/vec.ts';
import type { Picture, ScopeTrack } from '../scopeModel.ts';

export interface Escort {
  id: string;
  label: string;
  t: ScopeTrack;
  /** true bearing and range from the carrier */
  brg: number;
  rng: number;
}

const ORDER: Record<string, number> = { CG: 0, DDG: 1, FFG: 2, LHA: 3 };

/** Friendly escorts working with the focus carrier: its side, within 30 NM, nearer it than any other carrier. Cruisers first. */
export function escortsOf(pic: Picture): Escort[] {
  const c = pic.focus;
  if (!c) return [];
  const list = (pic.ships ?? [])
    .filter((t) => t.sd === c.track.sd)
    .map((t) => ({ t, rng: len(sub(t.p, c.track.p)), brg: bearingOf(sub(t.p, c.track.p)) }))
    .filter((e) => e.rng <= 30 && pic.carriers.every((o) => o.focus || len(sub(e.t.p, o.track.p)) > e.rng))
    .map((e) => ({ ...e, cls: radarOf(e.t.ty)?.cls ?? 'SHIP' }))
    .sort((a, b) => (ORDER[a.cls] ?? 9) - (ORDER[b.cls] ?? 9) || a.t.id.localeCompare(b.t.id));
  const count: Record<string, number> = {};
  for (const e of list) count[e.cls] = (count[e.cls] ?? 0) + 1;
  const seen: Record<string, number> = {};
  return list.map((e) => {
    seen[e.cls] = (seen[e.cls] ?? 0) + 1;
    return { id: e.t.id, label: count[e.cls] > 1 ? `${e.cls}-${seen[e.cls]}` : e.cls, t: e.t, brg: e.brg, rng: e.rng };
  });
}

export function stateOf(st: Station, brc: number, e: Escort) {
  const s = stationState(st, brc, e.brg, e.rng);
  return s.k === 'free' ? { t: 'FREE', c: '#93A1B0' } : s.k === 'on' ? { t: 'ON STA', c: '#7FD397' } : { t: `OFF STA ${s.nm.toFixed(1)} NM`, c: '#E7B04F' };
}

