// Taxi routes for the crew test's "Marshal me to catapult N": PriFly's own taxi network
// (src/components/catcc/prifly/taxiNet.ts, the solver PriFly's click-to-send uses), run from every
// deck spot to each of the four catapults, written out as a Lua table for the hook.
//
//   node catcc-dcs/deck-test/crew-test/routes.gen.ts        (writes catcc-dcs/Scripts/CATCC/crewtest_routes.lua)
//
// In the real thing PriFly's room works a route out from the jet's live position and sends it to the
// pilot's PC; this file stands in for that link so the marshalling can be tried on one PC without the
// room. Starts: the 40 deck spots of the spotting plan (src/components/catcc/prifly/deckSpots.gen.ts,
// from carrier-ops-handoff-2/deck-spots.csv), which are where players spawn once the spots are in DCS's
// spawn table (director-test.ps1 -Spawn Spots). Every spot is a spot of PriFly's network: its route
// leaves straight ahead, the way the jet is parked. The hook takes the start nearest to the jet.
// (On DCS's own 16 spawn spots, without -Spawn Spots, the jet is on none of these starts: the hook says so.)
//
// Frames: PriFly's deck is x forward, y to PORT, headings in degrees counter-clockwise from the bow;
// DCS's ship frame (what the hook and the crew use) is x forward, z to STARBOARD. So z = -y.
// Routes are thinned to a point about every 2 m (the solver gives one a metre): corners keep their shape.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { smoothRoute, taxiRoute, TAXI_DESTS, TAXI_GRAPH } from '../../../src/components/catcc/prifly/taxiNet.ts';
import { NIMITZ } from '../../../src/components/catcc/prifly/deck.ts';
import { DECK_SPOTS } from '../../../src/components/catcc/prifly/deckSpots.gen.ts';
import { buildParkRoutes } from '../spots.gen.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

const f = (v: number) => (Math.round(v * 100) / 100).toString();
const f3 = (v: number) => (Math.round(v * 1000) / 1000 + 0).toString();
const thin = (pts: [number, number][], step = 2): [number, number][] => {
  const out: [number, number][] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const last = out[out.length - 1];
    if (Math.hypot(pts[i][0] - last[0], pts[i][1] - last[1]) >= step) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out;
};

/** the Lua file's text, and what went into it (the test catcc-dcs/test/crewtest.test.ts checks the file on disk against this) */
export function buildRoutesLua(): { text: string; routes: number; starts: number; missing: number; parking: number } {
  const lines: string[] = [];
  let count = 0;
  let missing = 0;
  for (const s of DECK_SPOTS) {
    const [x, z] = [s.p[0], -s.p[1]];
    const routes: string[] = [];
    for (const cat of ['1', '2', '3', '4']) {
      const route = taxiRoute(s.p, `C${cat}`, s.hdg);
      if (!route || route.length < 2) {
        missing++;
        continue;
      }
      const pts = thin(route.map((q): [number, number] => [q[0], -q[1]]));
      routes.push(`    [${cat}] = { ${pts.map((q) => `{${f(q[0])},${f(q[1])}}`).join(',')} },`);
      count++;
    }
    const rad = (s.hdg * Math.PI) / 180;
    lines.push(`  { spot = ${s.n}, id = "${s.id}", name = "${s.label}", area = "${s.area}", x = ${f(x)}, z = ${f(z)}, fx = ${f3(Math.cos(rad))}, fz = ${f3(-Math.sin(rad))}, routes = {\n${routes.join('\n')}\n  } },`);
  }
  // the way to park: from where the roll-out ends to each spot that has a parking route (spots.gen.ts: the
  // same routes DCS's own table gets), with the corners filleted as PriFly draws a route
  const parking = buildParkRoutes().map((r) => {
    const spot = DECK_SPOTS.find((q) => q.id === r.id)!;
    const pts = thin(smoothRoute(r.pts.map((q): [number, number] => [q[0], -q[1]])).map((q): [number, number] => [q[0], -q[1]]));
    return `    { spot = ${spot.n}, id = "${r.id}", name = "${r.name}", area = "${spot.area}", route = { ${pts.map((q) => `{${f(q[0])},${f(q[1])}}`).join(',')} } },`;
  });
  // the network itself, for the tow (the hook's Tow.Net solves on it as taxiNet.ts does: a tow starts wherever the
  // jet stands and may end on any spot, which is too many routes to write out): the graph's junctions, which
  // junctions each is joined to (numbered from 1), the junction of every destination (C1..C4 and the spots' ids),
  // and what a leg off the roads must stay clear of (PriFly's deck outline, the island and the radar mast)
  const f5 = (v: number) => (Math.round(v * 1e5) / 1e5 + 0).toString();
  const poly = (q: number[][]) => `{ ${q.map((v) => `{${f5(v[0])},${f5(-v[1])}}`).join(',')} }`;
  const destNode = TAXI_DESTS.map((d) => [d.id, TAXI_GRAPH.nodes.findIndex((n) => Math.hypot(n[0] - d.p[0], n[1] - d.p[1]) < 0.25)] as const);
  const net = `  net = {
    nodes = ${poly(TAXI_GRAPH.nodes)},
    adj = { ${TAXI_GRAPH.adj.map((a) => `{${a.map((i) => i + 1).join(',')}}`).join(',')} },
    dest = { ${destNode.filter(([, i]) => i >= 0).map(([id, i]) => `${id} = ${i + 1}`).join(', ')} },
    outline = ${poly(NIMITZ.outline)},
    struct = { ${[NIMITZ.struct['Island'], NIMITZ.struct['Radar Mast']].map(poly).join(', ')} },
  },`;
  const text = `-- GENERATED by catcc-dcs/deck-test/crew-test/routes.gen.ts from PriFly's taxi network
-- (src/components/catcc/prifly/taxiNet.ts) - do not edit. TEST ONLY: stands in for the route PriFly
-- would send. Each entry: a deck spot of the spotting plan (its number in DCS's spawn table once the
-- spots are installed there), in ship coordinates (x forward, z to starboard, metres), the way a jet
-- parked on it points (fx, fz: a unit vector in the same coordinates), and the taxi route from there to
-- each catapult's shuttle: routes[catapult] = { {x, z}, ... }.
-- parking: for each spot AI aircraft can be parked on, the way there from where the roll-out ends, in
-- DCS's own order of parking places: { spot, id, name, area, route = { {x, z}, ... } }.
-- net: the taxi network itself (the tow solves on it): nodes = { {x, z}, ... }, adj[i] = the nodes node i is
-- joined to, dest = the node of each destination (C1..C4, the spots' ids), outline / struct = the deck's edge
-- and the island and radar mast (a leg off the roads stays inside the one and out of the others).
return {
${lines.join('\n')}
  parking = {
${parking.join('\n')}
  },
${net}
}
`;
  return { text, routes: count, starts: lines.length, missing, parking: parking.length };
}

export const ROUTES_LUA = path.join(here, '../../Scripts/CATCC/crewtest_routes.lua');

// run as a script: write the file
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = buildRoutesLua();
  fs.writeFileSync(ROUTES_LUA, out.text);
  console.log(`${out.routes} routes from ${out.starts} starts written to ${path.relative(process.cwd(), ROUTES_LUA)} (${out.text.length} bytes)${out.missing ? `; ${out.missing} without a route` : ''}`);
}
