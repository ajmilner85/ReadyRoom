import type { AcmiEvent } from '../acmi/parser.ts';
import { AcmiState, type AcmiObject } from '../acmi/state.ts';
import { bearingDeg, distanceNm, M_PER_FT, MS_PER_KT } from '../geo.ts';
import { CARRIER_HULLS, parsePilot } from './naming.ts';

export type TrackKind = 'fixedwing' | 'rotary' | 'carrier' | 'ship' | 'ground' | 'other';
export type Side = 'blue' | 'red' | 'neutral';

export interface TrackSample {
  /** sim seconds */
  t: number;
  lat: number;
  lon: number;
  altFt: number;
}

export interface Track {
  id: string;
  kind: TrackKind;
  /** DCS type name, e.g. "FA-18C_hornet", "CVN_72" */
  type: string;
  side: Side;
  /** raw Pilot property (player string, or AI unit name) */
  pilot?: string;
  callsign?: string;
  flight?: string;
  board?: string;
  player?: string;
  /** DCS group name; members of one group form a formation */
  group?: string;
  /** carrier hull ("CVN-72") when kind === 'carrier' */
  hull?: string;
  lat: number;
  lon: number;
  altFt: number;
  /** true heading of the airframe/hull, degrees (from T heading or yaw) */
  headingDeg?: number;
  /** course over ground, degrees true (from position history) */
  courseDeg?: number;
  gsKt?: number;
  vsFpm?: number;
  /** only present for objects whose recorder reports them (usually the recording player) */
  iasKt?: number;
  /** sim seconds of the latest position */
  updatedAt: number;
  /** recent positions, oldest first; spans HISTORY_S */
  history: TrackSample[];
}

export interface TrackStoreOptions {
  /** which object kinds become tracks (default: aircraft and ships) */
  kinds?: TrackKind[];
  /** seconds of position history kept per track */
  historyS?: number;
  /** look-back used for groundspeed / course / vertical speed */
  kinematicsWindowS?: number;
}

const DEFAULT_KINDS: TrackKind[] = ['fixedwing', 'rotary', 'carrier', 'ship'];

export function classify(type: string | undefined, name: string | undefined): TrackKind | undefined {
  if (!type) return undefined;
  const tags = new Set(type.split('+'));
  if (tags.has('Weapon') || tags.has('Projectile') || tags.has('Misc') || tags.has('Navaid') || tags.has('Shrapnel')) {
    return undefined;
  }
  if (tags.has('Air')) return tags.has('Rotorcraft') ? 'rotary' : tags.has('FixedWing') ? 'fixedwing' : 'other';
  if (tags.has('Sea')) return tags.has('AircraftCarrier') && name && CARRIER_HULLS[name] ? 'carrier' : 'ship';
  if (tags.has('Ground')) return 'ground';
  return 'other';
}

function sideOf(color: string | undefined): Side {
  if (color === 'Blue') return 'blue';
  if (color === 'Red') return 'red';
  return 'neutral';
}

/**
 * Maintains radar tracks from an ACMI event stream. ACMI gives position and attitude only,
 * so groundspeed, course and vertical speed are derived from position history.
 * Note: Tacview's "Coalition" is relative to the recorder; "Color" is the absolute side.
 */
export class TrackStore {
  readonly acmi = new AcmiState();
  readonly tracks = new Map<string, Track>();
  private readonly kinds: Set<TrackKind>;
  private readonly historyS: number;
  private readonly windowS: number;

  constructor(opts: TrackStoreOptions = {}) {
    this.kinds = new Set(opts.kinds ?? DEFAULT_KINDS);
    this.historyS = opts.historyS ?? 60;
    this.windowS = opts.kinematicsWindowS ?? 4;
  }

  get t(): number {
    return this.acmi.t;
  }

  get utc(): Date | undefined {
    return this.acmi.utc;
  }

