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

export type HookMessage =
  | { type: 'hello'; proto: number; version: string; server: string }
  | { type: 'auth'; ok: true }
  | { type: 'mission'; state: 'running' | 'stopped'; name: string }
  | { type: 'pong' }
  | { type: 'error'; error: string }
  | HookFrame;
