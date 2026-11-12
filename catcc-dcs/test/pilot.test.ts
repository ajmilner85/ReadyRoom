// The CATCC pilot hook under fengari with mocked DCS/LuaSocket: it connects as PILOT, follows the
// server's hold list for this player, tells the gate device every 2 s, and fails open.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error fengari ships no types
import { lauxlib, lua, lualib, to_luastring } from 'fengari';

const src = fs.readFileSync(path.resolve(__dirname, '../pilot/Scripts/Hooks/CATCC-pilot-hook.lua'), 'utf8');

const harness = `
local out = {}
local function rec(s) out[#out + 1] = s end
realTime = 0
log = { INFO = 1, write = function() end }
lfs = { writedir = function() return 'W/' end }
loadfile = function() return nil end
local server = { inbox = {}, sent = '' }
package.preload.socket = function()
  return {
    gettime = function() return realTime end,
    tcp = function()
      local s = {}
      function s:settimeout() end
      function s:connect(h, p) rec('connect ' .. h .. ':' .. p) end
      function s:send(d) server.sent = server.sent .. d end
      function s:close() end
      function s:receive()
        local l = table.remove(server.inbox, 1)
        if l then return l end
        return nil, 'timeout', ''
      end
      return s
    end,
  }
end
local cb
DCS = { setUserCallbacks = function(h) cb = h end, getRealTime = function() return realTime end }
net = { get_my_player_id = function() return 7 end, get_player_info = function(id, k) return 'Volt 3-1 | 401 Ace' end }
-- the mission's message functions (single player / hosting: the hook shows its messages itself)
local SAY = { world = { getPlayer = function() return { getID = function() return 77 end } end },
  trigger = { action = { outTextForUnit = function(id, text) rec('say ' .. text) end } } }
net.dostring_in = function(state, code)
  if state ~= 'server' then return nil end
  return assert(load(code, 'say', 't', SAY))()
end
Export = { LoSetCommand = function(c, v) rec('gate ' .. c .. '=' .. v) end }
local args = {}
package.preload.Input = function()
  return { getEnvTable = function() return { Actions = { iCommandPilotGestureSalute = 1234, iCommandPlaneWheelBrakeOn = 74, iCommandPlaneWheelBrakeOff = 75 } } end }
end
assert(load(PILOT_SRC, 'pilot'))()
local function frame(dt) realTime = realTime + dt; cb.onSimulationFrame() end
cb.onSimulationStart()
frame(0.1)
rec('sent ' .. server.sent:gsub('\\n', '|'))
server.inbox[#server.inbox + 1] = '{"type":"hold","p":["Someone [VFA] \\\\"Q\\\\"","Volt 3-1 | 401 Ace"]}'
frame(0.1)
frame(0.5)
frame(2.0)
server.inbox[#server.inbox + 1] = '{"type":"hold","p":[]}'
frame(0.1)
server.inbox[#server.inbox + 1] = '{"type":"hold","p":["Volt 3-1 | 401 Ace"]}'
frame(0.1)
frame(13) -- the server goes quiet: not held any more
local before = #server.sent
-- held again; then salutes (only reported while held)
Export.LoGetAircraftDrawArgumentValue = function(n) return args[n] or 0 end
server.inbox[#server.inbox + 1] = '{"type":"hold","p":["Volt 3-1 | 401 Ace"]}'
frame(0.3)
args[997] = 0.75; frame(0.3) -- the gate device marks a salute (key bound to the salute command)
frame(0.3)                   -- still marked: not reported twice
args[997] = 1; frame(0.3)
args[520] = 0.5; frame(6)    -- the pilot figure salutes (right hand), after the cooldown
args[520] = 0; args[997] = 0
server.inbox[#server.inbox + 1] = '{"type":"hold","p":[]}'
frame(0.3)
args[997] = 0.25; frame(6)   -- not held: nothing to report
rec('salutes ' .. server.sent:sub(before + 1):gsub('\\n', '|'))
args[997] = 0
-- held for launch with the launch bar coming down: PriFly hears the shooter is ready
before = #server.sent
server.inbox[#server.inbox + 1] = '{"type":"hold","p":["Volt 3-1 | 401 Ace"],"c":[]}'
frame(0.6)
args[85] = 0.88; frame(0.6)
frame(0.6)
args[85] = 0; frame(0.6)
rec('lb ' .. server.sent:sub(before + 1):gsub('\\n', '|'))
-- chocks: the menu's state lives in DCS's main Lua state ("server" to net.dostring_in), as the patched
-- comm.lua line leaves it; the hook sets the held flag there and collects the pilot's requests
EXPORT = { speed = 0, rpm = 70 }
local MAIN = { os = os, tostring = tostring, world = SAY.world, trigger = SAY.trigger }
MAIN.CATCC_CHOCKS = { held = false, at = 0, asked = 0, pending = false,
  place = function() rec('chocks placed') end, remove = function() rec('chocks removed via menu') end }
-- what the patched menu does when the pilot presses Remove
local function pressRemove()
  local S = MAIN.CATCC_CHOCKS
  if S.held then S.asked = S.asked + 1; S.pending = true else rec('chocks removed (stock)') end
end
net.dostring_in = function(state, code)
  if state == 'export' then
    if code:find('LoGetVectorVelocity', 1, true) then return tostring(EXPORT.speed) end
    if code:find('LoGetEngineInfo', 1, true) then return tostring(EXPORT.rpm) end
    return nil
  end
  if state ~= 'server' then return nil end
  return assert(load(code, 'main', 't', MAIN))()
end
before = #server.sent
server.inbox[#server.inbox + 1] = '{"type":"hold","p":[],"c":["Volt 3-1 | 401 Ace"]}'
for _ = 1, 8 do frame(1.0) end -- found, flag set, stopped 3 s: a hot start gets chocks placed
pressRemove()
frame(1.1)
rec('chocks kept ' .. server.sent:sub(before + 1):gsub('\\n', '|'))
-- a salute while parked (the deck crew pulls the chocks on it): the chocks go back on a few seconds later
-- the 5 s refresh; held for launch too, as every player jet on deck is
server.inbox[#server.inbox + 1] = '{"type":"hold","p":["Volt 3-1 | 401 Ace"],"c":["Volt 3-1 | 401 Ace"]}'
args[520] = 0.5; frame(0.3)
args[520] = 0
for _ = 1, 5 do frame(1.0) end
rec('rechock done')
server.inbox[#server.inbox + 1] = '{"type":"hold","p":[],"c":[]}'
frame(1.1)
-- nobody holds them: straight through
pressRemove()
-- single player: the network name is "player"; the server knows the unit's pilot name
net.get_player_info = function() return 'player' end
Export.LoGetPilotName = function() return 'New callsign' end
local mark = #out
server.inbox[#server.inbox + 1] = '{"type":"hold","p":["New callsign"],"c":[]}'
frame(2.1)
for k = mark + 1, #out do if out[k] == 'gate 11873=1' then rec('sp gate 11873=1') break end end
-- joined someone else's server: the mission's message functions are the server's, so messages go
-- through the server hook (MSG <name><TAB><text>)
DCS.isMultiplayer = function() return true end
DCS.isServer = function() return false end
net.get_player_info = function() return 'Volt 3-1 | 401 Ace' end
before = #server.sent
server.inbox[#server.inbox + 1] = '{"type":"hold","p":[],"c":["Volt 3-1 | 401 Ace"]}'
frame(2.1)
frame(0.1)
rec('relay ' .. server.sent:sub(before + 1):gsub('\\n', '|'))
return table.concat(out, '\\n')
`;

