import type { AcmiEvent } from './parser.ts';

/** Absolute transform; any field may be unknown until first reported. */
export interface AcmiTransform {
  lon?: number;
  lat?: number;
  /** metres MSL */
  alt?: number;
  roll?: number;
  pitch?: number;
  yaw?: number;
  /** native (DCS) flat-earth coordinates, metres */
  u?: number;
  v?: number;
  /** true heading, degrees */
  heading?: number;
}

export interface AcmiObject {
  id: string;
  props: Record<string, string>;
  transform: AcmiTransform;
  /** sim time (s after ReferenceTime) of first and latest update */
  firstSeen: number;
  lastSeen: number;
}

/** AcmiState.snapshot(): the object table at one moment */
export interface AcmiSnapshot {
  t: number;
  refLon: number;
  refLat: number;
  referenceTime?: Date;
  header: Record<string, string>;
  globals: Record<string, string>;
  objects: AcmiObject[];
}

const T_FIELDS: Record<number, (keyof AcmiTransform)[]> = {
  3: ['lon', 'lat', 'alt'],
  5: ['lon', 'lat', 'alt', 'u', 'v'],
  6: ['lon', 'lat', 'alt', 'roll', 'pitch', 'yaw'],
  9: ['lon', 'lat', 'alt', 'roll', 'pitch', 'yaw', 'u', 'v', 'heading'],
};

/**
 * Applies ACMI events to an object table. Longitude/latitude in T= are offsets from the
 * global ReferenceLongitude/ReferenceLatitude; empty T components mean "unchanged".
 */
export class AcmiState {
  t = 0;
  refLon = 0;
  refLat = 0;
  referenceTime?: Date;
  readonly header: Record<string, string> = {};
  readonly globals: Record<string, string> = {};
  readonly objects = new Map<string, AcmiObject>();

  reset(): void {
    this.t = 0;
    this.refLon = 0;
    this.refLat = 0;
    this.referenceTime = undefined;
    for (const k of Object.keys(this.header)) delete this.header[k];
    for (const k of Object.keys(this.globals)) delete this.globals[k];
    this.objects.clear();
  }

  /** A copy of the whole table (a replay's keyframe); restore() puts it back. */
  snapshot(): AcmiSnapshot {
    const objects: AcmiObject[] = [];
    for (const o of this.objects.values()) objects.push({ ...o, props: { ...o.props }, transform: { ...o.transform } });
    return { t: this.t, refLon: this.refLon, refLat: this.refLat, referenceTime: this.referenceTime, header: { ...this.header }, globals: { ...this.globals }, objects };
  }

  restore(s: AcmiSnapshot): void {
    this.reset();
    this.t = s.t;
    this.refLon = s.refLon;
    this.refLat = s.refLat;
    this.referenceTime = s.referenceTime;
    Object.assign(this.header, s.header);
    Object.assign(this.globals, s.globals);
    // copies again: the keyframe stays as it was however the table moves on
    for (const o of s.objects) this.objects.set(o.id, { ...o, props: { ...o.props }, transform: { ...o.transform } });
  }

  /** Current sim time as UTC, if ReferenceTime is known. */
  get utc(): Date | undefined {
    return this.referenceTime ? new Date(this.referenceTime.getTime() + this.t * 1000) : undefined;
  }

  /** Returns the touched object for update events (undefined otherwise). */
  apply(ev: AcmiEvent): AcmiObject | undefined {
    switch (ev.kind) {
      case 'header':
        this.header[ev.key] = ev.value;
        return undefined;
      case 'time':
        this.t = ev.t;
        return undefined;
      case 'remove':
        this.objects.delete(ev.id);
        return undefined;
      case 'update':
        if (ev.id === '0') {
          this.applyGlobals(ev.props);
          return undefined;
        }
        return this.applyObject(ev.id, ev.props);
    }
  }

  private applyGlobals(props: Record<string, string>): void {
    Object.assign(this.globals, props);
    if (props.ReferenceLongitude !== undefined) this.refLon = Number(props.ReferenceLongitude) || 0;
    if (props.ReferenceLatitude !== undefined) this.refLat = Number(props.ReferenceLatitude) || 0;
    if (props.ReferenceTime !== undefined) {
      const d = new Date(props.ReferenceTime);
      if (!Number.isNaN(d.getTime())) this.referenceTime = d;
    }
  }

  private applyObject(id: string, props: Record<string, string>): AcmiObject {
    let obj = this.objects.get(id);
    if (!obj) {
      obj = { id, props: {}, transform: {}, firstSeen: this.t, lastSeen: this.t };
      this.objects.set(id, obj);
    }
    obj.lastSeen = this.t;
    for (const key in props) {
      if (key === 'T') this.applyTransform(obj.transform, props.T);
      else obj.props[key] = props[key];
    }
    return obj;
  }

  private applyTransform(tr: AcmiTransform, value: string): void {
    const parts = value.split('|');
    const fields = T_FIELDS[parts.length];
    if (!fields) return;
    for (let i = 0; i < fields.length; i++) {
      const s = parts[i];
      if (s === '') continue;
      const n = Number(s);
      if (!Number.isFinite(n)) continue;
      const f = fields[i];
      tr[f] = f === 'lon' ? this.refLon + n : f === 'lat' ? this.refLat + n : n;
    }
  }
}
