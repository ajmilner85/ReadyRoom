// The spotting plan's 40 deck spots as DCS's spawn table (deck-test/director-spots.lua, made by
// deck-test/spots.gen.ts) and the hand-off lists that go with it (deck-test/director-spots-crew.lua):
// the generated block is current, gives DCS 40 routes that start on the plan's spots pointing the plan's
// way and stay on the deck, and director-test.ps1 -Spawn Spots puts it into DCS's files and takes it out
// again byte for byte (on copies of this PC's DCS files, when DCS is installed).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error fengari ships no types
import { lauxlib, lua, lualib, to_luastring } from 'fengari';
import { NIMITZ, inPoly } from '../../src/components/catcc/prifly/deck.ts';
import { DECK_SPOTS } from '../../src/components/catcc/prifly/deckSpots.gen.ts';
import { PARK_ORDER, SPAWN_OFFSET, SPOTS_LUA, START_SPOTS, buildParkRoutes, buildSpawnRoutes, buildSpotsLua, spotCat } from '../deck-test/spots.gen.ts';
import { SPOTS_DCS_CSV, dcsSpots } from '../../scripts/catcc/deck-spots.gen.ts';

const here = (p: string) => path.resolve(__dirname, p);
const DCS = 'C:/Program Files/Eagle Dynamics/DCS World/CoreMods/tech/USS_Nimitz/scripts';
const FILES = ['takeoff_logic.xml', 'USS_Nimitz_RunwaysAndRoutes.lua', 'trajectories_f18.lua', 'trajectories_f14_to.lua', 'GroundCrew.lua', 'common.xml'];
const haveDcs = FILES.every((f) => fs.existsSync(path.join(DCS, f)));
const blockSrc = fs.readFileSync(SPOTS_LUA, 'utf8').replace(/\r\n/g, '\n');
const padSrc = fs.readFileSync(here('../deck-test/director-spots-crew.lua'), 'utf8');
const csv = fs
  .readFileSync(here('../../carrier-ops-handoff-2/deck-spots.csv'), 'utf8')
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((l) => l.split(','))
  .map((c) => ({ n: Number(c[0]), name: c[1], x: Number(c[2]), z: Number(c[4]), hdg: Number(c[5]) }))
  // the plan's spots are the drawing's, each replaced by the one the user set in DCS (deck-spots-dcs.csv) where there is one
  .map((s) => {
    const o = (fs.existsSync(SPOTS_DCS_CSV) ? dcsSpots(fs.readFileSync(SPOTS_DCS_CSV, 'utf8')) : new Map()).get(s.n);
    return o ? { n: s.n, name: o.name, x: Math.round(o.x * 100) / 100, z: Math.round(o.z * 100) / 100, hdg: o.hdg } : s;
  });