  reset(): void {
    this.acmi.reset();
    this.tracks.clear();
  }

  apply(ev: AcmiEvent): void {
    if (ev.kind === 'remove') this.tracks.delete(ev.id);
    const obj = this.acmi.apply(ev);
    if (!obj || ev.kind !== 'update') return;
    this.updateTrack(obj, ev.props);
  }

  carriers(): Track[] {
    return [...this.tracks.values()].filter((t) => t.kind === 'carrier');
  }

  private updateTrack(obj: AcmiObject, changed: Record<string, string>): void {
    const kind = classify(obj.props.Type, obj.props.Name);
    if (!kind || !this.kinds.has(kind)) {
      this.tracks.delete(obj.id);
      return;
    }
    const tr = obj.transform;
    if (tr.lat === undefined || tr.lon === undefined) return;

    let track = this.tracks.get(obj.id);
    if (!track) {
      track = {
        id: obj.id,
        kind,
        type: obj.props.Name ?? '',
        side: sideOf(obj.props.Color),
        lat: tr.lat,
        lon: tr.lon,
        altFt: (tr.alt ?? 0) / M_PER_FT,
        updatedAt: this.t,
        history: [],
      };
      this.tracks.set(obj.id, track);
      this.refreshIdentity(track, obj);
    } else if ('Name' in changed || 'Pilot' in changed || 'Group' in changed || 'Color' in changed || 'Type' in changed) {
      track.kind = kind;
      this.refreshIdentity(track, obj);
    }

    if (tr.heading !== undefined) track.headingDeg = tr.heading;
    else if (tr.yaw !== undefined) track.headingDeg = ((tr.yaw % 360) + 360) % 360;
    if (obj.props.IAS !== undefined) {
      const ias = Number(obj.props.IAS);
      if (Number.isFinite(ias)) track.iasKt = ias / MS_PER_KT;
    }

    if (!('T' in changed)) return;
    track.lat = tr.lat;
    track.lon = tr.lon;
    track.altFt = (tr.alt ?? 0) / M_PER_FT;
    track.updatedAt = this.t;
    this.pushSample(track);
  }

  private refreshIdentity(track: Track, obj: AcmiObject): void {
    const p = obj.props;
    track.type = p.Name ?? track.type;
    track.side = sideOf(p.Color);
    track.pilot = p.Pilot;
    track.group = p.Group;
    const name = parsePilot(p.Pilot);
    track.callsign = name.callsign;
    track.flight = name.flight;
    track.board = name.board;
    track.player = name.player;
    track.hull = track.kind === 'carrier' ? CARRIER_HULLS[track.type]?.hull : undefined;
  }

  private pushSample(track: Track): void {
    const h = track.history;
    const s: TrackSample = { t: this.t, lat: track.lat, lon: track.lon, altFt: track.altFt };
    if (h.length && h[h.length - 1].t === s.t) h[h.length - 1] = s;
    else h.push(s);
    const cutoff = this.t - this.historyS;
    let drop = 0;
    while (drop < h.length - 2 && h[drop].t < cutoff) drop++;
    if (drop) h.splice(0, drop);

    // Reference sample: the newest one at least windowS old, else the oldest we have.
    let ref: TrackSample | undefined;
    for (let i = h.length - 2; i >= 0; i--) {
      if (s.t - h[i].t >= this.windowS) {
        ref = h[i];
        break;
      }
    }
    ref ??= h.length > 1 ? h[0] : undefined;
    if (!ref) return;
    const dt = s.t - ref.t;
    if (dt < 0.5) return;
    const dNm = distanceNm(ref.lat, ref.lon, s.lat, s.lon);
    track.gsKt = (dNm / dt) * 3600;
    track.vsFpm = ((s.altFt - ref.altFt) / dt) * 60;
    if (dNm > 0.005) track.courseDeg = bearingDeg(ref.lat, ref.lon, s.lat, s.lon);
  }
}
