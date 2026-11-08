import { M_PER_FT, MS_PER_KT } from '../geo.ts';
import { CARRIER_HULLS, parsePilot } from '../tracks/naming.ts';
import type { Side, Track, TrackKind } from '../tracks/trackStore.ts';
import { fuelLb, THEATRE_UTC_OFFSET_H } from './aircraft.ts';
import type { HookFrame, HookUnit } from './hookProtocol.ts';

const SIDES: Side[] = ['neutral', 'red', 'blue'];

function kindOf(u: HookUnit): TrackKind {
  if (u.c === 'A') return 'fixedwing';
  if (u.c === 'H') return 'rotary';
  return CARRIER_HULLS[u.t] ? 'carrier' : 'ship';
}

/**
 * Track table built from hook frames. Each frame is a complete picture: units missing from a
 * frame are gone. Kinematics come straight from DCS (velocity vector), not from differencing.
 */
export class HookTrackStore {
  readonly tracks = new Map<string, Track>();
  /** model time of the latest frame */
  t = 0;
  frame?: HookFrame;
  private readonly historyS: number;

  constructor(opts: { historyS?: number } = {}) {
    this.historyS = opts.historyS ?? 60;
  }

  reset(): void {
    this.tracks.clear();
    this.t = 0;
    this.frame = undefined;
  }

  /** Mission local time as a Date in the theatre's zone, expressed in UTC when the offset is known. */
  get utc(): Date | undefined {
    const f = this.frame;
    if (!f?.date) return undefined;
    const off = f.theatre ? THEATRE_UTC_OFFSET_H[f.theatre] : undefined;
    if (off === undefined) return undefined;
    const midnightUtc = Date.parse(`${f.date}T00:00:00Z`);
    if (Number.isNaN(midnightUtc)) return undefined;
    return new Date(midnightUtc + (f.abs - off * 3600) * 1000);
  }

  applyFrame(frame: HookFrame): void {
    this.frame = frame;
    this.t = frame.mt;
    const seen = new Set<string>();
    for (const u of frame.units) {
      const id = `u${u.id}`;
      seen.add(id);
      this.upsert(id, u);
    }
    for (const id of this.tracks.keys()) if (!seen.has(id)) this.tracks.delete(id);
  }

  private upsert(id: string, u: HookUnit): void {
    const name = parsePilot(u.p ?? u.n);
    const kind = kindOf(u);
    const altFt = u.alt / M_PER_FT;
    let tr = this.tracks.get(id);
    if (!tr) {
      tr = { id, kind, type: u.t, side: SIDES[u.s] ?? 'neutral', lat: u.lat, lon: u.lon, altFt, updatedAt: this.t, history: [] };
      this.tracks.set(id, tr);
    }
    tr.kind = kind;
    tr.type = u.t;
    tr.side = SIDES[u.s] ?? 'neutral';
    tr.pilot = u.p ?? u.n;
    tr.unitName = u.n;
    tr.isPlayer = u.p !== null;
    tr.callsign = name.callsign;
    tr.flight = name.flight;
    tr.board = name.board;
    tr.player = u.p ? name.player : undefined;
    tr.group = u.g;
    tr.hull = kind === 'carrier' ? CARRIER_HULLS[u.t]?.hull : undefined;
    tr.lat = u.lat;
    tr.lon = u.lon;
    tr.altFt = altFt;
    tr.headingDeg = u.hdg;
    tr.courseDeg = u.crs ?? undefined;
    tr.gsKt = u.gs / MS_PER_KT;
    tr.vsFpm = (u.vs / M_PER_FT) * 60;
    tr.fuelFrac = u.f;
    tr.fuelLb = fuelLb(u.t, u.f);
    tr.inAir = u.air;
    tr.wx = u.wx;
    tr.updatedAt = this.t;

    const h = tr.history;
    h.push({ t: this.t, lat: u.lat, lon: u.lon, altFt });
    const cutoff = this.t - this.historyS;
    let drop = 0;
    while (drop < h.length - 1 && h[drop].t < cutoff) drop++;
    if (drop) h.splice(0, drop);
  }
}
