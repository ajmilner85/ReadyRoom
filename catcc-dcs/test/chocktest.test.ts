// The CATCC chock test (mission environment) under fengari with a mocked DCS scripting API: the F10
// menu places stock statics in front of / behind the Hornet's main wheels, linked to the carrier, at
// the right carrier-frame offsets, and reports movement and life while they're out.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error fengari ships no types
import { lauxlib, lua, lualib, to_luastring } from 'fengari';

const src = fs.readFileSync(path.resolve(__dirname, '../Scripts/CATCC/chocktest.lua'), 'utf8');

const harness = `
local out = {}
local function rec(s) out[#out + 1] = s end
local HC = 0.5                    -- carrier heading (rad, clockwise from north)
local CX, CZ = 1000, 2000
local function shipToWorld(f, s)  -- carrier frame (forward, starboard) -> world x (north), z (east)
  return CX + f * math.cos(HC) - s * math.sin(HC), CZ + f * math.sin(HC) + s * math.cos(HC)
end
local REL = 1.0                   -- the jet's heading relative to the carrier
local jx, jz = shipToWorld(-50, 20)
local jet = { x = jx, z = jz }
local function vec(h) return { x = math.cos(h), y = 0, z = math.sin(h) } end
local CV = {
  getPoint = function() return { x = CX, y = 0, z = CZ } end,
  getPosition = function() return { p = { x = CX, y = 0, z = CZ }, x = vec(HC) } end,
  getID = function() return 77 end, getCountry = function() return 2 end,
  getName = function() return 'CVN' end, isExist = function() return true end,
}
local GROUP = { getID = function() return 5 end }
local JET = {
  getPoint = function() return { x = jet.x, y = 21, z = jet.z } end,
  getPosition = function() return { p = { x = jet.x, y = 21, z = jet.z }, x = vec(HC + REL) } end,
  getName = function() return 'Volt 1-1' end, getPlayerName = function() return 'Ace' end,
  getGroup = function() return GROUP end, isExist = function() return true end, inAir = function() return false end,
  getLife = function() return jet.life or 20 end, getLife0 = function() return 20 end,
}
local BOX = { trunks_small_cargo = { min = { x = -1.5, y = 0, z = -0.3 }, max = { x = 1.5, y = 0.5, z = 0.3 } } }
local statics, spawned = {}, {}
coalition = {
  side = { NEUTRAL = 0, RED = 1, BLUE = 2 },
  getGroups = function(side, cat) if side == 2 and cat == 3 then return { { getUnits = function() return { CV } end } } end return {} end,
  getPlayers = function(side) return side == 2 and { JET } or {} end,
  addStaticObject = function(country, o)
    local s = { o = o, alive = true }
    function s:isExist() return self.alive end
    function s:destroy() self.alive = false end
    function s:getDesc() return { box = BOX[o.type] } end
    function s:getPoint() return { x = o.x, y = 20.15, z = o.y } end
    statics[o.name] = s
    spawned[#spawned + 1] = s
    return s
  end,
}
Group = { Category = { AIRPLANE = 0, HELICOPTER = 1, GROUND = 2, SHIP = 3 } }
StaticObject = { getByName = function(n) return statics[n] end }
Unit = { getByName = function(n) if n == 'Volt 1-1' then return JET elseif n == 'CVN' then return CV end end }
local cmds, timers = {}, {}
missionCommands = {
  addSubMenuForGroup = function(gid, name) return { name } end,
  addCommandForGroup = function(gid, name, parent, fn) cmds[name] = fn end,
}
timer = { getTime = function() return 0 end, scheduleFunction = function(fn, arg, t) timers[#timers + 1] = fn end }
world = { event = { S_EVENT_BIRTH = 15 }, addEventHandler = function() end }
trigger = { action = { outTextForGroup = function(gid, text) rec('say ' .. gid .. ' ' .. text) end } }

assert(load(CT_SRC, 'chocktest'))()
local function dump(tag)
  for _, s in ipairs(spawned) do
    if s.alive then
      local o = s.o
      rec(string.format('%s %s link=%s %s off=%.4f,%.4f,%.4f', tag, o.type, tostring(o.linkUnit), tostring(o.linkOffset), o.offsets.x, o.offsets.y, o.offsets.angle))
    end
  end
end
cmds['Place: logs (small)']()
dump('front')
-- the jet creeps 0.5 m forward along its heading: reported
local f = vec(HC + REL)
jet.x, jet.z = jet.x + 0.5 * f.x, jet.z + 0.5 * f.z
timers[2](nil, 1)
cmds['Toggle: also behind the wheels']()
local n = 0
for _, s in ipairs(spawned) do if s.alive then n = n + 1 end end
rec('alive after toggle ' .. n)
cmds['Remove blockers']()
n = 0
for _, s in ipairs(spawned) do if s.alive then n = n + 1 end end
rec('alive after remove ' .. n)
return table.concat(out, '\\n')
`;

function run(): string[] {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  lua.lua_pushstring(L, to_luastring(src));
  lua.lua_setglobal(L, to_luastring('CT_SRC'));
  const status = lauxlib.luaL_dostring(L, to_luastring(harness));
  const out = lua.lua_tojsstring(L, -1) as string;
  if (status !== 0) throw new Error(out);
  return out.split('\n');
}

describe('CATCC chock test (mission environment)', () => {
  const out = run();
  it('places a blocker ahead of each main wheel, lying across, linked to the carrier at the right offsets', () => {
    const front = out.filter((l) => l.startsWith('front '));
    expect(front).toHaveLength(2);
    // expected: jet at carrier frame (-50, 20), heading +1.0 rad from the bow; logs 3 m long x 0.6 m deep
    // lie across, near face 0.30 m ahead of the tyre: origin 2.4378 - 0.34 - 0.30 - 0.3 = 1.4978 m aft of
    // the jet's origin, 1.55 m either side
    const rel = 1.0;
    const along = -2.4378 + 0.34 + 0.3 + 0.3;
    for (const [i, side] of [-1, 1].entries()) {
      const across = side * 1.55;
      const fx = -50 + along * Math.cos(rel) - across * Math.sin(rel);
      const fy = 20 + along * Math.sin(rel) + across * Math.cos(rel);
      const m = front[i].match(/link=77 true off=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)/);
      expect(m).not.toBeNull();
      expect(Number(m![1])).toBeCloseTo(fx, 3);
      expect(Number(m![2])).toBeCloseTo(fy, 3);
      expect(Number(m![3])).toBeCloseTo(rel + Math.PI / 2, 3);
    }
  });
  it('tells the pilot what went out: size, orientation, height above the ship, life', () => {
    const placed = out.find((l) => l.includes('x2 placed'));
    expect(placed).toBe('say 5 CATCC test: logs (small) x2 placed, gap 0.30 m, size 3.00 long x 0.60 wide x 0.50 high, lying across; height above ship origin 20.15 m (deck is about 20.15). Life 20.0/20.0');
  });
  it('reports how far the jet moved while the blockers are out', () => {
    expect(out.find((l) => l.includes('moved 0.50 m'))).toBe('say 5 CATCC test: moved 0.50 m (0.27 fwd, 0.42 stbd) since placed; life 20.0/20.0; blockers standing 2/2');
  });
  it('adds blockers behind the wheels on request, and removes them all', () => {
    expect(out).toContain('alive after toggle 4');
    expect(out).toContain('alive after remove 0');
  });
});
