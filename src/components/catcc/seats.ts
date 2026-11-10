/**
 * Locations (spaces on the ship) and seats (a function within a location). Small groups use the
 * condensed layout, one seat per location; larger groups the expanded one, with a seat per function.
 * Seats that share an interface (the radar) each have their own view preset.
 */
import type { SeatRole } from '../../catcc/core/room/protocol.ts';
import { OV2_DEFAULT, OV_DEFAULT, type Fit, type Tool } from './radar/types.ts';

export type LocationId = 'cdc' | 'catcc' | 'prifly' | 'bridge' | 'lso';
export type SeatView = 'radar' | 'boss' | 'lso';
export type SeatLayout = 'condensed' | 'expanded';

export interface RadarPreset {
  /** layers for the own carrier and shared layers (merged over OV_DEFAULT) */
  ov: Record<string, boolean>;
  /** layers for other carriers (merged over OV2_DEFAULT) */
  ov2: Record<string, boolean>;
  fit: Fit;
  tool: Tool;
}

/** Sidebar sections a radar seat shows. */
export type LeftTab = 'info' | 'strips';
export type RightSection = 'dep' | 'marshal' | 'coord' | 'deck' | 'donors' | 'helm' | 'csg' | 'blights' | 'notes';

/** What a radar seat's interface offers: scope tools, range presets, sidebars. */
export interface SeatUi {
  tools: Tool[];
  fits: Exclude<Fit, null>[];
  /** comms scripts (CATCC phraseology) */
  comms: boolean;
  /** north-up / track-up switch */
  trackUp: boolean;
  /** range rings out to the theatre's edge */
  ringsFar: boolean;
  /** aircraft conflict alerts: always (traffic control), a toolbar switch, or none (not this seat's job) */
  conflicts: 'on' | 'toggle' | 'off';
  left: LeftTab[];
  right: RightSection[];
}

export interface SeatDef {
  id: SeatRole;
  loc: LocationId;
  label: string;
  /** header pill label */
  short: string;
  view: SeatView;
  radar?: RadarPreset;
  ui?: SeatUi;
}

export const LOCATIONS: { id: LocationId; label: string; name: string }[] = [
  { id: 'cdc', label: 'CDC', name: 'Combat Direction Center' },
  { id: 'catcc', label: 'CATCC', name: 'Carrier Air Traffic Control Center' },
  { id: 'prifly', label: 'PriFly', name: 'Primary Flight Control' },
  { id: 'bridge', label: 'Bridge', name: 'Navigation bridge' },
  { id: 'lso', label: 'LSO', name: 'LSO platform' },
];

// ---------------------------------------------------------------- radar presets

/** layers that belong to carrier traffic control; off for the theatre-level seats */
const CV_TRAFFIC_OFF = { brc: false, fb: false, marshal: false, arr: false, dep: false, cv1: false, cv2: false, cv3: false, bolter: false, port: false, coord: false, sar: false, rings: false };
const ALL_OTHER_OFF = { brc: false, fb: false, marshal: false, arr: false, dep: false, cv1: false, cv2: false, cv3: false, bolter: false, port: false, tanker: false, sar: false, rings: false, pim: false };

const preset = (ov: Record<string, boolean>, ov2: Record<string, boolean>, fit: Fit, tool: Tool): RadarPreset => ({ ov: { ...OV_DEFAULT, ...ov }, ov2: { ...OV2_DEFAULT, ...ov2 }, fit, tool });

