// DCS's spawn table for the Supercarrier, rebuilt from the spotting plan: writes director-spots.lua, the
// block director-test.ps1 -Spawn Spots appends to USS_Nimitz_RunwaysAndRoutes.lua.
//
//   node catcc-dcs/deck-test/spots.gen.ts
//
// A deck spawn spot is the first point of its GT.TaxiForTORoutes route (there is no other fixed-wing
// spawn table: players spawn within 0.5 m of those points), and the jet points toward the route's
// second point. So the 40 deck spots (src/components/catcc/prifly/deckSpots.gen.ts, from
// carrier-ops-handoff-2/deck-spots.csv) become 40 routes, in the CSV's order:
//   point 1   the spot (with DCS's "terminal size" 20, as every stock spot has)
//   point 2   straight ahead of the nose (10 m, or 60% of the spot's own feeder if that is shorter): the heading
//   then      the corners of PriFly's taxi route (taxiNet.ts) from that spot to a catapult, ending 5 m
//             short of the shuttle on the track's line, as the stock routes do
// DCS wants one catapult per route (RunwayIdx). Each deck area is given the catapult on its own side
// and end of the ship (AREA_CAT), so AI aircraft spread over all four instead of queueing for the nearest.
// AI aircraft taxi these routes; players only spawn on them (with the deck crew option off nobody
// directs a player along one).
//
// Frames: PriFly's deck is x forward, y to PORT; DCS's ship frame is x forward, y up, z to STARBOARD.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATS } from '../../src/components/catcc/prifly/deck.ts';
import { routeLength, smoothRoute, taxiWaypoints } from '../../src/components/catcc/prifly/taxiNet.ts';
import { DECK_SPOTS } from '../../src/components/catcc/prifly/deckSpots.gen.ts';

type V = [number, number];
const here = path.dirname(fileURLToPath(import.meta.url));
export const SPOTS_LUA = path.join(here, 'director-spots.lua');
const DECK_Y = 20.1494;
const D = Math.PI / 180;
const f = (v: number) => (Math.round(v * 100) / 100).toFixed(2);
const dist = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export interface SpawnRoute {
  n: number;
  name: string;
  cat: number;
  /** DCS ship frame: [x forward, z starboard] */
  pts: V[];
  len: number;
}

/** the catapult each deck area's spots are routed to in DCS's table */
export const AREA_CAT: Record<string, number> = {
  'Bow stbd': 1, Point: 1, 'El 1': 1, Corral: 1, 'El 2': 1,
  'Bow port': 2, Crotch: 2, Sixpack: 2,
  'El 3': 3, Patio: 3, Stbd: 3,
  Port: 4, 'El 4': 4,
};

/** a route's corners: points in line with their neighbours dropped */
function corners(wp: V[]): V[] {
  const c: V[] = [];
  for (const q of wp) {
    if (c.length && dist(c[c.length - 1], q) < 0.05) continue;
    if (c.length >= 2) {
      const [a, b] = [c[c.length - 2], c[c.length - 1]];
      const turn = Math.abs(((Math.atan2(q[1] - b[1], q[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0])) / D + 540) % 360 - 180);
      if (turn < 1) {
        c[c.length - 1] = q;
        continue;
      }
    }
    c.push(q);
  }
  return c;
}

// ---------------------------------------------------------------- parking routes (GT.TaxiRoutes)
// Where AI aircraft taxi after landing: DCS's table of routes from the landing area to a parking place.
// As shipped there are 16, every one starting where the roll-out ends (13 m forward, 19 m to port) and
// ending on a parking place; ten of those places are also spawn spots. With the spawn spots replaced and
// the parking routes left alone, the AI four-ship held to port and never came aboard (runs 8 and 9,
// 2026-11-14): so the parking routes are rebuilt to end on the plan's spots.
//   * 31 of the 40 spots: every spot on the starboard side and the bow. The port side (Port 1-5, El 4)
//     and the stern (Stbd 1-2) are in or beside the landing area and get no parking route.
//   * The order is DCS's own, place for place where the plan has one: 1-2 the patio, 4-5 EL 3, 10-11
//     EL 2, 12 the corral, 13-14 the point, 15-16 EL 1; and 6-9, DCS's "blocker" places abeam the island
//     (GT.BlockerTerminals = {6,7,8,9}: when one is taken, places with greater numbers are looked for),
//     are four of the six-pack, which stands across the street the same way. The rest follow from 17.
//   * Each route: the stock first point, the bend of PriFly's turn-round road (a right turn off the
//     landing area), then the corners of PriFly's taxi route from there to the spot. The aircraft arrives
//     up the spot's feeder, so it parks pointing the opposite way to a jet spawned there (as on DCS's
//     own elevator places). Elevator spots keep DCS's 180 s wait on the last point.
export const PARK_ORDER = [
  'PA2', 'PA1', 'CO2', 'E32', 'E31', 'SP6', 'SP5', 'SP4', 'SP3', 'E22', 'E21', 'CO1', 'PT2', 'PT3', 'E12', 'E11',
  'PT4', 'PT1', 'SP2', 'SP1', 'BS5', 'BS4', 'BS3', 'BS2', 'BS1', 'CR3', 'CR2', 'CR1', 'BP3', 'BP2', 'BP1',
];
/** where the roll-out ends: the first point of every stock parking route (PriFly frame: y to port) */
const LA_EXIT: V = [13, 19];

