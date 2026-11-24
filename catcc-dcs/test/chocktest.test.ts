// The CATCC chock test (mission environment) under fengari with a mocked DCS scripting API: the F10
// menu's PriFly hold switch (read by the pilot mod), the watch on the Hornet's own chocks, and the
// parked collision blockers (statics at the Hornet's wheels, linked to the carrier, at the right
// carrier-frame offsets; movement, height, gear and life reported while they're out).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error fengari ships no types
import { lauxlib, lua, lualib, to_luastring } from 'fengari';

const src = fs.readFileSync(path.resolve(__dirname, '../Scripts/CATCC/chocktest.lua'), 'utf8');

const mocks = `
local out = {}
local function rec(s) out[#out + 1] = s end
local HC = 0.5                    -- carrier heading (rad, clockwise from north)
local CX, CZ = 1000, 2000
local function shipToWorld(f, s)  -- carrier frame (forward, starboard) -> world x (north), z (east)
  return CX + f * math.cos(HC) - s * math.sin(HC), CZ + f * math.sin(HC) + s * math.cos(HC)
end
local REL = 1.0                   -- the jet's heading relative to the carrier
local jx, jz = shipToWorld(-50, 20)
local jet = { x = jx, z = jz, y = 22, arg23 = 0, gearL = 1 }
local function vec(h) return { x = math.cos(h), y = 0, z = math.sin(h) } end
local CV = {
  getPoint = function() return { x = CX, y = 0, z = CZ } end,
  getPosition = function() return { p = { x = CX, y = 0, z = CZ }, x = vec(HC) } end,
  getID = function() return 77 end, getCountry = function() return 2 end,
  getName = function() return 'CVN' end, isExist = function() return true end,
}
local GROUP = { getID = function() return 5 end }
local JET = {
  getPoint = function() return { x = jet.x, y = jet.y, z = jet.z } end,
  getPosition = function() return { p = { x = jet.x, y = jet.y, z = jet.z }, x = vec(HC + REL) } end,
  getName = function() return 'Volt 1-1' end, getPlayerName = function() return 'Ace' end,
  getGroup = function() return GROUP end, isExist = function() return true end, inAir = function() return false end,
  getLife = function() return jet.life or 20 end, getLife0 = function() return 20 end,
  getDrawArgumentValue = function(self, n)
    if n == 23 then return jet.arg23 end
    if n == 5 then return jet.gearL end
    if n == 0 or n == 3 then return 1 end
    return 0
  end,
}
local BOX = {
  CATCC_Chock = { min = { x = -0.18, y = 0, z = -0.15 }, max = { x = 0.18, y = 0.18, z = 0.15 } },
  CATCC_Chock_Cargo = { min = { x = -0.18, y = 0, z = -0.15 }, max = { x = 0.18, y = 0.18, z = 0.15 } },
  CATCC_Wall_Cargo = { min = { x = -0.05, y = 0, z = -0.25 }, max = { x = 0.05, y = 0.8, z = 0.25 } },
  CATCC_Block_Cargo = { min = { x = -0.2, y = 0, z = -0.4 }, max = { x = 0.2, y = 0.8, z = 0.4 } },
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
local cmds, order, timers, perMenu = {}, {}, {}, {}
missionCommands = {
  addSubMenuForGroup = function(gid, name, parent)
    if parent then perMenu[parent[1]] = (perMenu[parent[1]] or 0) + 1 end
    return { name }
  end,
  addCommandForGroup = function(gid, name, parent, fn)
    cmds[name] = fn; order[#order + 1] = name
    perMenu[parent[1]] = (perMenu[parent[1]] or 0) + 1
  end,
}
timer = { getTime = function() return 0 end, scheduleFunction = function(fn, arg, t) timers[#timers + 1] = fn end }
local handlers = {}
world = { event = { S_EVENT_BIRTH = 15 },
  addEventHandler = function(h) handlers[#handlers + 1] = h end,
  removeEventHandler = function(h) for i = #handlers, 1, -1 do if handlers[i] == h then table.remove(handlers, i) end end end }
trigger = { action = { outTextForGroup = function(gid, text) rec('say ' .. gid .. ' ' .. text) end } }
local logged = {}
env = { info = function(s) logged[#logged + 1] = s end }

CATCC_CT_SHOW_BLOCKERS = %SHOW%
assert(load(CT_SRC, 'chocktest'))()
rec('menu ' .. table.concat(order, ' | '))
local biggest = 0
for _, n in pairs(perMenu) do if n > biggest then biggest = n end end
rec('biggest menu ' .. biggest)
local function tick() timers[2](nil, 1) end
`;