/** CATCC: the carrier control area with marshal, approach and departure overlays */
const P_CATCC = preset({}, {}, 'r50', 'marshal');
/** CDC air picture: theatre zoom, bullseye, datalink donors, no carrier traffic overlays */
const P_STRIKE = preset({ ...CV_TRAFFIC_OFF, rings: true, bulls: true, dl: true, blind: true, tanker: true, cca: true, pim: false, terr: true, places: true, airports: true }, { ...ALL_OTHER_OFF, cca: false }, 'thr', 'select');
const P_AW = preset({ ...CV_TRAFFIC_OFF, rings: true, bulls: true, dl: true, blind: true, tanker: true, cca: true, pim: false, terr: true }, { ...ALL_OTHER_OFF, cca: false }, 'thr', 'select');
const P_SUW = preset({ ...CV_TRAFFIC_OFF, rings: true, bulls: true, dl: false, blind: true, tanker: false, cca: false, pim: true, terr: true, coast: true }, { ...ALL_OTHER_OFF, pim: true, cca: false }, 'thr', 'select');
const P_DEP = preset({ marshal: false, arr: false, cv1: false, cv2: false, cv3: false, port: false }, { marshal: false, arr: false }, 'dep', 'vec');
const P_MARSHAL = preset({ dep: false }, { dep: false }, 'app', 'marshal');
const P_APPROACH = preset({ dep: false, cv1: true }, { dep: false }, 'app', 'cpa');
const P_FINAL = preset({ dep: false, cv1: true, bolter: true, tanker: false }, { dep: false, marshal: false, arr: false }, 'cca', 'cpa');
/** Bridge: the ship's track, PIM, nearby water and other groups */
const P_OOD = preset({ ...CV_TRAFFIC_OFF, csg: true, brc: true, fb: false, pim: true, terr: true, bathy: true, coast: true, coord: true, cca: true, tanker: false }, { ...ALL_OTHER_OFF, pim: true, brc: true }, 'r50', 'bra');

// ---------------------------------------------------------------- seats

const S = (id: SeatRole, loc: LocationId, label: string, short: string, view: SeatView, radar?: RadarPreset, ui?: SeatUi): SeatDef => ({ id, loc, label, short, view, radar, ui });

// ---------------------------------------------------------------- seat interfaces
const ui = (tools: Tool[], fits: Exclude<Fit, null>[], left: LeftTab[], right: RightSection[], o: { comms?: boolean; trackUp?: boolean; ringsFar?: boolean; conflicts?: SeatUi['conflicts'] } = {}): SeatUi => ({ tools, fits, left, right, comms: !!o.comms, trackUp: !!o.trackUp, ringsFar: !!o.ringsFar, conflicts: o.conflicts ?? 'on' });
/** CATCC as one seat: every control tool and panel */
const U_CATCC = ui(['select', 'bra', 'marshal', 'cpa', 'vec'], ['r50', 'cca', 'dep', 'app'], ['info', 'strips'], ['dep', 'marshal', 'coord', 'deck', 'notes'], { comms: true });
const U_DEP = ui(['select', 'bra', 'cpa', 'vec'], ['dep', 'cca', 'r50'], ['info', 'strips'], ['dep', 'coord', 'notes'], { comms: true });
const U_MARSHAL = ui(['select', 'bra', 'marshal', 'cpa', 'vec'], ['app', 'cca', 'r50'], ['info', 'strips'], ['marshal', 'coord', 'notes'], { comms: true });
const U_APPROACH = ui(['select', 'bra', 'cpa', 'vec'], ['app', 'cca'], ['info', 'strips'], ['marshal', 'deck', 'notes'], { comms: true });
const U_FINAL = ui(['select', 'bra', 'cpa'], ['cca', 'app'], ['info', 'strips'], ['deck', 'notes'], { comms: true });
/** CDC: the air picture across the theatre and the sensors feeding it */
const U_CDC = ui(['select', 'bra', 'cpa', 'vec'], ['thr', 'fit', 'bulls', 'cca'], ['info', 'strips'], ['donors', 'notes'], { ringsFar: true, conflicts: 'toggle' });
/** Bridge: conning the ship; no traffic control */
const U_OOD = ui(['select', 'bra', 'cpa'], ['r50', 'cca', 'thr'], ['info'], ['helm', 'csg', 'blights'], { trackUp: true, conflicts: 'off' });

