// The director test's reroute block (deck-test/director-reroute.lua) under fengari: it bends every route and
// trajectory 5 m to the left of travel halfway, leaves both ends where they were, and runs on DCS's own
// files (when this PC has DCS installed) without errors.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error fengari ships no types
import { lauxlib, lua, lualib, to_luastring } from 'fengari';

const bendSrc = fs.readFileSync(path.resolve(__dirname, '../deck-test/director-reroute.lua'), 'utf8');
const DCS = 'C:/Program Files/Eagle Dynamics/DCS World/CoreMods/tech/USS_Nimitz/scripts';

/** run Lua, return the string it leaves in global OUT */
function run(code: string): string {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  if (lauxlib.luaL_dostring(L, to_luastring(code)) !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
  lua.lua_getglobal(L, to_luastring('OUT'));
  return lua.lua_tojsstring(L, -1);
}

const block = (target: string) => `\nlocal CATCC_DIRTEST_TARGET = '${target}'\ndo\n${bendSrc}\nend\n`;

// x,z of every point, before and after, as JSON-ish lines "i x0 z0 x1 z1"
const dumpRoutes = `
local function snap()
  local o = {}
  for r, route in ipairs(GT.TaxiForTORoutes) do
    o[r] = {}
    for i, p in ipairs(route.Points) do o[r][i] = { p[1][1], p[1][3] } end
  end
  return o
end`;
const dumpTraj = `
local function snap()
  local o = {}
  for k, tr in pairs(trajectories) do
    o[k] = {}
    for i, e in ipairs(tr) do o[k][i] = { e.pos.p[1], e.pos.p[3] } end
  end
  return o
end`;
const compare = `
local maxMid, maxEnd, n = 0, 0, 0
for k, pts in pairs(A) do
  n = n + 1
  for i, p in ipairs(pts) do
    local q = B[k][i]
    local d = math.sqrt((p[1] - q[1]) ^ 2 + (p[2] - q[2]) ^ 2)
    if i == 1 or i == #pts then maxEnd = math.max(maxEnd, d) else maxMid = math.max(maxMid, d) end
  end
end
OUT = string.format('%d %.3f %.6f', n, maxMid, maxEnd)`;

function stats(out: string) {
  const [n, mid, end] = out.split(' ').map(Number);
  return { n, mid, end };
}

describe('director test reroute block', () => {
  it('bends a straight route 5 m to the left of travel halfway, ends untouched', () => {
    const out = run(`
GT = { TaxiForTORoutes = { { RunwayIdx = 1, Points = {
  {{ 0, 20.1494, 0 }, 1.0, 20.0}, {{ 25, 20.1494, 0 }, 1.0}, {{ 50, 20.1494, 0 }, 1.0}, {{ 75, 20.1494, 0 }, 1.0}, {{ 100, 20.1494, 0 }, 1.0} } } } }
${block('routes')}
local P = GT.TaxiForTORoutes[1].Points
OUT = string.format('%.3f %.3f %.3f %.3f %.3f', P[1][1][3], P[2][1][3], P[3][1][3], P[5][1][3], P[3][1][1])`);
    const [z1, z2, z3, z5, x3] = out.split(' ').map(Number);
    // heading forward (+x), left is port (-z)
    expect(z1).toBe(0);
    expect(z5).toBe(0);
    expect(z3).toBeCloseTo(-5, 3);
    expect(z2).toBeCloseTo(-2.5, 3);
    expect(x3).toBe(50);
  });

  it("does nothing for the other target's table", () => {
    const out = run(`
trajectories = { [1] = { {t=0, pos={p={0,22,0}}}, {t=1, pos={p={50,22,0}}}, {t=2, pos={p={100,22,0}}} } }
${block('routes')}
OUT = tostring(trajectories[1][2].pos.p[3])`);
    expect(Number(out)).toBe(0);
  });

  const have = (f: string) => fs.existsSync(path.join(DCS, f));

  it.skipIf(!have('USS_Nimitz_RunwaysAndRoutes.lua'))('bends DCS\'s 16 spawn-spot routes', () => {
    let src = fs.readFileSync(path.join(DCS, 'USS_Nimitz_RunwaysAndRoutes.lua'), 'utf8');
    src = src.replace(/-- CATCC-DIRTEST BEGIN[\s\S]*?-- CATCC-DIRTEST END/g, ''); // in case the test is applied
    const out = run(`GT = {}\n${src}\n${dumpRoutes}\nA = snap()\n${block('routes')}\nB = snap()\n${compare}`);
    const s = stats(out);
    expect(s.n).toBe(16);
    expect(s.end).toBe(0);
    expect(s.mid).toBeGreaterThan(3);
    expect(s.mid).toBeLessThanOrEqual(5.0001);
  });

  for (const f of ['trajectories_f18.lua', 'trajectories_f14_to.lua']) {
    it.skipIf(!have(f))(`bends DCS's recorded trajectories in ${f}`, () => {
      let src = fs.readFileSync(path.join(DCS, f), 'utf8');
      src = src.replace(/-- CATCC-DIRTEST BEGIN[\s\S]*?-- CATCC-DIRTEST END/g, '');
      const out = run(`${src}\n${dumpTraj}\nA = snap()\n${block('traj')}\nB = snap()\n${compare}`);
      const s = stats(out);
      expect(s.n).toBe(16);
      expect(s.end).toBe(0);
      expect(s.mid).toBeGreaterThan(4.5);
      expect(s.mid).toBeLessThanOrEqual(5.0001);
    });
  }
});