export interface ParkRoute {
  n: number;
  id: string;
  name: string;
  /** DCS ship frame: [x forward, z starboard] */
  pts: V[];
  /** an elevator spot: DCS's 180 s wait on the last point */
  wait: boolean;
}

export function buildParkRoutes(): ParkRoute[] {
  // taxiNet.ts: the turn-round road's bend, and where that road crosses the artery (the bow fan). The route
  // is worked out from the fan on: started on the bend, the solver (free to leave a junction any way)
  // took some aircraft straight back into the landing area.
  const x = DECK_SPOTS.find((q) => q.id === 'E12')!.p[0];
  const turn: V = [x, 11];
  const fan: V = [x, -15.5 + ((x + 100) * 7) / 120];
  return PARK_ORDER.map((id, i) => {
    const s = DECK_SPOTS.find((q) => q.id === id);
    if (!s) throw new Error(`no deck spot ${id}`);
    const wp = taxiWaypoints(fan, id, -90);
    if (!wp) throw new Error(`no parking route to deck spot ${id}`);
    const pts: V[] = [LA_EXIT, ...corners([turn, ...wp])];
    return { n: i + 1, id, name: s.label, pts: pts.map((p): V => [p[0], -p[1]]), wait: s.area.startsWith('El ') };
  });
}

export function buildSpawnRoutes(): SpawnRoute[] {
  return DECK_SPOTS.map((s) => {
    const cat = AREA_CAT[s.area];
    const wp = cat ? taxiWaypoints(s.p, `C${cat}`, s.hdg) : null;
    if (!wp) throw new Error(`no route from deck spot ${s.n} (${s.label}) to its catapult`);
    const best = { cat, wp, len: routeLength(smoothRoute(wp)) };
    const c = corners(best.wp);
    const h: V = [Math.cos(s.hdg * D), Math.sin(s.hdg * D)];
    const lead = Math.min(10, 0.6 * dist(c[0], c[1]));
    const [a, b] = CATS[String(best.cat)];
    const u = dist(a, b);
    const short: V = [a[0] - ((b[0] - a[0]) / u) * 5, a[1] - ((b[1] - a[1]) / u) * 5];
    const pts: V[] = [s.p, [s.p[0] + h[0] * lead, s.p[1] + h[1] * lead], ...c.slice(1, -1), short];
    return { n: s.n, name: s.label, cat: best.cat, pts: pts.map((p): V => [p[0], -p[1]]), len: best.len };
  });
}

export function buildSpotsLua(): string {
  const routes = buildSpawnRoutes();
  const body = routes.map((r) => {
    const last = r.pts.length - 1;
    const lines = r.pts.map((p, i) => {
      const speed = i <= 1 || i >= last - 1 ? '1.0' : '2.0';
      return `      {{${f(p[0]).padStart(8)}, ${DECK_Y}, ${f(p[1]).padStart(7)}}, ${speed}${i === 0 ? ', 20.0' : ''}},`;
    });
    return `  { RunwayIdx = ${r.cat}, Points =\n    { -- ${r.n} ${r.name} -> catapult ${r.cat} (${Math.round(r.len)} m)\n${lines.join('\n')}\n    }\n  },`;
  });
  const park = buildParkRoutes().map((r) => {
    const last = r.pts.length - 1;
    const lines = r.pts.map((p, i) => {
      const speed = i === 0 ? '5.0' : i === last ? '1.0' : i === last - 1 ? '2.0' : '3.0';
      return `    {{${f(p[0]).padStart(8)}, ${DECK_Y}, ${f(p[1]).padStart(7)}}, ${speed}${i === last && r.wait ? ', 180.0' : ''}},`;
    });
    return `  { -- ${r.n} parking spot: ${r.name}\n${lines.join('\n')}\n  },`;
  });
  return `-- GENERATED by catcc-dcs/deck-test/spots.gen.ts from the spotting plan (carrier-ops-handoff-2/deck-spots.csv)
-- and PriFly's taxi network (src/components/catcc/prifly/taxiNet.ts) - do not edit.
-- director-test.ps1 -Spawn Spots appends this, wrapped in "do ... end", to the end of
-- USS_Nimitz_RunwaysAndRoutes.lua: DCS's 16 deck spawn spots are replaced by the 40 of the spotting plan,
-- and its 16 parking routes by 31 that end on spots of the plan.
-- A spawn spot is the first point of its route; the jet points toward the second; the rest is the taxi
-- route AI aircraft follow to the catapult named by RunwayIdx. Ship coordinates: x forward, y up, z to
-- starboard, metres. Plain Lua 5.1 (DCS); also run under fengari by the tests.
GT.TaxiForTORoutes =
{
${body.join('\n')}
}
GT.TaxiForTORoutes.RoutesForTONumber = #GT.TaxiForTORoutes

-- Where AI aircraft park after landing: from where the roll-out ends to a spot of the plan (spots.gen.ts
-- says which, and why in this order). The last number on an elevator spot is DCS's wait there, seconds.
GT.TaxiRoutes =
{
${park.join('\n')}
}
GT.TaxiRoutes.RoutesNumber = #GT.TaxiRoutes
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(SPOTS_LUA, buildSpotsLua());
  const r = buildSpawnRoutes();
  console.log(`${buildParkRoutes().length} parking routes;`);
  console.log(`${r.length} spawn routes written to ${path.relative(process.cwd(), SPOTS_LUA)}: ${[1, 2, 3, 4].map((k) => `catapult ${k}: ${r.filter((q) => q.cat === k).length}`).join(', ')}`);
}
