// The CATCC chock test (mission environment) under fengari with a mocked DCS scripting API: the F10
// menu places statics at the Hornet's wheels or gear legs, linked to the carrier, at the right
// carrier-frame offsets, reports movement and life while they're out, and watches the Hornet's own chocks.
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
local jet = { x = jx, z = jz, arg23 = 0 }
local function vec(h) return { x = math.cos(h), y = 0, z = math.sin(h) } end
local CV = {
  getPoint = function() return { x = CX, y = 0, z = CZ } end,
  getPosition = function() return { p = { x = CX, y = 0, z = CZ }, x = vec(HC) } end,
  getID = function() return 77 end, getCountry = function() return 2 end,
  getName = function() return 'CVN' end, isExist = function() return true end,
}
local GROUP = { getID = function() return 5 end }
local JET = {
  getPoint = function() return { x = jet.x, y = 22, z = jet.z } end,
  getPosition = function() return { p = { x = jet.x, y = 22, z = jet.z }, x = vec(HC + REL) } end,
  getName = function() return 'Volt 1-1' end, getPlayerName = function() return 'Ace' end,
  getGroup = function() return GROUP end, isExist = function() return true end, inAir = function() return false end,
  getLife = function() return jet.life or 20 end, getLife0 = function() return 20 end,
  getDrawArgumentValue = function(self, n) return n == 23 and jet.arg23 or 0 end,
}
local BOX = {
  trunks_small_cargo = { min = { x = -1.5, y = 0, z = -0.3 }, max = { x = 1.5, y = 0.5, z = 0.3 } },
  CATCC_Chock = { min = { x = -0.18, y = 0, z = -0.15 }, max = { x = 0.18, y = 0.18, z = 0.15 } },
  CATCC_Wall = { min = { x = -0.05, y = 0, z = -0.25 }, max = { x = 0.05, y = 0.8, z = 0.25 } },
  CATCC_Wall_Cargo = { min = { x = -0.05, y = 0, z = -0.25 }, max = { x = 0.05, y = 0.8, z = 0.25 } },
}
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
local cmds, order, timers = {}, {}, {}
missionCommands = {
  addSubMenuForGroup = function(gid, name) return { name } end,
  addCommandForGroup = function(gid, name, parent, fn) cmds[name] = fn; order[#order + 1] = name end,
}
timer = { getTime = function() return 0 end, scheduleFunction = function(fn, arg, t) timers[#timers + 1] = fn end }
world = { event = { S_EVENT_BIRTH = 15 }, addEventHandler = function() end }
trigger = { action = { outTextForGroup = function(gid, text) rec('say ' .. gid .. ' ' .. text) end } }
local logged = {}
env = { info = function(s) logged[#logged + 1] = s end }

assert(load(CT_SRC, 'chocktest'))()
rec('menu ' .. table.concat(order, ' | '))
local function tick() timers[2](nil, 1) end
local function dump(tag)
  for _, s in ipairs(spawned) do
    if s.alive then
      local o = s.o
      rec(string.format('%s %s %s link=%s %s off=%.4f,%.4f,%.4f', tag, o.type, o.category, tostring(o.linkUnit), tostring(o.linkOffset), o.offsets.x, o.offsets.y, o.offsets.angle))
    end
  end
end
local function alive()
  local n = 0
  for _, s in ipairs(spawned) do if s.alive then n = n + 1 end end
  return n
end
cmds['Place: logs (small)']()
dump('front')
-- the jet creeps 0.5 m forward along its heading: reported
local f = vec(HC + REL)
jet.x, jet.z = jet.x + 0.5 * f.x, jet.z + 0.5 * f.z
tick()
cmds['Toggle: also behind the wheels']()
rec('alive after toggle ' .. alive())
cmds['Remove blockers']()
rec('alive after remove ' .. alive())
-- our chock: aligned with the wheel's travel, a pair per wheel
jet.x, jet.z = jx, jz
cmds['Place: CATCC chock']()
dump('chock')
cmds['Place: wall at tyres']()
dump('tyres')
cmds['Place: wall at gear legs']()
dump('legs')
cmds['Closer (gap -5 cm)']()
rec('alive after closer at the legs ' .. alive())
cmds['Place: cargo wall at gear legs']()
dump('cargolegs')
cmds['Remove blockers']()
-- the Hornet's own chocks go on, the jet creeps 0.2 m, they come off
jet.arg23 = 1
tick()
jet.x, jet.z = jet.x + 0.2 * f.x, jet.z + 0.2 * f.z
tick()
jet.arg23 = 0
tick()
rec('logged ' .. #logged .. ' ' .. tostring(logged[1]))
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

const REL = 1.0;
// aircraft frame (along, across) -> the linked static's carrier-frame offsets, for the jet at (-50, 20)
const offs = (along: number, across: number) => [
  -50 + along * Math.cos(REL) - across * Math.sin(REL),
  20 + along * Math.sin(REL) + across * Math.cos(REL),
];
const parse = (l: string) => l.match(/off=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)/)!.slice(1).map(Number);

describe('CATCC chock test (mission environment)', () => {
  const out = run();
  it('fits the F10 menu (10 items at most)', () => {
    const menu = out.find((l) => l.startsWith('menu '))!.slice(5).split(' | ');
    expect(menu.length).toBeLessThanOrEqual(10);
    expect(menu).toContain('Place: wall at tyres');
    expect(menu).toContain('Place: cargo wall at gear legs');
  });
  it('places a stock blocker ahead of each main wheel, lying across, linked to the carrier at the right offsets', () => {
    const front = out.filter((l) => l.startsWith('front '));
    expect(front).toHaveLength(2);
    // logs 3 m long x 0.6 m deep lie across, near face 0.30 m ahead of the tyre: origin
    // 2.4378 - 0.34 - 0.30 - 0.3 = 1.4978 m aft of the jet's origin, 1.55 m either side
    const along = -2.4378 + 0.34 + 0.3 + 0.3;
    for (const [i, side] of [-1, 1].entries()) {
      const [fx, fy] = offs(along, side * 1.55);
      expect(front[i]).toContain('link=77 true');
      const got = parse(front[i]);
      expect(got[0]).toBeCloseTo(fx, 3);
      expect(got[1]).toBeCloseTo(fy, 3);
      expect(got[2]).toBeCloseTo(REL + Math.PI / 2, 3);
    }
  });
  it('tells the pilot what went out: size, orientation, height above the ship, the jet above the deck, life', () => {
    const placed = out.find((l) => l.includes('x2 placed'));
    expect(placed).toBe('say 5 CATCC test: logs (small) x2 placed, gap 0.30 m, size 3.00 long x 0.60 wide x 0.50 high, lying across; height above ship origin 20.15 m (deck is about 20.15), jet origin 1.85 m above it. Life 20.0/20.0');
  });
  it('reports how far the jet moved while the blockers are out, on screen and in dcs.log', () => {
    expect(out.find((l) => l.includes('moved 0.50 m'))).toBe('say 5 CATCC test: moved 0.50 m (0.27 fwd, 0.42 stbd) since placed; life 20.0/20.0; blockers standing 2/2');
    expect(out.find((l) => l.startsWith('logged '))).toMatch(/^logged \d+ CATCC chock test: logs \(small\) x2 placed/);
  });
  it('places our chock as a pair per wheel (mains and nose), each nudged for its own wheel', () => {
    const chocks = out.filter((l) => l.startsWith('chock CATCC_Chock ADEquipment'));
    expect(chocks).toHaveLength(6);
    // gap 3 cm, then the deck checks: mains front 5 cm / rear 15 cm toward the tyre, nose 7 / 10 cm
    const want: number[][] = [];
    for (const [along, r, across, fwdAdj, aftAdj] of [
      [-2.4378, 0.34, -1.55, 0.05, 0.15],
      [-2.4378, 0.34, 1.55, 0.05, 0.15],
      [2.9851, 0.5385 / 2, 0, 0.07, 0.1],
    ]) {
      want.push(offs(along + r + 0.03 - fwdAdj + 0.18, across));
      want.push(offs(along - r - 0.03 + aftAdj - 0.18, across));
    }
    const got = chocks.map(parse);
    for (const [i, [x, y]] of want.entries()) {
      expect(got[i][0]).toBeCloseTo(x, 3);
      expect(got[i][1]).toBeCloseTo(y, 3);
      expect(got[i][2]).toBeCloseTo(REL, 3);
    }
    expect(out.find((l) => l.includes('CATCC chock x6 placed'))).toContain('gap 0.03 m, size 0.36 long x 0.30 wide x 0.18 high, end on');
  });
  it('places the wall just clear of the main tyres, ahead and behind', () => {
    const walls = out.filter((l) => l.startsWith('tyres CATCC_Wall ADEquipment'));
    expect(walls).toHaveLength(4);
    const want: number[][] = [];
    for (const side of [-1, 1]) {
      want.push(offs(-2.388 + 0.38 + 0.03 + 0.05, side * 1.55)); // near face 3 cm ahead of the tyre
      want.push(offs(-2.388 - 0.38 - 0.03 - 0.05, side * 1.55));
    }
    const got = walls.map(parse);
    for (const [i, [x, y]] of want.entries()) {
      expect(got[i][0]).toBeCloseTo(x, 3);
      expect(got[i][1]).toBeCloseTo(y, 3);
    }
  });
  it('places the wall either side of each gear leg (faces at -1.57 and -1.76), and goes no closer', () => {
    const walls = out.filter((l) => l.startsWith('legs CATCC_Wall ADEquipment'));
    expect(walls).toHaveLength(4);
    const want: number[][] = [];
    for (const side of [-1, 1]) {
      want.push(offs(-1.57 + 0.05, side * 0.975));
      want.push(offs(-1.76 - 0.05, side * 0.975));
    }
    const got = walls.map(parse);
    for (const [i, [x, y]] of want.entries()) {
      expect(got[i][0]).toBeCloseTo(x, 3);
      expect(got[i][1]).toBeCloseTo(y, 3);
    }
    expect(out).toContain('say 5 CATCC test: gap 0.00 m is as close as this one goes');
    expect(out).toContain('alive after closer at the legs 4');
    expect(out.filter((l) => l.startsWith('cargolegs CATCC_Wall_Cargo Cargos'))).toHaveLength(4);
  });
  it("watches the Hornet's own chocks: on, movement while on, off", () => {
    expect(out).toContain("say 5 CATCC test: the Hornet's own wheel chocks are ON. Add power: any movement is reported here");
    expect(out).toContain("say 5 CATCC test: moved 0.20 m with the Hornet's own chocks on; life 20.0/20.0");
    expect(out).toContain("say 5 CATCC test: the Hornet's own wheel chocks are OFF (moved 0.20 m at most while they were on)");
  });
  it('adds blockers behind the wheels on request, and removes them all', () => {
    expect(out).toContain('alive after toggle 4');
    expect(out).toContain('alive after remove 0');
  });
});
