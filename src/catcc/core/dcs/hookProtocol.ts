/** Messages sent by the CATCC DCS export hook (catcc-dcs/Scripts/CATCC/catcc.lua), protocol v1. */

export interface CarrierWx {
  /** wind FROM, degrees true, and speed m/s: at deck (d0/s0), 2,000 ft (d2/s2), 10,000 ft (d10/s10) */
  d0: number | null;
  s0: number | null;
  d2: number | null;
  s2: number | null;
  d10: number | null;
  s10: number | null;
  /** sea-level temperature (K) and pressure (Pa) at the ship */
  tK: number | null;
  qnh: number | null;
}

export interface HookUnit {
  /** DCS runtime unit id */
  id: number;
  /** unit name */
  n: string;
  /** DCS type name */
  t: string;
  /** group name */
  g: string;
  /** coalition: 0 neutral, 1 red, 2 blue */
  s: 0 | 1 | 2;
  /** category: Airplane, Helicopter, Ship */
  c: 'A' | 'H' | 'S';
  /** player name, null for AI */
  p: string | null;
  /** DCS callsign string */
  cs: string;
  lat: number;
  lon: number;
  /** metres MSL */
  alt: number;
  /** true heading, degrees */
  hdg: number;
  /** groundspeed m/s */
  gs: number;
  /** course over ground, degrees true (null when nearly stationary) */
  crs: number | null;
  /** vertical speed m/s */
  vs: number;
  /** fuel as a fraction of internal capacity (>1 with external tanks); aircraft only */
  f?: number;
  air?: boolean;
  /** ships: the DCS unit database's display name, e.g. "CG Ticonderoga" */
  dn?: string;
  /** carriers only */
  wx?: CarrierWx;
}

export interface HookFrame {
  type: 'frame';
  seq: number;
  /** model time, s since mission start */
  mt: number;
  /** mission local time, s since midnight of `date` */
  abs: number;
  date: string | null;
  theatre: string | null;
  unitErrors: number;
  units: HookUnit[];
  err?: string;
}

/** Mission weather as set in the mission editor (DCS has no dew point or cloud layers beyond one). */
export interface MissionWx {
  /** cloud base and thickness, metres MSL; density 0-10 (legacy clouds) */
  cb: number | null;
  ct: number | null;
  cd: number | null;
  /** DCS 2.7+ cloud preset name, e.g. "Preset14", "RainyPreset2" */
  cp: string | null;
  /** precipitation: 0 none, 1 rain, 2 thunderstorm, 3 snow, 4 snowstorm */
  pr: number | null;
  /** visibility, metres */
  vis: number | null;
  fog: { v: number; t: number } | null;
  dust: number | null;
}

export interface RoutePoint {
  lat: number;
  lon: number;
  /** m/s */
  spd: number;
  /** seconds after mission start */
  eta: number;
}

export interface ShipRoute {
  /** DCS group name */
  g: string;
  side: string;
  pts: RoutePoint[];
}

/** Slow-changing mission environment, sent every ~30 s. */
export interface HookEnv {
  /** mission start, seconds after local midnight of `date` */
  start: number;
  date: string | null;
  theatre: string | null;
  wx: MissionWx;
  routes: ShipRoute[];
  /** coalition bullseyes (absent from older hooks) */
  bulls?: { side: 'blue' | 'red'; lat: number; lon: number }[];
}

/** A waypoint of a ship order. */
export interface OrderPoint {
  lat: number;
  lon: number;
  kt: number;
}

/**
 * Ship orders the hook accepts when its config sets commands = true. DCS AI ships take routes only (no
 * rudder or engine orders): a helm order becomes a waypoint 60 NM ahead on the course.
 */
export type ShipCmd =
  | { op: 'helm'; g: string; crs: number; kt: number }
  | { op: 'route'; g: string; pts: OrderPoint[] }
  /** Air Boss ship control (Supercarrier ships): heading order and engine bell (1..9), or back to automatic */
  | { op: 'bridge'; g: string; crs?: number; bell?: number; auto?: true };

/**
 * Launch holds: the DCS player names to hold on deck (PriFly hasn't cleared them). The hook passes
 * the list to the pilots' mod; it forgets it (no holds) if the room stops refreshing it.
 */
export type LaunchCmd = { op: 'launch'; hold: string[]; /** players whose chocks are held (no taxi instruction yet) */ chocks?: string[] };

/** What a pilot's mod reports besides the salute: */
export type PilotEvent =
  /** asked for the chocks to come off (held: ready to taxi) */
  | 'taxi'
  /** launch bar down / up */
  | 'lb1'
  | 'lb0';

export type HookMessage =
  | { type: 'hello'; proto: number; version: string; server: string; cmds?: boolean; ab?: boolean }
  | { type: 'cmd'; id: number | null; ok: boolean; error?: string }
  /** a pilot's mod reports the pilot's salute (player name) */
  | { type: 'salute'; p: string }
  | { type: 'pilotev'; e: PilotEvent; p: string }
  | { type: 'auth'; ok: true }
  | { type: 'mission'; state: 'running' | 'stopped'; name: string }
  | { type: 'pong' }
  | { type: 'error'; error: string }
  | HookFrame
  | ({ type: 'env' } & HookEnv);
