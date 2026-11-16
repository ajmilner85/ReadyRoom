// The CATCC deck route lines (mission environment) under fengari with a mocked DCS scripting API: the F10
// menu, which routes count as "my spot", and that each line goes out as the right static type, linked to
// the carrier at its route's first point (carrier-frame offsets and the matching world position).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error fengari ships no types
import { lauxlib, lua, lualib, to_luastring } from 'fengari';

const src = fs.readFileSync(path.resolve(__dirname, '../Scripts/CATCC/routelines.lua'), 'utf8');
const routes = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../deck-test/route-lines/routes.json'), 'utf8')).routes;

function run(jetFwd: number, jetStb: number, script: string): string[] {
  const code = `
local out = {}
local function rec(s) out[#out + 1] = s end
local HC = 0.5
local CX, CZ = 1000, 2000
local function shipToWorld(f, s) return CX + f * math.cos(HC) - s * math.sin(HC), CZ + f * math.sin(HC) + s * math.cos(HC) end
local jx, jz = shipToWorld(${jetFwd}, ${jetStb})
local function vec(h) return { x = math.cos(h), y = 0, z = math.sin(h) } end
local CV = {
  getPoint = function() return { x = CX, y = 0, z = CZ } end,
  getPosition = function() return { p = { x = CX, y = 0, z = CZ }, x = vec(HC) } end,
  getID = function() return 77 end, getCountry = function() return 2 end,
  getName = function() return 'CVN' end, isExist = function() return true end,
}
local GROUP = { getID = function() return 5 end }
local JET = {
  getPoint = function() return { x = jx, y = 22, z = jz } end,
  getName = function() return 'Volt 1-1' end, getPlayerName = function() return 'Ace' end,
  getGroup = function() return GROUP end, isExist = function() return true end,
}
local statics = {}
coalition = {
  side = { NEUTRAL = 0, RED = 1, BLUE = 2 },
  getGroups = function(side, cat) if side == 2 and cat == 3 then return { { getUnits = function() return { CV } end } } end return {} end,
  getPlayers = function(side) return side == 2 and { JET } or {} end,
  addStaticObject = function(country, o)
    local s = { o = o, alive = true }
    function s:isExist() return self.alive end
    function s:destroy() self.alive = false; rec('destroy ' .. o.name) end
    function s:getPoint() return { x = o.x, y = 20.15, z = o.y } end
    statics[o.name] = s
    rec(string.format('static %s %s link %d %s off %.2f %.2f %.3f world %.2f %.2f hdg %.3f',
      o.type, o.category, o.linkUnit, tostring(o.linkOffset), o.offsets.x, o.offsets.y, o.offsets.angle, o.x, o.y, o.heading))
    return s
  end,
}
Group = { Category = { SHIP = 3 } }
StaticObject = { getByName = function(n) return statics[n] end }
Unit = { getByName = function(n) if n == 'Volt 1-1' then return JET end end }
local cmds, order = {}, {}
missionCommands = {
  addSubMenuForGroup = function(gid, name) rec('submenu ' .. name) return { name } end,
  addCommandForGroup = function(gid, name, parent, fn) cmds[name] = fn; order[#order + 1] = name end,
}
timer = { getTime = function() return 0 end, scheduleFunction = function() end }
trigger = { action = { outTextForGroup = function(gid, text) rec('say ' .. text) end } }
env = { info = function() end }
assert(load(RL_SRC, 'routelines'))()
rec('menu ' .. table.concat(order, ' | '))
local function shipToWorldRec(f, s) local x, z = shipToWorld(f, s) rec(string.format('expect %.2f %.2f', x, z)) end
${script}
OUT = table.concat(out, '\\n')`;
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  lua.lua_pushstring(L, to_luastring(src));
  lua.lua_setglobal(L, to_luastring('RL_SRC'));
  if (lauxlib.luaL_dostring(L, to_luastring(code)) !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
  lua.lua_getglobal(L, to_luastring('OUT'));
  return lua.lua_tojsstring(L, -1).split('\n');
}

describe('CATCC deck route lines', () => {
  it('has a start for every route in routes.json', () => {
    for (const r of routes) {
      expect(src).toContain(`{ n = ${r.n}, cat = ${r.cat}, x = ${r.stock[0][0]}, z = ${r.stock[0][2]}, ` +
        `mx = ${+r.moved[0][0].toFixed(4)}, mz = ${+r.moved[0][2].toFixed(4)},`);
    }
  });

  it('moved spawn data: every spot moved along its first leg by 8 m (at most 60% of it), the rest untouched', () => {
    for (const r of routes) {
      const [a, b] = r.stock;
      const leg = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const m = r.moved[0];
      const moved = Math.hypot(m[0] - a[0], m[2] - a[2]);
      expect(moved).toBeCloseTo(Math.min(8, 0.6 * leg), 3);
      // still on the first leg: same direction from the stock spot
      const cross = (b[0] - a[0]) * (m[2] - a[2]) - (b[2] - a[2]) * (m[0] - a[0]);
      expect(Math.abs(cross) / leg).toBeLessThan(1e-3);
      expect(r.moved.slice(1)).toEqual(r.stock.slice(1));
    }
  });

  it("the mod declares all 48 static types (DCS's _() for display names stays callable)", () => {
    const db = fs.readFileSync(path.resolve(__dirname,
      '../deck-test/route-lines/Mods/tech/CATCC-RouteLines/Database/db_catcc_route_lines.lua'), 'utf8');
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const code = `_ = function(s) return s end; wsType_Static = 1; wsType_Standing = 2
local names = {}
add_surface_unit = function(u) assert(type(_) == 'function'); names[#names + 1] = u.Name .. '=' .. u.shape_table_data[1].file end
${db}
OUT = table.concat(names, ' ')`;
    if (lauxlib.luaL_dostring(L, to_luastring(code)) !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
    lua.lua_getglobal(L, to_luastring('OUT'));
    const names = lua.lua_tojsstring(L, -1).split(' ');
    expect(names.length).toBe(48);
    expect(names[0]).toBe('CATCC_Route01_Stock=CATCC_Route01_Stock');
    expect(names[47]).toBe('CATCC_Route16_Moved=CATCC_Route16_Moved');
    for (const n of names) {
      expect(fs.existsSync(path.resolve(__dirname, `../deck-test/route-lines/Mods/tech/CATCC-RouteLines/Shapes/${n.split('=')[1]}.edm`))).toBe(true);
    }
  });

  it('shows the F10 menu', () => {
    const out = run(0, 0, '');
    expect(out).toContain('submenu CATCC route lines');
    expect(out.find((l) => l.startsWith('menu '))).toBe(
      'menu My spot: white (stock) + red (test bend) | My spot: white (stock) + blue (moved spawn, X = old spot) | ' +
      'All routes: white (stock) | All routes: red (test bend) | All routes: blue (moved spawn, X = old spot) | Remove lines');
  });

  it('my spot at a moved spawn: white linked at the stock spot, blue at the moved one', () => {
    const r1 = routes[0];
    const [mx, , mz] = r1.moved[0];
    const out = run(mx + 0.3, mz - 0.3, `cmds['My spot: white (stock) + blue (moved spawn, X = old spot)']()`);
    const st = out.filter((l) => l.startsWith('static '));
    expect(st.map((l) => l.split(' ')[1])).toEqual(['CATCC_Route01_Stock', 'CATCC_Route01_Moved']);
    expect(st[0]).toContain('off 24.50 9.50 0.000');
    expect(st[1]).toContain(`off ${mx.toFixed(2)} ${mz.toFixed(2)} 0.000`);
    expect(out.find((l) => l.startsWith('say '))).toMatch(/white = stock, blue = moved spawn, yellow X = stock spawn: 1 spawn spot/);
  });

  it('my spot: both lines of the route starting under the jet, linked at its first point', () => {
    const out = run(24.0, 9.0, `cmds['My spot: white (stock) + red (test bend)']()\nshipToWorldRec(24.5, 9.5)`);
    const st = out.filter((l) => l.startsWith('static '));
    expect(st.map((l) => l.split(' ')[1])).toEqual(['CATCC_Route01_Stock', 'CATCC_Route01_Bent']);
    const exp = out.find((l) => l.startsWith('expect '))!.split(' ').slice(1).join(' ');
    for (const l of st) {
      expect(l).toContain('ADEquipment link 77 true off 24.50 9.50 0.000');
      expect(l).toContain(`world ${exp} hdg 0.500`);
    }
    expect(out.find((l) => l.startsWith('say '))).toMatch(/white = stock, red = test bend: 1 spawn spot\(6pack 1\) -> catapult 1\. 2 line\(s\); height above the ship origin 20\.15/);
  });

  it('my spot away from every spawn spot: says which route is nearest, places nothing', () => {
    const out = run(30, 30, `cmds['My spot: white (stock) + red (test bend)']()`);
    expect(out.some((l) => l.startsWith('static '))).toBe(false);
    expect(out.find((l) => l.startsWith('say '))).toMatch(/no route starts at your spot \(you are at 30\.0 fwd, 30\.0 stbd; nearest is route \d+/);
  });

  it('all routes, then the other colour replaces them, then remove', () => {
    const out = run(0, 0, `cmds['All routes: white (stock)']()\ncmds['All routes: red (test bend)']()\ncmds['Remove lines']()`);
    const st = out.filter((l) => l.startsWith('static '));
    expect(st.length).toBe(32);
    expect(st.slice(0, 16).every((l) => l.includes('_Stock '))).toBe(true);
    expect(st.slice(16).every((l) => l.includes('_Bent '))).toBe(true);
    expect(out.filter((l) => l.startsWith('destroy ')).length).toBe(32);
    expect(out[out.length - 1]).toBe('say CATCC route lines: lines removed');
  });
});