export const SEATS: Record<SeatRole, SeatDef> = {
  strike: S('strike', 'cdc', 'Strike', 'STRIKE', 'radar', P_STRIKE, U_CDC),
  aw: S('aw', 'cdc', 'Air Warfare', 'AW', 'radar', P_AW, U_CDC),
  suw: S('suw', 'cdc', 'Surface Warfare', 'SUW', 'radar', P_SUW, U_CDC),
  catcc: S('catcc', 'catcc', 'CATCC', 'CATCC', 'radar', P_CATCC, U_CATCC),
  airops: S('airops', 'catcc', 'Air Ops', 'AIR OPS', 'radar', P_CATCC, U_CATCC),
  departure: S('departure', 'catcc', 'Departure', 'DEPARTURE', 'radar', P_DEP, U_DEP),
  marshal: S('marshal', 'catcc', 'Marshal', 'MARSHAL', 'radar', P_MARSHAL, U_MARSHAL),
  approach: S('approach', 'catcc', 'Approach', 'APPROACH', 'radar', P_APPROACH, U_APPROACH),
  final: S('final', 'catcc', 'Final', 'FINAL', 'radar', P_FINAL, U_FINAL),
  boss: S('boss', 'prifly', 'Air Boss', 'AIR BOSS', 'boss'),
  miniboss: S('miniboss', 'prifly', 'Mini Boss (Tower)', 'MINI BOSS', 'boss'),
  ood: S('ood', 'bridge', 'Officer of the Deck', 'OOD', 'radar', P_OOD, U_OOD),
  lso: S('lso', 'lso', 'LSO', 'LSO', 'lso'),
  clso: S('clso', 'lso', 'Controlling LSO', 'CONTROLLING', 'lso'),
  blso: S('blso', 'lso', 'Backup LSO', 'BACKUP', 'lso'),
  writer: S('writer', 'lso', 'Writer', 'WRITER', 'lso'),
  mission_commander: S('mission_commander', 'cdc', 'Mission Commander', 'MC', 'radar', P_STRIKE, U_CDC),
};

const LAYOUTS: Record<SeatLayout, Record<LocationId, SeatRole[]>> = {
  condensed: { cdc: ['strike'], catcc: ['catcc'], prifly: ['boss'], bridge: ['ood'], lso: ['lso'] },
  expanded: {
    cdc: ['aw', 'strike', 'suw'],
    catcc: ['airops', 'departure', 'marshal', 'approach', 'final'],
    prifly: ['boss', 'miniboss'],
    bridge: ['ood'],
    lso: ['clso', 'blso', 'writer'],
  },
};

export const seatsAt = (layout: SeatLayout, loc: LocationId): SeatDef[] => LAYOUTS[layout][loc].map((id) => SEATS[id]);

/** Seats in a layout, in location order. */
export const seatsIn = (layout: SeatLayout): SeatDef[] => LOCATIONS.flatMap((l) => seatsAt(layout, l.id));

/**
 * The seat to show for a requested one under a layout: itself if the layout has it, else the seat
 * of the same location the layout uses (an expanded seat in the condensed layout, or vice versa).
 * Old ?m= module links map to their seats.
 */
export function resolveSeat(layout: SeatLayout, want: string | null | undefined): SeatDef {
  const legacy: Record<string, SeatRole> = { radar: 'catcc', lso: 'lso', boss: 'boss' };
  const id = (want && (SEATS as Record<string, SeatDef>)[want] ? want : want ? legacy[want] : undefined) as SeatRole | undefined;
  const def = id ? SEATS[id] : SEATS.catcc;
  const here = seatsAt(layout, def.loc);
  if (here.some((s) => s.id === def.id)) return def;
  // same function in the other layout: Air Ops ↔ CATCC, Controlling LSO ↔ LSO, Strike stays Strike
  return here.find((s) => s.view === def.view && (s.radar?.fit ?? null) === (def.radar?.fit ?? null)) ?? here[0];
}

