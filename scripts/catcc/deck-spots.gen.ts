// Writes src/components/catcc/prifly/deckSpots.gen.ts from carrier-ops-handoff-2/deck-spots.csv (the
// F/A-18C spots placed by hand on the Aircraft Spotting layer of Nimitz.svg; scripts/catcc/nimitz-spots.py
// makes the CSV).
//
//   node scripts/catcc/deck-spots.gen.ts
//
// The CSV is in DCS's ship frame (x forward, z to STARBOARD, heading in degrees CLOCKWISE from the bow);
// PriFly's deck frame is x forward, y to PORT, headings COUNTER-clockwise from the bow. So y = -z and
// the heading changes sign. Each spot gets a short id for markers and taxi instructions: the area's two
// letters and the spot's number in it (BS1 = Bow stbd 1, E21 = El 2 1).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SPOTS_CSV = path.join(root, 'carrier-ops-handoff-2/deck-spots.csv');
export const SPOTS_TS = path.join(root, 'src/components/catcc/prifly/deckSpots.gen.ts');

const AREA: Record<string, string> = {
  'Bow stbd': 'BS', 'Bow port': 'BP', Crotch: 'CR', Point: 'PT', 'El 1': 'E1', 'El 2': 'E2', 'El 3': 'E3', 'El 4': 'E4',
  Sixpack: 'SP', Corral: 'CO', Patio: 'PA', Stbd: 'ST', Port: 'PO',
};
const r2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- tail-over-the-edge spots: main wheels 4 ft from the edge
// A spot whose tail points at the deck edge (the edge is within 9 m straight behind the jet's reference
// point) is moved along its own heading until the nearer main wheel is 4 ft (1.22 m) from the edge
// (asked for 2026-11-15). The CSV keeps the hand-placed positions; the move is made here and reported.
//   The edge: the flight deck's outline as DCS's own deck crew has it (GroundCrew.lua deck(), the same
//   list as DECK in catcc-dcs/Scripts/CATCC/crewtest_hook.lua: a test keeps the two equal). DCS's ship
//   frame: x forward, z to starboard.
//   The F/A-18C's main wheels: 2.44 m behind the reference point, 1.55 m either side (FA-18C_hornet.lua,
//   main_gear_pos).
export const DECK_OUTLINE: [number, number][] = [
  [-59.12, -36.5], [-119.82, -37.21], [-124.27, -20.36], [-160.7, -15.91], [-163.92, -15.52], [-157.65, 22.74], [-148.72, 21.28], [-143.94, 28.06],
  [-111.84, 32.05], [-111.56, 34.4], [-83.76, 37.21], [-75.53, 37.21], [-75.53, 32.79], [-70.54, 32.79], [-70.54, 37.21], [-64.23, 37.21],
  [-64.23, 24.69], [-36.86, 22.38], [-36.86, 37.21], [41.41, 37.21], [69.15, 37.21], [93.06, 19.18], [167.53, 12.21], [167.53, -12.21],
  [92.02, -19.2], [63.1, -40.59], [35.69, -40.59], [15.11, -36.51], [-55.75, -36.5], [-55.75, -39.25], [-59.1, -39.25],
];
export const EDGE = { mainGearAft: 2.4378, mainGearSide: 1.55, wheelsFromEdge: 1.2192, tailWithin: 9, maxMove: 9 };