function run(): string[] {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  lua.lua_pushstring(L, to_luastring(src));
  lua.lua_setglobal(L, to_luastring('PILOT_SRC'));
  const status = lauxlib.luaL_dostring(L, to_luastring(harness));
  const out = lua.lua_tojsstring(L, -1) as string;
  if (status !== 0) throw new Error(out);
  return out.split('\n');
}

describe('CATCC pilot hook', () => {
  const out = run();
  it('connects to the server hook as a pilot', () => {
    expect(out[0]).toBe('connect dcs.fightingstingrays.com:10310');
    expect(out).toContain('sent PILOT|');
  });
  it('holds while the server lists this player, lets go when it does not, and fails open when the server goes quiet', () => {
    const gates = out.filter((l) => l.startsWith('gate 11873=')).map((l) => l.slice(5));
    // first frame: nothing heard yet (open); then held; refreshed every 2 s; released; held; lapses
    expect(gates.slice(0, 6)).toEqual(['11873=0', '11873=1', '11873=1', '11873=0', '11873=1', '11873=0']);
  });
  it('tells the gate device which command is the pilot salute (looked up, whatever the key binding)', () => {
    expect(out).toContain('gate 11874=1234');
  });
  it('reports a salute while held, once per salute, from the gate mark or the pilot figure', () => {
    expect(out.find((l) => l.startsWith('salutes '))).toBe('salutes SALUTE Volt 3-1 | 401 Ace|SALUTE Volt 3-1 | 401 Ace|');
  });
  it('tells PriFly the launch bar is down (shooter ready) and back up', () => {
    expect(out.find((l) => l.startsWith('lb '))).toBe('lb EV lb1 Volt 3-1 | 401 Ace|EV lb0 Volt 3-1 | 401 Ace|');
  });
  it('keeps the F8 chocks request while PriFly holds the chocks, then lets it through', () => {
    const i = out.indexOf('chocks kept EV taxi Volt 3-1 | 401 Ace|');
    expect(i).toBeGreaterThan(-1);
    expect(out.slice(0, i).some((l) => l.startsWith('chocks removed'))).toBe(false);
    expect(out.slice(i).filter((l) => l.startsWith('chocks') && l !== 'chocks placed').slice(0, 3)).toEqual(['chocks kept EV taxi Volt 3-1 | 401 Ace|', 'chocks removed via menu', 'chocks removed (stock)']);
  });
  it('draws the chocks (model argument via the gate device) while PriFly holds them and the jet is parked', () => {
    const kept = out.findIndex((l) => l.startsWith('chocks kept'));
    const done = out.indexOf('rechock done');
    expect(out.slice(0, kept)).toContain('gate 11875=1');
    // released: no longer drawn
    expect(out.slice(done)).toContain('gate 11875=0');
  });
  it('never asks the deck crew for chocks itself (DCS refuses them on a hot start or after a release)', () => {
    expect(out).not.toContain('chocks placed');
  });
  it('shows the pilot what matters on screen (single player or hosting: directly)', () => {
    for (const m of [
      'in contact with PriFly',
      'salute reported to PriFly',
      'chocks drawn: PriFly holds them until your taxi instruction',
      'taxi instruction given: chocks coming off',
      'lost contact with PriFly: nothing is held',
    ]) {
      expect(out).toContain('say CATCC: ' + m);
    }
    // the same message at most every 10 s (the first two salutes, 7 s apart: shown once)
    const end = out.findIndex((l) => l.startsWith('salutes '));
    expect(out.slice(0, end).filter((l) => l === 'say CATCC: salute reported to PriFly').length).toBe(1);
  });
  it('sends its messages through the server hook when it joined someone else\'s server', () => {
    expect(out.find((l) => l.startsWith('relay '))).toBe('relay MSG Volt 3-1 | 401 Ace\tchocks drawn: PriFly holds them until your taxi instruction|');
  });
  it('knows the pilot by the unit\'s pilot name too (single player)', () => {
    expect(out).toContain('gate 11873=1'); // held under the multiplayer name above; the single-player case follows
    expect(out.find((l) => l.startsWith('sp '))).toBe('sp gate 11873=1');
  });
});