function run(code: string): string {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  if (lauxlib.luaL_dostring(L, to_luastring(code)) !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
  lua.lua_getglobal(L, to_luastring('OUT'));
  return lua.lua_tojsstring(L, -1);
}

/** GT.TaxiForTORoutes after `src` has run: [{ cat, pts: [x, y, z, speed, size][] }] */
const DUMP = `
local o = {}
for r, route in ipairs(GT.TaxiForTORoutes) do
  local p = {}
  for i, q in ipairs(route.Points) do p[i] = string.format('%.4f,%.4f,%.4f,%s,%s', q[1][1], q[1][2], q[1][3], tostring(q[2]), tostring(q[3] or 0)) end
  o[r] = route.RunwayIdx .. ':' .. table.concat(p, ';')
end
OUT = tostring(GT.TaxiForTORoutes.RoutesForTONumber) .. '|' .. table.concat(o, '|')`;
const routesOf = (src: string) => {
  const [count, ...rs] = run(`${src}\n${DUMP}`).split('|');
  return { count: Number(count), routes: rs.map((r) => ({ cat: Number(r.split(':')[0]), pts: r.split(':')[1].split(';').map((p) => p.split(',').map(Number)) })) };
};

describe("the spotting plan's deck spots as DCS's spawn table", () => {
  it('the generated block is what the plan and PriFly\'s taxi network give now (else: node catcc-dcs/deck-test/spots.gen.ts)', () => {
    expect(blockSrc).toBe(buildSpotsLua());
  });

  it('gives DCS 40 routes: each starts on its spot, points the jet as the plan parks it, and runs on the deck to its catapult', () => {
    const t = routesOf(`GT = {}\ndo\n${blockSrc}\nend`);
    expect(t.count).toBe(44);
    // (the plan's 40, after the four given only at mission start)
    const routes = t.routes.slice(4);
    expect(routes.length).toBe(40);
    expect(csv.length).toBe(40);
    // THE FOUR ROUTES DCS GIVES ONLY AT MISSION START ARE COPIES OF SIX-PACK SPOTS' (the user, 2026-11-23: "spawns 1-4
    // are moved so they align with our own six-pack locations. So they are essentially duplicates"): whatever the file
    // had, the table holds those four, then the plan's 40: deck spot n is DCS's spawn route n + 4
    const stockRoutes = [1, 2, 3, 4, 5, 6].map((k) => `{ RunwayIdx = ${((k - 1) % 4) + 1}, Points = { { { ${k}00, 0, 0 }, 1.0 } } }`).join(', ');
    const all = routesOf(`GT = { TaxiForTORoutes = { ${stockRoutes} } }\ndo\n${blockSrc}\nend`);
    expect(SPAWN_OFFSET).toBe(4);
    expect(all.count).toBe(44);
    expect(START_SPOTS).toEqual(['SP1', 'SP2', 'SP3', 'SP4']);
    const at = START_SPOTS.map((id) => csv.findIndex((s) => s.n === DECK_SPOTS.find((d) => d.id === id)?.n));
    expect(all.routes.slice(0, 4)).toEqual(at.map((i) => routes[i]));
    expect(all.routes.slice(4)).toEqual(routes);
    const shuttle: Record<number, number[]> = { 1: NIMITZ.cats['1'][0], 2: NIMITZ.cats['2'][0], 3: NIMITZ.cats['3'][0], 4: NIMITZ.cats['4'][0] };
    routes.forEach((r, i) => {
      const s = csv[i];
      const name = `${s.n} ${s.name}`;
      const [p0, p1] = r.pts;
      // the spawn point: the plan's spot (an edge spot: moved so its main wheels are 4 ft from the edge), at deck
      // height, with the terminal size every stock spot has
      expect(Math.hypot(p0[0] - DECK_SPOTS[i].p[0], p0[2] + DECK_SPOTS[i].p[1]), name).toBeLessThan(0.011);
      expect(Math.hypot(p0[0] - s.x, p0[2] - s.z), name).toBeLessThan(2.6);
      expect(p0[1], name).toBe(20.1494);
      expect(p0[4], name).toBe(20);
      // the heading DCS takes: toward the second point (degrees clockwise from the bow, as the plan gives it)
      const hdg = ((Math.atan2(p1[2] - p0[2], p1[0] - p0[0]) * 180) / Math.PI + 360) % 360;
      expect(Math.abs(((hdg - s.hdg + 540) % 360) - 180), name).toBeLessThan(0.2);
      expect(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]), name).toBeGreaterThan(2);
      // its catapult: the deck area's (the fantail's: each spot's own), and the route ends 5 m short of that shuttle
      expect(r.cat, name).toBe(spotCat(DECK_SPOTS[i]));
      const end = r.pts[r.pts.length - 1];
      expect(Math.hypot(end[0] - shuttle[r.cat][0], end[2] + shuttle[r.cat][1]), name).toBeCloseTo(5, 1);
      // every corner on the deck (PriFly's outline: y to port) and clear of the island; speeds 1 or 2 m/s
      for (const p of r.pts) {
        expect(inPoly(p[0], -p[2], NIMITZ.outline), `${name} at ${p}`).toBe(true);
        expect(inPoly(p[0], -p[2], NIMITZ.struct['Island']), `${name} at ${p}`).toBe(false);
        expect([1, 2]).toContain(p[3]);
      }
    });
    // AI aircraft are spread over all four catapults
    const per = [1, 2, 3, 4].map((k) => routes.filter((r) => r.cat === k).length);
    // (the deck as respotted in DCS: six on the starboard bow, three on the patio)
    expect(per).toEqual([16, 10, 7, 7]);
    expect(buildSpawnRoutes().map((r) => r.n)).toEqual(csv.map((s) => s.n));
  });

  it("numbers the spots of each area by nearness to their catapult (the user, 2026-11-23): 1 has the shortest route to it; the short ids follow the names", () => {
    const routes = buildSpawnRoutes();
    const areas = [...new Set(DECK_SPOTS.map((s) => s.area))];
    expect(areas).toEqual(['Stbd bow', 'Patio', 'Port bow', 'Crotch', 'Point', 'El 1', 'Sixpack', 'Corral', 'El 2', 'El 3', 'Fantail', 'Port quarter', 'El 4']);
    for (const area of areas) {
      const list = DECK_SPOTS.filter((s) => s.area === area).map((s) => ({ k: Number(s.label.split(' ').pop()), len: routes.find((r) => r.n === s.n)!.len }));
      const byNumber = [...list].sort((p, q) => p.k - q.k);
      expect(byNumber.map((q) => q.k), area).toEqual(list.map((_, i) => i + 1));
      for (let i = 1; i < byNumber.length; i++) expect(byNumber[i].len, `${area} ${byNumber[i].k}`).toBeGreaterThan(byNumber[i - 1].len);
    }
    const prefix: Record<string, string> = { 'Stbd bow': 'SB', 'Port bow': 'PB', Crotch: 'CR', Point: 'PT', Sixpack: 'SP', Corral: 'CO', Patio: 'PA', 'Port quarter': 'PQ', Fantail: 'FT' };
    for (const s of DECK_SPOTS) expect(s.id, s.label).toBe(s.area.startsWith('El ') ? `E${s.area.slice(3)}${s.label.split(' ').pop()}` : `${prefix[s.area]}${s.label.split(' ').pop()}`);
    // the fantail: its port pair to catapult 4, its starboard pair to catapult 3, as before it was an area
    expect(['FT1', 'FT2', 'FT3', 'FT4'].map((id) => spotCat(DECK_SPOTS.find((s) => s.id === id)!))).toEqual([4, 4, 3, 3]);
  });

  it('gives DCS 31 parking routes: each from where the roll-out ends to a spot of the plan, in DCS\'s own order of places', () => {
    const out = run(`GT = { TaxiRoutes = { 'stock' }, BlockerTerminals = { 6, 7, 8, 9 } }\ndo\n${blockSrc}\nend
local o = {}
for r, route in ipairs(GT.TaxiRoutes) do
  local p = {}
  for i, q in ipairs(route) do p[i] = string.format('%.4f,%.4f,%.4f,%s,%s', q[1][1], q[1][2], q[1][3], tostring(q[2]), tostring(q[3] or 0)) end
  o[r] = table.concat(p, ';')
end
OUT = tostring(GT.TaxiRoutes.RoutesNumber) .. '|' .. table.concat(GT.BlockerTerminals, ',') .. '|' .. table.concat(o, '|')`).split('|');
    expect(out[0]).toBe('31');
    expect(out[1]).toBe('6,7,8,9'); // DCS's blocker places are left as they are: the six-pack stands on them
    const routes = out.slice(2).map((r) => r.split(';').map((p) => p.split(',').map(Number)));
    expect(routes.length).toBe(31);
    const park = buildParkRoutes();
    expect(park.map((r) => r.id)).toEqual(PARK_ORDER);
    expect(new Set(PARK_ORDER).size).toBe(31);
    // none on the port side or the stern: those spots are in or beside the landing area
    expect(PARK_ORDER.some((id) => /^(PO|E4|ST)/.test(id))).toBe(false);
    // DCS's own order, place for place: patio, EL 3, the blockers abeam the island, EL 2, corral, point, EL 1
    expect(PARK_ORDER.slice(0, 16)).toEqual(['PA3', 'PA2', 'CO2', 'E32', 'E31', 'SP6', 'SP5', 'SP4', 'SP3', 'E22', 'E21', 'CO1', 'PT3', 'PT2', 'E12', 'E11']);
    routes.forEach((pts, i) => {
      const id = PARK_ORDER[i];
      const s = csv[DECK_SPOTS.find((q) => q.id === id)!.n - 1];
      const name = `${i + 1} ${id}`;
      // from where every stock parking route starts, to the spot
      expect(pts[0].slice(0, 4), name).toEqual([13, 20.1494, -19, 5]);
      const end = pts[pts.length - 1];
      const d = DECK_SPOTS.find((q) => q.id === id)!;
      expect(Math.hypot(end[0] - d.p[0], end[2] + d.p[1]), name).toBeLessThan(0.011);
      expect(Math.hypot(end[0] - s.x, end[2] - s.z), name).toBeLessThan(2.6);
      expect(end[3], name).toBe(1);
      // an elevator spot keeps DCS's 180 s wait
      expect(end[4], name).toBe(id.startsWith('E') ? 180 : 0);
      for (const p of pts) {
        expect(inPoly(p[0], -p[2], NIMITZ.outline), `${name} at ${p}`).toBe(true);
        expect(inPoly(p[0], -p[2], NIMITZ.struct['Island']), `${name} at ${p}`).toBe(false);
      }
      // off the landing area to starboard, and no corner an aircraft could not turn
      expect(pts[1][2], name).toBeCloseTo(-11, 5);
      expect(pts[2][2], name).toBeGreaterThan(pts[1][2]);
      for (let k = 1; k < pts.length - 1; k++) {
        const a = Math.atan2(pts[k][2] - pts[k - 1][2], pts[k][0] - pts[k - 1][0]);
        const b = Math.atan2(pts[k + 1][2] - pts[k][2], pts[k + 1][0] - pts[k][0]);
        expect(Math.abs((((b - a) * 180) / Math.PI + 540) % 360 - 180), `${name} corner ${k}`).toBeLessThanOrEqual(125);
      }
    });
  });

  it('the hand-off lists: one for each of the 40 routes, the new ones taken from the stock 16 in rotation', () => {
    expect(padSrc).toContain(`local SPOTS = ${DECK_SPOTS.length + SPAWN_OFFSET}\n`.replace('\n', ''));
    const out = run(`takeoff_crew = { takeoff_tasks = {} }
for i = 1, 16 do takeoff_crew.takeoff_tasks[i] = { brown_id = i } end
do
${padSrc}
end
local t = takeoff_crew.takeoff_tasks
OUT = #t .. ' ' .. t[17].brown_id .. ' ' .. t[32].brown_id .. ' ' .. t[33].brown_id .. ' ' .. t[40].brown_id .. ' ' .. tostring(t[16].brown_id)`);
    expect(out).toBe('44 1 16 1 8 16');
    // no take-off crew table, or an empty one: nothing happens
    expect(run(`takeoff_crew = nil\ndo\n${padSrc}\nend\nOUT = 'ok'`)).toBe('ok');
    expect(run(`takeoff_crew = { takeoff_tasks = {} }\ndo\n${padSrc}\nend\nOUT = tostring(#takeoff_crew.takeoff_tasks)`)).toBe('0');
  });

  it.skipIf(!haveDcs)('director-test.ps1 -Spawn Spots puts both blocks into copies of DCS\'s files; -Revert leaves them byte for byte as they were', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catcc-spots-'));
    try {
      const dir = path.join(tmp, 'CoreMods/tech/USS_Nimitz/scripts');
      fs.mkdirSync(dir, { recursive: true });
      // the stock files: this PC's, without anything a test left in them (their backups, where there are any)
      for (const f of FILES) {
        const bak = path.join(DCS, `${f}.catcc-dirtest-backup`);
        fs.copyFileSync(fs.existsSync(bak) ? bak : path.join(DCS, f), path.join(dir, f));
      }
      const stock = Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(dir, f))]));
      const ps = (...args: string[]) =>
        execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', here('../deck-test/director-test.ps1'), '-NoElevate', '-DcsDir', tmp, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const out = ps('-Spawn', 'Spots');
      expect(out).toContain('changed: USS_Nimitz_RunwaysAndRoutes.lua, GroundCrew.lua');
      // DCS's own file with the block at its end: 40 routes, the first on the plan's first spot
      const patched = fs.readFileSync(path.join(dir, 'USS_Nimitz_RunwaysAndRoutes.lua'), 'latin1');
      const { count, routes } = routesOf(`GT = {}\n${patched}`);
      expect(count).toBe(44);
      // (the first route a copy of the first six-pack spot's; the plan's first spot is the fifth)
      const sp1 = csv.find((s) => s.n === DECK_SPOTS.find((d) => d.id === START_SPOTS[0])?.n);
      expect(routes[0].pts[0].slice(0, 3)).toEqual([sp1?.x, 20.1494, sp1?.z]);
      expect(routes[4].pts[0].slice(0, 3)).toEqual([csv[0].x, 20.1494, csv[0].z]);
      expect(routesOf(`GT = {}\n${stock['USS_Nimitz_RunwaysAndRoutes.lua'].toString('latin1')}`).count).toBe(16);
      const crew = fs.readFileSync(path.join(dir, 'GroundCrew.lua'), 'latin1');
      expect(crew).toContain('for n = stock + 1, SPOTS do tt[n] = tt[((n - 1) % stock) + 1] end');
      expect(fs.readFileSync(path.join(dir, 'takeoff_logic.xml')).equals(stock['takeoff_logic.xml'])).toBe(true);
      // with the crew test's people as well: both blocks in GroundCrew.lua; a second run changes nothing
      ps('-Spawn', 'Spots', '-Crew', 'Extra');
      const both = fs.readFileSync(path.join(dir, 'GroundCrew.lua'), 'latin1');
      expect(both.match(/-- CATCC-DIRTEST BEGIN/g)?.length).toBe(2);
      expect(both).toContain("local CATCC_CREW = 'extra'");
      expect(ps('-Spawn', 'Spots', '-Crew', 'Extra')).toContain('nothing needed changing');
      // the catapult crew gate: one line in common.xml, straight after the first line of "Occupy catapult" and
      // before the take order is asked for; the rest of the tree, the pilot mod's own lines included, untouched
      expect(fs.readFileSync(path.join(dir, 'common.xml')).equals(stock['common.xml'])).toBe(true);
      expect(ps('-Spawn', 'Spots', '-Crew', 'Extra', '-CatGate')).toContain('changed: common.xml');
      const tree = fs.readFileSync(path.join(dir, 'common.xml'), 'latin1').split(/\r?\n/);
      const gate = tree.findIndex((l) => l.includes('CATCC-DIRTEST occupy gate'));
      expect(gate).toBeGreaterThan(0);
      expect(tree[gate].trim()).toBe('<Condition ID="CheckGCOrder" attribute_name="GC_ORDER_OPERATION_ALLOWED" attribute_value="true" catapult="self" name="CATCC-DIRTEST occupy gate: a cleared crew returns only while operation is allowed"/>');
      expect(tree[gate - 1]).toContain('name="GC_REQUEST_CREW_SAFE == true?"');
      expect(tree[gate - 2]).toContain('<SequenceStar name="Occupy catapult">');
      expect(tree[gate + 1]).toContain('attribute_name="GC_ORDER_TAKE_CATAPULT"');
      expect(tree[gate].match(/^\s*/)?.[0]).toBe(tree[gate - 1].match(/^\s*/)?.[0]);
      expect(tree.filter((l) => l.includes('CATCC-DIRTEST')).length).toBe(1);
      expect(tree.length).toBe(stock['common.xml'].toString('latin1').split(/\r?\n/).length + 1);
      expect(ps('-Spawn', 'Spots', '-Crew', 'Extra', '-CatGate')).toContain('nothing needed changing');
      // the routes table cannot be bent and replaced at once
      expect(() => ps('-Spawn', 'Spots', '-Reroute', 'Routes')).toThrow();
      ps('-Revert');
      for (const f of FILES) expect(fs.readFileSync(path.join(dir, f)).equals(stock[f]), f).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 120000);
});