// the parked collision blockers (their menu shows with CATCC_CT_SHOW_BLOCKERS)
const blockers = `
local function dump(tag)
  for _, s in ipairs(spawned) do
    if s.alive then
      local o = s.o
      rec(string.format('%s %s %s link=%s %s mass=%s off=%.4f,%.4f,%.4f', tag, o.type, o.category, tostring(o.linkUnit), tostring(o.linkOffset), tostring(o.mass), o.offsets.x, o.offsets.y, o.offsets.angle))
    end
  end
end
local function alive()
  local n = 0
  for _, s in ipairs(spawned) do if s.alive then n = n + 1 end end
  return n
end
-- our chock (looks only): aligned with the wheel's travel, a pair per wheel
cmds['Place: CATCC chock (looks only)']()
dump('chock')
-- the jet creeps 0.5 m forward along its heading, drops 0.3 m and its left gear folds: reported
local f = vec(HC + REL)
jet.x, jet.z, jet.y, jet.gearL = jet.x + 0.5 * f.x, jet.z + 0.5 * f.z, 21.7, 0.4
tick()
cmds['Toggle: also behind the wheels']()
rec('alive after toggle ' .. alive())
cmds['Remove blockers']()
rec('alive after remove ' .. alive())
jet.x, jet.z, jet.y, jet.gearL = jx, jz, 22, 1
-- the chock as a Cargo, then one step closer
cmds['Place: cargo chock']()
dump('cargochock')
cmds['Closer (gap -5 cm)']()
dump('closer')
for _ = 1, 10 do cmds['Closer (gap -5 cm)']() end
rec('alive after closer x11 ' .. alive())
cmds['Place: cargo block at tyres']()
dump('block')
cmds['Remove blockers']()
-- the Hornet's own chocks go on, the jet creeps 0.2 m, they come off
jet.arg23 = 1
tick()
jet.x, jet.z = jet.x + 0.2 * f.x, jet.z + 0.2 * f.z
tick()
jet.arg23 = 0
tick()
rec('logged ' .. #logged .. ' ' .. tostring(logged[1]))
for _, l in ipairs(logged) do rec('log ' .. l) end
return table.concat(out, '\\n')
`;

// the menu as installed: the PriFly hold switch only
const holdSwitch = `
rec('hold ' .. tostring(CATCC_CT.hold))
cmds['PriFly hold: ON']()
rec('hold ' .. tostring(CATCC_CT.hold))
cmds['PriFly hold: OFF (taxi instruction)']()
rec('hold ' .. tostring(CATCC_CT.hold))
cmds['PriFly hold: follow PriFly']()
rec('hold ' .. tostring(CATCC_CT.hold))
-- the next mission: the Lua state is the same one, the F10 menu is gone. The hook installs the file
-- again: a fresh switch and menu, and the first install's handler and timers stop
cmds['PriFly hold: ON']()
local firstTimers = #timers
order = {}
assert(load(CT_SRC, 'chocktest'))()
rec('again hold ' .. tostring(CATCC_CT.hold) .. ' menu ' .. table.concat(order, ' | '))
rec('handlers ' .. #handlers)
local stopped = 0
for i = 1, firstTimers do if timers[i](nil, 1) == nil then stopped = stopped + 1 end end
local running = 0
for i = firstTimers + 1, #timers do if timers[i](nil, 1) ~= nil then running = running + 1 end end
rec('timers stopped ' .. stopped .. ' of ' .. firstTimers .. ', running ' .. running)
return table.concat(out, '\\n')
`;

