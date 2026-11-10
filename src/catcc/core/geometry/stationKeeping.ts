/**
 * Ordering escorts to their stations through the DCS hook. DCS AI ships only take routes, so each
 * order is a two-point route: to where the station will be a few minutes from now (the carrier's
 * course and speed held), at the speed that gets there on time, then on along the carrier's course
 * at the carrier's speed. Re-issued as the picture changes, it closes the station and then keeps it.
 */
import type { OrderPoint } from '../dcs/hookProtocol.ts';
import { stationCentre } from './formation.ts';
import type { Station } from '../room/ops.ts';

/** how far ahead the station is aimed at, minutes */
export const STATION_LEAD_MIN = 10;
/** escort speed limits for station orders, kt */
export const STATION_MIN_KT = 3;
export const STATION_MAX_KT = 30;

interface Ll {
  lat: number;
  lon: number;
}

/** A point `nm` NM from `p` on true bearing `brg` (flat about p: fine to tens of NM). */
export function offsetLl(p: Ll, brg: number, nm: number): Ll {
  const r = (brg * Math.PI) / 180;
  return { lat: p.lat + (nm * Math.cos(r)) / 60, lon: p.lon + (nm * Math.sin(r)) / (60 * Math.cos((p.lat * Math.PI) / 180)) };
}

export function distNm(a: Ll, b: Ll): number {
  const k = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot((b.lat - a.lat) * 60, (b.lon - a.lon) * 60 * k);
}

/**
 * The route that takes an escort to its station. `axis` is the formation axis (deg true), `carrier`
 * its position, course over ground and speed. Returns null for a free station.
 */
export function stationOrder(station: Station, axis: number, carrier: Ll & { crs: number; kt: number }, escort: Ll): OrderPoint[] | null {
  const c = stationCentre(station);
  if (!c) return null;
  const lead = STATION_LEAD_MIN / 60;
  const ahead = offsetLl(carrier, carrier.crs, Math.max(0, carrier.kt) * lead);
  const target = offsetLl(ahead, axis + c.b, c.r);
  const kt = Math.min(STATION_MAX_KT, Math.max(STATION_MIN_KT, distNm(escort, target) / lead));
  const beyond = offsetLl(target, carrier.crs, 60);
  const r = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;
  return [
    { lat: r(target.lat, 6), lon: r(target.lon, 6), kt: r(kt, 1) },
    { lat: r(beyond.lat, 6), lon: r(beyond.lon, 6), kt: r(Math.max(STATION_MIN_KT, carrier.kt), 1) },
  ];
}

/** Whether a new station order differs enough from the last one sent to be worth sending. */
export function orderChanged(prev: OrderPoint[] | undefined, next: OrderPoint[], ageS: number): boolean {
  if (!prev || ageS > 120) return true;
  return distNm(prev[0], next[0]) > 0.3 || Math.abs(prev[0].kt - next[0].kt) > 1;
}
