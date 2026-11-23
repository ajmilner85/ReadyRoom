// The slot picker's S.liveNear (Scripts/CATCC/crewtest_slots.lua): what stands nearest a deck spot that is not the
// deck spotting demo's own: asked of the mission's state (net.dostring_in('server', ...)). The user, 2026-11-23, of
// the pre-check that no longer takes DCS's "obstructed" alone: "Can't we catch that ourselves?". Run here: the Lua it
// sends, against a stand-in mission: a ship under way on a heading, aircraft and statics on and off its deck.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error fengari has no types
import fengari from 'fengari';

const here = (p: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), p);
const src = fs.readFileSync(here('../Scripts/CATCC/crewtest_slots.lua'), 'utf8').replace(/\r\n/g, '\n');
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

function run(code: string): string {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  if (lauxlib.luaL_dostring(L, to_luastring(code)) !== 0) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
  lua.lua_getglobal(L, to_luastring('OUT'));
  return to_jsstring(lua.lua_tostring(L, -1));
}

// (the function's own text, taken from the file: from its head to the blank line after its end)
const fn = src.slice(src.indexOf('function S.liveNear(carrier, sp)'), src.indexOf('\nend\n', src.indexOf('function S.liveNear(carrier, sp)')) + 5);

/** the mission as the picker's Lua sees it: the ship at (1000, 20, 2000) heading 30 degrees; things given in the ship's frame */
const world = (things: { name: string; fwd: number; stbd: number; up?: number; kind: 'unit' | 'static'; player?: string }[]) => `
local S = {}
local function myId() return 1 end
local function pinfo(id, k) return 'Host' end
local H = math.rad(30)
local FX, FZ = { x = math.cos(H), y = 0, z = math.sin(H) }, { x = -math.sin(H), y = 0, z = math.cos(H) }
local SHIP = { p = { x = 1000, y = 20, z = 2000 }, x = FX, z = FZ }
local function obj(name, fwd, stbd, up, player)
  local pt = { x = SHIP.p.x + fwd * FX.x + stbd * FZ.x, y = SHIP.p.y + up, z = SHIP.p.z + fwd * FX.z + stbd * FZ.z }
  return { getPoint = function() return pt end, getName = function() return name end, isExist = function() return true end, getPlayerName = function() return player end }
end
local units, statics = {}, {}
${things.map((t) => `table.insert(${t.kind === 'unit' ? 'units' : 'statics'}, obj(${JSON.stringify(t.name)}, ${t.fwd}, ${t.stbd}, ${t.up ?? 0}, ${t.player ? JSON.stringify(t.player) : 'nil'}))`).join('\n')}
Unit = { getByName = function(n) if n == 'Roosevelt' then return { getPosition = function() return SHIP end } end end }
Group = { Category = { AIRPLANE = 0, HELICOPTER = 1 } }
coalition = {
  side = { NEUTRAL = 0, RED = 1, BLUE = 2 },
  getGroups = function(side, cat) if side == 2 and cat == 0 then return { { getUnits = function() return units end } } end return {} end,
  getStaticObjects = function(side) if side == 2 then return statics end return {} end,
}
net = { dostring_in = function(state, code) return assert((loadstring or load)(code))() end }
${fn}
local d, who = S.liveNear(CARRIER or 'Roosevelt', { x = 91.4, z = 15.46 })
OUT = d and string.format('%.2f %s', d, tostring(who)) or 'nil'`;

describe('the slot picker: what stands near a spot that is not the demo\'s', () => {
  it('finds the function', () => {
    expect(fn).toContain('coalition.getStaticObjects');
    expect(fn.trimEnd().endsWith('end')).toBe(true);
  });
  it('gives the nearest live aircraft or mission static in the ship\'s frame, with its name; not the demo\'s statics, not the asking player\'s own aircraft', () => {
    // another player's jet 3 m forward of the spot, an AI jet 14 m off, the demo's own static on the spot itself
    expect(
      run(
        world([
          { name: 'catcc-demo-a5', fwd: 91.4, stbd: 15.46, kind: 'static' },
          { name: 'AI 1', fwd: 105.4, stbd: 15.46, kind: 'unit' },
          { name: 'Jet 2', fwd: 94.4, stbd: 15.46, kind: 'unit', player: 'Bob' },
        ]),
      ),
    ).toBe('3.00 Bob');
    // the asking player's own aircraft on the spot is not counted: the AI jet is the nearest
    expect(
      run(
        world([
          { name: 'Mine', fwd: 91.4, stbd: 15.46, kind: 'unit', player: 'Host' },
          { name: 'AI 1', fwd: 105.4, stbd: 15.46, kind: 'unit' },
        ]),
      ),
    ).toBe('14.00 AI 1');
    // a static of the mission's own counts
    expect(run(world([{ name: 'Crate', fwd: 91.4, stbd: 19.46, kind: 'static' }]))).toBe('4.00 Crate');
  });
  it('nothing within 60 m, something high above the deck, or no such ship: nil', () => {
    expect(run(world([{ name: 'Far', fwd: -100, stbd: 0, kind: 'unit' }]))).toBe('nil');
    expect(run(world([{ name: 'Overhead', fwd: 91.4, stbd: 15.46, up: 300, kind: 'unit' }]))).toBe('nil');
    expect(run(`CARRIER = 'Nimitz'\n${world([{ name: 'Jet', fwd: 91.4, stbd: 15.46, kind: 'unit' }])}`)).toBe('nil');
  });
});
