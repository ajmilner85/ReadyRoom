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
Export = { LoSetCommand = function(c, v) rec('gate ' .. c .. '=' .. v) end }
local args = {}
package.preload.Input = function()
  return { getEnvTable = function() return { Actions = { iCommandPilotGestureSalute = 1234 } } end }
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
-- chocks: the F8 request is kept while PriFly holds them, and goes through on the taxi instruction
local orig = { perform = function(self, p) rec('chocks removed ' .. tostring(p)) end }
local menu = package.loaded.catcc_pilot
before = #server.sent
server.inbox[#server.inbox + 1] = '{"type":"hold","p":[],"c":["Volt 3-1 | 401 Ace"]}'
frame(0.6)
menu.chocksRemove(orig, 'P')
frame(0.6)
rec('chocks kept ' .. server.sent:sub(before + 1):gsub('\\n', '|'))
server.inbox[#server.inbox + 1] = '{"type":"hold","p":[],"c":[]}'
frame(0.6)
-- nobody holds them: straight through
menu.chocksRemove(orig, 'Q')
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
    expect(out.slice(i)).toEqual(['chocks kept EV taxi Volt 3-1 | 401 Ace|', 'chocks removed P', 'chocks removed Q']);
  });
});