function run(harness: string): string[] {
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
// [wheel along, radius, across, nudge toward the tyre in front, behind]
const CHOCK_WHEELS = [
  [-2.4378, 0.34, -1.55, 0.05, 0.15],
  [-2.4378, 0.34, 1.55, 0.05, 0.15],
  [2.9851, 0.5385 / 2, 0, 0.07, 0.1],
];
const chockSpots = (gap: number) => {
  const want: number[][] = [];
  for (const [along, r, across, fwdAdj, aftAdj] of CHOCK_WHEELS) {
    want.push(offs(along + r + gap - fwdAdj + 0.18, across));
    want.push(offs(along - r - gap + aftAdj - 0.18, across));
  }
  return want;
};

describe('CATCC chock test (mission environment)', () => {
  const out = run(mocks.replace('%SHOW%', 'true') + blockers);
  const plain = run(mocks.replace('%SHOW%', 'nil') + holdSwitch);
  const HOLD_MENU = 'PriFly hold: ON | PriFly hold: OFF (taxi instruction) | PriFly hold: follow PriFly';
  it('offers only the PriFly hold switch unless the parked blockers are asked for, and the switch sets what the pilot mod reads', () => {
    expect(plain.find((l) => l.startsWith('menu '))).toBe('menu ' + HOLD_MENU);
    expect(plain.filter((l) => l.startsWith('hold '))).toEqual(['hold nil', 'hold on', 'hold off', 'hold nil']);
    expect(plain.some((l) => l.includes('PriFly hold ON (test)'))).toBe(true);
  });
  it('starts afresh when the hook installs it again for the next mission (the Lua state outlives a mission)', () => {
    expect(plain).toContain('again hold nil menu ' + HOLD_MENU);
    expect(plain).toContain('handlers 1');
    expect(plain).toContain('timers stopped 2 of 2, running 2');
  });
  it('fits the F10 menu (10 items at most in any one menu)', () => {
    const menu = out.find((l) => l.startsWith('menu '))!.slice(5).split(' | ');
    expect(Number(out.find((l) => l.startsWith('biggest menu '))!.slice(13))).toBeLessThanOrEqual(10);
    expect(Number(plain.find((l) => l.startsWith('biggest menu '))!.slice(13))).toBeLessThanOrEqual(10);
    expect(menu).toContain('Place: cargo chock');
    expect(menu).toContain('Place: cargo block at tyres');
  });
  it('places our chock as a pair per wheel (mains and nose), each nudged for its own wheel, linked to the carrier', () => {
    const chocks = out.filter((l) => l.startsWith('chock CATCC_Chock ADEquipment'));
    expect(chocks).toHaveLength(6);
    const got = chocks.map(parse);
    for (const [i, [x, y]] of chockSpots(0.03).entries()) {
      expect(chocks[i]).toContain('link=77 true');
      expect(got[i][0]).toBeCloseTo(x, 3);
      expect(got[i][1]).toBeCloseTo(y, 3);
      expect(got[i][2]).toBeCloseTo(REL, 3);
    }
  });
  it('tells the pilot what went out: size, orientation, height above the ship, the jet above the deck, life, gear', () => {
    const placed = out.find((l) => l.includes('x6 placed'));
    expect(placed).toBe('say 5 CATCC test: CATCC chock (looks only) x6 placed, gap 0.03 m, size 0.36 long x 0.30 wide x 0.18 high, end on; height above ship origin 20.15 m (deck is about 20.15), jet origin 1.85 m above it. Life 20.0/20.0');
    expect(out).toContain('say 5 CATCC test: gear nose/left/right 1.00/1.00/1.00 (1 = down)');
  });
  it('reports movement, a drop in height and the gear while the blockers are out, on screen and in dcs.log', () => {
    expect(out.find((l) => l.includes('moved 0.50 m'))).toBe('say 5 CATCC test: moved 0.50 m (0.27 fwd, 0.42 stbd) since placed, height -0.30 m, gear 1.00/0.40/1.00; life 20.0/20.0; blockers standing 6/6');
    expect(out.find((l) => l.startsWith('logged '))).toMatch(/^logged \d+ CATCC chock test: CATCC chock \(looks only\) x6 placed/);
  });
  it('places the chock as a Cargo at the same spots, and Closer walks each pair in 5 cm, down to its limit', () => {
    const cargo = out.filter((l) => l.startsWith('cargochock CATCC_Chock_Cargo Cargos'));
    expect(cargo).toHaveLength(6);
    expect(cargo[0]).toContain('mass=500');
    const got = cargo.map(parse);
    for (const [i, [x, y]] of chockSpots(0.03).entries()) {
      expect(got[i][0]).toBeCloseTo(x, 3);
      expect(got[i][1]).toBeCloseTo(y, 3);
    }
    const closer = out.filter((l) => l.startsWith('closer CATCC_Chock_Cargo')).map(parse);
    expect(closer).toHaveLength(6);
    for (const [i, [x, y]] of chockSpots(-0.02).entries()) {
      expect(closer[i][0]).toBeCloseTo(x, 3);
      expect(closer[i][1]).toBeCloseTo(y, 3);
    }
    // 0.03 -> -0.32 in seven steps, then no closer
    expect(out).toContain('say 5 CATCC test: gap -0.32 m is as close as this one goes');
    expect(out).toContain('alive after closer x11 6');
  });
  it('places the block just clear of the main tyres, ahead and behind', () => {
    const blocks = out.filter((l) => l.startsWith('block CATCC_Block_Cargo Cargos'));
    expect(blocks).toHaveLength(4);
    const want: number[][] = [];
    for (const side of [-1, 1]) {
      want.push(offs(-2.388 + 0.38 + 0.03 + 0.2, side * 1.55)); // near face 3 cm ahead of the tyre
      want.push(offs(-2.388 - 0.38 - 0.03 - 0.2, side * 1.55));
    }
    const got = blocks.map(parse);
    for (const [i, [x, y]] of want.entries()) {
      expect(got[i][0]).toBeCloseTo(x, 3);
      expect(got[i][1]).toBeCloseTo(y, 3);
    }
  });
  it("watches the Hornet's own chocks: on, movement while on, off, in dcs.log only", () => {
    expect(out).toContain("log CATCC chock test: the Hornet's own wheel chocks are ON");
    expect(out).toContain("log CATCC chock test: moved 0.20 m with the Hornet's own chocks on; life 20.0/20.0");
    expect(out).toContain("log CATCC chock test: the Hornet's own wheel chocks are OFF (moved 0.20 m at most while they were on)");
    expect(out.filter((l) => l.startsWith('say ') && /own (wheel )?chocks/.test(l))).toEqual([]);
  });
  it('takes the blockers behind the wheels away on request, and removes them all', () => {
    expect(out).toContain('alive after toggle 3');
    expect(out).toContain('alive after remove 0');
  });
});
