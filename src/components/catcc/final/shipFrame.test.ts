/**
 * The Final displays work in the moving ship's frame: trails placed about where the ship was at each dot's
 * time, projection vectors from the velocity relative to the ship. A perfect centreline track then trails
 * along the vertical axis of the AZ/EL display and has no lateral vector, though it crabs over the ground.
 */
import { describe, expect, it } from 'vitest';
import { aeqd } from '../../../catcc/core/geometry/projection.ts';
import { bearingOf, dir, len, type Pt } from '../../../catcc/core/geometry/vec.ts';
import type { WireTrack } from '../../../catcc/core/room/protocol.ts';
import { buildPicture, type Trail } from '../scopeModel.ts';
import { azElX, azElY, finalPicture, finalProjection, glideDeviation, GP_FT_PER_NM, type FinalPicture } from './finalModel.ts';

const CV = { lat: 26.2, lon: 56.8 };
const NOW = 1000;
const BRC = 345;
const FB = 336; // BRC − 9°
const SHIP_KT = 20;
const proj = aeqd(CV.lat, CV.lon);
const ll = (p: Pt) => proj.toLatLon(p);
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
/** the ship's heading `age` s ago, turning right at `w` °/s */
const hdgAt = (age: number, w: number) => BRC - w * age;
/** the ship `age` s ago (now at the origin), integrated over 0.1 s steps */
function shipAt(age: number, w = 0): Pt {
  let p: Pt = [0, 0];
  for (let s = 0; s < age - 1e-9; s += 0.1) p = add(p, dir(hdgAt(s + 0.05, w)), (-SHIP_KT * Math.min(0.1, age - s)) / 3600);
  return p;
}

/**
 * An aircraft on final, `age` s ago at `along` NM astern and `lat` NM right of the final bearing of the
 * ship as it was then, at `alt` ft. Returns the picture and its final picture.
 */
function scenario(path: (age: number) => { along: number; lat: number; alt: number }, w = 0): { fp: FinalPicture; id: string } {
  const posAt = (age: number): Pt => {
    const q = path(age);
    const fb = hdgAt(age, w) - (BRC - FB);
    return add(add(shipAt(age, w), dir(fb + 180), q.along), dir(fb + 90), q.lat);
  };
  // ground velocity and climb rate from 1 s apart
  const v: Pt = [(posAt(0)[0] - posAt(1)[0]) * 3600, (posAt(0)[1] - posAt(1)[1]) * 3600];
  const vs = (path(0).alt - path(1).alt) * 60;
  const hist = new Map<string, Trail[]>();
  hist.set('cv', Array.from({ length: 200 }, (_, i) => ({ t: NOW - 199 + i, ...ll(shipAt(199 - i, w)), alt: 60 })));
  hist.set('j', Array.from({ length: 40 }, (_, i) => ({ t: NOW - 39 + i, ...ll(posAt(39 - i)), alt: path(39 - i).alt })));
  const carrier: WireTrack = { id: 'cv', k: 'carrier', ty: 'CVN_72', hull: 'CVN-72', sd: 'blue', alt: 60, gs: SHIP_KT, crs: BRC, hdg: BRC, ...ll(shipAt(0, w)) };
  const jet: WireTrack = { id: 'j', k: 'fixedwing', ty: 'FA-18C_hornet', sd: 'blue', alt: path(0).alt, gs: len(v), crs: bearingOf(v), vs, ...ll(posAt(0)) };
  const pic = buildPicture([carrier, jet], 'CVN-72', hist, NOW);
  return { fp: finalPicture(pic)!, id: 'j' };
}

const CLOSURE = 130; // kt relative to the ship
const along = (age: number) => 3 + (CLOSURE * age) / 3600;

function devs(fp: FinalPicture, id: string) {
  const a = fp.acs.find((x) => x.t.id === id)!;
  const trail = a.t.trail.map((q, i) => glideDeviation(...fp.toFinalAt(q, a.t.trailT?.[i]), a.t.trailAlt![i]!)!);
  const now = glideDeviation(a.f.along, a.f.lat, a.t.alt)!;
  const [al, la, alt] = finalProjection(fp, a, 10);
  const end = glideDeviation(al, la, alt)!;
  return { a, trail, now, end };
}