const inside = (x: number, z: number): boolean => {
  let inn = false;
  for (let i = 0, j = DECK_OUTLINE.length - 1; i < DECK_OUTLINE.length; j = i++) {
    const [ax, az] = DECK_OUTLINE[i];
    const [bx, bz] = DECK_OUTLINE[j];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inn = !inn;
  }
  return inn;
};
/** how far a point is inside the deck's edge (negative: outside it) */
export const insideBy = (x: number, z: number): number => {
  let best = Infinity;
  for (let i = 0, j = DECK_OUTLINE.length - 1; i < DECK_OUTLINE.length; j = i++) {
    const [ax, az] = DECK_OUTLINE[j];
    const [bx, bz] = DECK_OUTLINE[i];
    const ex = bx - ax;
    const ez = bz - az;
    const k = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    best = Math.min(best, Math.hypot(x - ax - ex * k, z - az - ez * k));
  }
  return inside(x, z) ? best : -best;
};
/** how far the deck's edge is from x, z along the unit vector dx, dz (Infinity: none that way) */
const edgeAlong = (x: number, z: number, dx: number, dz: number): number => {
  let best = Infinity;
  for (let i = 0, j = DECK_OUTLINE.length - 1; i < DECK_OUTLINE.length; j = i++) {
    const [ax, az] = DECK_OUTLINE[j];
    const [bx, bz] = DECK_OUTLINE[i];
    const ex = bx - ax;
    const ez = bz - az;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((ax - x) * ez - (az - z) * ex) / den;
    const u = ((ax - x) * dz - (az - z) * dx) / den;
    if (t > 1e-6 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
};
/** the nearer main wheel's distance inside the edge, for a jet at x, z heading hdg (degrees clockwise from the bow) */
export const wheelsInside = (x: number, z: number, hdgCw: number): number => {
  const a = (hdgCw * Math.PI) / 180;
  const [hx, hz] = [Math.cos(a), Math.sin(a)];
  const [rx, rz] = [-hz, hx];
  const [mx, mz] = [x - EDGE.mainGearAft * hx, z - EDGE.mainGearAft * hz];
  return Math.min(insideBy(mx + EDGE.mainGearSide * rx, mz + EDGE.mainGearSide * rz), insideBy(mx - EDGE.mainGearSide * rx, mz - EDGE.mainGearSide * rz));
};
/** an edge spot's place with its main wheels 4 ft from the edge: [x, z, metres moved along the heading] (0: not an edge spot) */
export function edgeAdjusted(x: number, z: number, hdgCw: number): [number, number, number] {
  const a = (hdgCw * Math.PI) / 180;
  const [hx, hz] = [Math.cos(a), Math.sin(a)];
  if (edgeAlong(x, z, -hx, -hz) > EDGE.tailWithin) return [x, z, 0];
  const f = (t: number) => wheelsInside(x + t * hx, z + t * hz, hdgCw) - EDGE.wheelsFromEdge;
  // the move nearest to none at which the wheels are 4 ft inside: looked for outwards from where the spot is
  let lo: number | null = null;
  let hi: number | null = null;
  for (let d = 0.25; d <= EDGE.maxMove && lo === null; d += 0.25) {
    for (const [p, q] of [[d - 0.25, d], [-d, -(d - 0.25)]] as [number, number][]) {
      if (lo === null && f(p) * f(q) <= 0) [lo, hi] = [p, q];
    }
  }
  if (lo === null || hi === null) return [x, z, 0];
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (f(lo) * f(mid) <= 0) hi = mid;
    else lo = mid;
  }
  const t = (lo + hi) / 2;
  return [x + t * hx, z + t * hz, t];
}

/** the spots the last buildSpotsTs moved: how far along the heading (m, + forward), and where the wheels were before */
export const movedSpots: { name: string; moved: number; was: number }[] = [];

export function buildSpotsTs(csv = fs.readFileSync(SPOTS_CSV, 'utf8')): string {
  movedSpots.length = 0;
  const rows = csv.trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
  const lines = rows.map((c) => {
    const [n, name, x, , z, hdg] = c;
    const m = /^(.*) (\d+)$/.exec(name);
    if (!m || !AREA[m[1]]) throw new Error(`deck-spots.csv: no short id for "${name}"`);
    const ccw = r2(-Number(hdg) + (Number(hdg) > 180 ? 360 : 0)); // -180..180, counter-clockwise from the bow
    const [ax, az, moved] = edgeAdjusted(Number(x), Number(z), Number(hdg));
    if (moved !== 0) movedSpots.push({ name, moved, was: wheelsInside(Number(x), Number(z), Number(hdg)) });
    return `  { n: ${n}, id: '${AREA[m[1]]}${m[2]}', label: '${name}', area: '${m[1]}', p: [${r2(ax)}, ${r2(-az)}], hdg: ${ccw} },`;
  });
  return `// GENERATED by scripts/catcc/deck-spots.gen.ts from carrier-ops-handoff-2/deck-spots.csv - do not edit.
// The F/A-18C deck spots: where aircraft are parked and where players spawn. PriFly's deck frame:
// metres, x forward, y to port; hdg: the way the parked jet points, degrees counter-clockwise from the bow.
// p is the jet's DCS reference point (8.58 m behind the nose). n: the spot's number in the CSV, which is
// also its place in DCS's spawn table (GT.TaxiForTORoutes) when the spots are installed there.
// A spot whose tail points at the deck edge is not where the CSV has it: it is moved along its heading so
// that the nearer main wheel is 4 ft from the edge (see the generator).
export interface DeckSpot {
  n: number;
  id: string;
  label: string;
  area: string;
  p: [number, number];
  hdg: number;
}

export const DECK_SPOTS: DeckSpot[] = [
${lines.join('\n')}
];
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(SPOTS_TS, buildSpotsTs());
  console.log('wrote', SPOTS_TS);
  for (const m of movedSpots) console.log(`  ${m.name}: moved ${m.moved.toFixed(2)} m along its heading (main wheels were ${m.was.toFixed(2)} m inside the edge, now ${EDGE.wheelsFromEdge.toFixed(2)})`);
  console.log(`  ${movedSpots.length} edge spots moved`);
}
