// Writes routes.json: every spawn-spot -> catapult route of the Supercarrier (GT.TaxiForTORoutes in
// USS_Nimitz_RunwaysAndRoutes.lua) as DCS ships it ("stock") and as the director test's bend leaves it
// ("bent": deck-test/director-reroute.lua, run here on the same data, so the red lines on deck are
// exactly what the installed test computes) and with the spawn spots moved ("moved":
// deck-test/director-spawn.lua). Points in ship coordinates: x forward, z to starboard.
//   node catcc-dcs/deck-test/route-lines/routes.mjs [DCS dir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fengari from 'fengari';

const { lauxlib, lua, lualib, to_luastring } = fengari;
const here = path.dirname(fileURLToPath(import.meta.url));
const dcs = process.argv[2] || 'C:/Program Files/Eagle Dynamics/DCS World';
const file = path.join(dcs, 'CoreMods/tech/USS_Nimitz/scripts/USS_Nimitz_RunwaysAndRoutes.lua');
// the director test's own block taken out: stock data whether or not the test is applied
const src = fs.readFileSync(file, 'utf8').replace(/-- CATCC-DIRTEST BEGIN[\s\S]*?-- CATCC-DIRTEST END/g, '');
const bend = fs.readFileSync(path.join(here, '..', 'director-reroute.lua'), 'utf8');
const shift = fs.readFileSync(path.join(here, '..', 'director-spawn.lua'), 'utf8');

const dump = `
local o = {}
for r, route in ipairs(GT.TaxiForTORoutes) do
  local pts = {}
  for i, p in ipairs(route.Points) do pts[i] = string.format('[%.4f,%.4f,%.4f]', p[1][1], p[1][2], p[1][3]) end
  o[r] = string.format('{"cat":%d,"points":[%s]}', route.RunwayIdx, table.concat(pts, ','))
end
OUT = '[' .. table.concat(o, ',') .. ']'`;

function run(code) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  if (lauxlib.luaL_dostring(L, to_luastring(code)) !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
  lua.lua_getglobal(L, to_luastring('OUT'));
  return JSON.parse(lua.lua_tojsstring(L, -1));
}

const stock = run(`GT = {}\n${src}\n${dump}`);
const bent = run(`GT = {}\n${src}\nlocal CATCC_DIRTEST_TARGET = 'routes'\ndo\n${bend}\nend\n${dump}`);
// director-test.ps1 -Spawn Shift: every spawn spot moved along its first leg
const moved = run(`GT = {}\n${src}\ndo\n${shift}\nend\n${dump}`);
// the comment after each route's opening line names it ("1 spawn spot(6pack 1) -> catapult 1")
const names = [...src.matchAll(/RunwayIdx\s*=\s*\d+\s*,\s*Points\s*=\s*\{\s*--\s*([^\r\n]*)/g)].map((m) => m[1].trim());
const routes = stock.map((r, i) => ({ n: i + 1, cat: r.cat, name: names[i] || '', stock: r.points, bent: bent[i].points, moved: moved[i].points }));
const out = path.join(here, 'routes.json');
fs.writeFileSync(out, JSON.stringify({ source: 'GT.TaxiForTORoutes', routes }, null, 1) + '\n');
console.log(`${routes.length} routes -> ${out}`);

// the F10 script's table of route starts (Scripts/CATCC/routelines.lua, between ROUTES BEGIN / END)
const rl = path.join(here, '..', '..', 'Scripts', 'CATCC', 'routelines.lua');
const lines = routes.map((r) =>
  `  { n = ${r.n}, cat = ${r.cat}, x = ${r.stock[0][0]}, z = ${r.stock[0][2]}, mx = ${+r.moved[0][0].toFixed(4)}, mz = ${+r.moved[0][2].toFixed(4)}, name = '${r.name.replace(/[\\']/g, '')}' },`);
const rlSrc = fs.readFileSync(rl, 'utf8');
const nl = rlSrc.includes('\r\n') ? '\r\n' : '\n';
const re = /(-- ROUTES BEGIN[^\n]*\n)[\s\S]*?(-- ROUTES END)/;
if (!re.test(rlSrc)) throw new Error('ROUTES BEGIN / END not found in ' + rl);
fs.writeFileSync(rl, rlSrc.replace(re, (_, a, b) => `${a}local ROUTES = {${nl}${lines.join(nl)}${nl}}${nl}${b}`));
console.log(`route starts -> ${rl}`);
for (const r of routes) console.log(`  ${String(r.n).padStart(2)}  cat ${r.cat}  ${r.stock.length} pts  ${r.name}`);