describe('Final displays in the ship frame', () => {
  it('a track flying the moving centreline and glidepath: trail on the axis, no vector', () => {
    const { fp, id } = scenario((age) => ({ along: along(age), lat: 0, alt: along(age) * GP_FT_PER_NM }));
    const { a, trail, now, end } = devs(fp, id);
    expect(trail.length).toBe(5);
    for (const d of trail) {
      expect(Math.abs(d.az)).toBeLessThan(0.01);
      expect(Math.abs(d.el)).toBeLessThan(0.01);
    }
    expect(Math.abs(now.az)).toBeLessThan(0.01);
    // the vector: no lateral component, and on the AZ/EL display no length at all
    expect(Math.abs(finalProjection(fp, a, 30)[1] - a.f.lat)).toBeLessThan(1e-3);
    expect(Math.abs(end.az - now.az)).toBeLessThan(0.01);
    expect(Math.abs(end.el - now.el)).toBeLessThan(0.01);
    // over the ground it crabs: placed about the ship's present position, the trail drifts off the axis
    const old = a.t.trail.map((q, i) => glideDeviation(...fp.toFinal(q), a.t.trailAlt![i]!)!);
    expect(Math.max(...old.map((d) => Math.abs(d.az)))).toBeGreaterThan(0.3);
  });

  it('on centreline but low and climbing back to the glideslope: trail and vector along the vertical axis', () => {
    // 150 ft low now, 3 ft/s less low each second
    const { fp, id } = scenario((age) => ({ along: along(age), lat: 0, alt: along(age) * GP_FT_PER_NM - 150 - 3 * age }));
    const { trail, now, end } = devs(fp, id);
    for (const d of trail) expect(Math.abs(d.az)).toBeLessThan(0.01);
    expect(now.el).toBeLessThan(0);
    // older dots lower: the trail runs straight down the axis, the vector straight up it
    for (let i = 1; i < trail.length; i++) expect(trail[i].el).toBeLessThan(trail[i - 1].el);
    expect(end.el).toBeGreaterThan(now.el);
    expect(Math.abs(azElX(end.az) - azElX(now.az))).toBeLessThan(0.5);
    expect(azElY(end.el)).toBeLessThan(azElY(now.el));
  });

  it('a turning ship: the trail is placed on the final bearing of its time', () => {
    // the ship turning right at 0.5 °/s (15° over a ship trail chord), the track on its moving centreline
    const { fp, id } = scenario((age) => ({ along: along(age), lat: 0, alt: along(age) * GP_FT_PER_NM }), 0.5);
    const { a, trail } = devs(fp, id);
    // chord interpolation of the ship's arc costs ~0.1° at 3 NM; held to the present final bearing it is degrees off
    for (const d of trail) expect(Math.abs(d.az)).toBeLessThan(0.15);
    const old = a.t.trail.map((q, i) => glideDeviation(...fp.toFinal(q), a.t.trailAlt![i]!)!);
    expect(Math.max(...old.map((d) => Math.abs(d.az)))).toBeGreaterThan(1);
  });

  it('drifting right of course: the vector points right in azimuth, drawn left on the AZ/EL display', () => {
    // right of the centreline at 30 kt relative to the ship
    const { fp, id } = scenario((age) => ({ along: along(age), lat: 0.05 - (30 * age) / 3600, alt: along(age) * GP_FT_PER_NM }));
    const { a, trail, now, end } = devs(fp, id);
    expect(finalProjection(fp, a, 10)[1]).toBeGreaterThan(a.f.lat);
    expect(end.az).toBeGreaterThan(now.az);
    expect(azElX(end.az)).toBeLessThan(azElX(now.az));
    // the trail came from the left of course: older dots further left in azimuth (drawn further right)
    for (let i = 1; i < trail.length; i++) expect(trail[i].az).toBeLessThan(trail[i - 1].az);
  });
});
