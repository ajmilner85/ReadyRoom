// The CATCC pilot hook under fengari with mocked DCS/LuaSocket: it connects as PILOT, follows the
// server's hold list for this player, tells the gate device every 2 s, keeps a parked jet's chocks in
// while PriFly holds them (the salute held back from the deck crew, or chocks asked from the ground
// crew), and fails open.
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
-- the pilot's own config turns the on-screen messages on (they are off by default)
loadfile = function(p)
  if p == 'W/Config/CATCC-pilot.lua' then return function() return { messages = true } end end
  return nil
end
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
for _ = 1, 8 do frame(1.0) end -- found, flags set (not a Hornet here: nobody is asked for chocks)
rec('menu flags held=' .. tostring(MAIN.CATCC_CHOCKS.held) .. ' sal=' .. tostring(MAIN.CATCC_CHOCKS.sal))
pressRemove()
frame(1.1)
rec('chocks kept ' .. server.sent:sub(before + 1):gsub('\\n', '|'))
-- a salute while parked; the 5 s refresh; held for launch too, as every player jet on deck is
server.inbox[#server.inbox + 1] = '{"type":"hold","p":["Volt 3-1 | 401 Ace"],"c":["Volt 3-1 | 401 Ace"]}'
args[520] = 0.5; frame(0.3)
args[520] = 0
for _ = 1, 5 do frame(1.0) end
rec('rechock done')
server.inbox[#server.inbox + 1] = '{"type":"hold","p":[],"c":[]}'
frame(1.1)
rec('menu flags held=' .. tostring(MAIN.CATCC_CHOCKS.held) .. ' sal=' .. tostring(MAIN.CATCC_CHOCKS.sal))
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

// A Hornet parked on the carrier, the hook's F8-menu state and DCS's input system mocked: layers with
// their key combinations and modifiers, and the layer stack (top first). The pilot has the salute on
// the stock key (LShift + LCtrl + LAlt + S) and on a stick button; BTN2 is a modifier of his.
const deck = `
local out = {}
local function rec(s) out[#out + 1] = s end
realTime = 0
local logged = {}
log = { INFO = 1, write = function(_, _, m) logged[#logged + 1] = m end }
lfs = { writedir = function() return 'W/' end }
loadfile = function(p)
  if p == 'W/Config/CATCC-pilot.lua' then return function() return { messages = true } end end
  if p == 'W/Config/CATCC-test.lua' and TEST_CONFIG then return function() return { chockTest = true } end end
  return nil
end
local server = { inbox = {}, sent = '' }
package.preload.socket = function()
  return {
    gettime = function() return realTime end,
    tcp = function()
      local s = {}
      function s:settimeout() end
      function s:connect() end
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
local unitType, unitId = 'FA-18C_hornet', '101'
DCS = { setUserCallbacks = function(h) cb = h end, getRealTime = function() return realTime end,
  getPlayerUnitType = function() return unitType end, getPlayerUnit = function() return unitId end }
net = { get_my_player_id = function() return 7 end, get_player_info = function() return 'Ace' end }
local args = { [23] = 1 }   -- the deck crew's chocks are in
Export = { LoSetCommand = function() end, LoGetAircraftDrawArgumentValue = function(n) return args[n] or 0 end,
  LoGetVectorVelocity = function() return { x = 13, y = 0, z = 0 } end } -- the carrier makes 13 m/s
-- DCS's main Lua state: the F8 menu as the patched comm.lua leaves it, and the mission environment
local MAIN = { os = os, tostring = tostring, CATCC_CT = {},
  world = { getPlayer = function() return { getID = function() return 77 end } end },
  trigger = { action = { outTextForUnit = function(id, text) rec('say ' .. text) end } } }
MAIN.CATCC_CHOCKS = { held = false, at = 0, asked = 0, pending = false, salPatched = not OLD_INSTALL,
  place = function() rec('ground crew asked: place') if GC_PLACES then args[23] = 1 end end,
  remove = function() rec('ground crew asked: remove') args[23] = 0 end }
local function pressF8Salute()
  local S = MAIN.CATCC_CHOCKS
  if S.sal then S.salAsked = (S.salAsked or 0) + 1 else rec('F8 salute sent (stock)') end
end
net.dostring_in = function(state, code)
  if state ~= 'server' then return nil end
  return assert(load(code, 'main', 't', MAIN))()
end
-- the input system
local EVENTS = { S = 31, G = 34, K = 37, JOY_BTN5 = 505, LShift = 42, LCtrl = 29, LAlt = 56, JOY_BTN2 = 502 }
local DEVICES = { Keyboard = 1, ['Stick {A}'] = 2 }
local stack, layers = { 'Unit FA-18C_hornet', 'UiLayer' }, {}
local function unstack(n) for i = #stack, 1, -1 do if stack[i] == n then table.remove(stack, i) end end end
local comboFails = false
local I = {
  getEnvTable = function() return { Actions = { iCommandPilotGestureSalute = 238 } } end,
  createLayer = function(n) layers[n] = { combos = {}, mods = {} } end,
  deleteLayer = function(n) layers[n] = nil; unstack(n) end,
  addReformer = function(n, ev, dev, sw) local m = layers[n].mods; m[#m + 1] = dev .. ':' .. ev end,
  addKeyCombo = function(n, ev, dev, refs, down, pressed, up, cockpitDev, vd, vp, vu)
    if comboFails then error('input system says no') end
    local r = {}
    for _, x in ipairs(refs or {}) do r[#r + 1] = x.deviceId .. ':' .. x.key end
    table.sort(r)
    local c = layers[n].combos
    c[#c + 1] = dev .. ':' .. ev .. (#r > 0 and (' with ' .. table.concat(r, '+')) or '') .. ' -> ' .. tostring(down) ..
      ((pressed or up or cockpitDev) and ' (and more)' or '')
  end,
  setTopLayer = function(n) unstack(n); table.insert(stack, 1, n) end,
  removeLayerFromStack = function(n) unstack(n) end,
  getLayerStack = function() local c = {} for i, n in ipairs(stack) do c[i] = n end return c end,
  getDeviceId = function(name) return DEVICES[name] end,
}
package.preload.Input = function() return I end
local saluteCombos = { Keyboard = { { key = 'S', reformers = { 'LShift', 'LCtrl', 'LAlt' }, valid = true } },
  ['Stick {A}'] = { { key = 'JOY_BTN5', valid = true }, { key = 'JOY_BTN5', reformers = { 'Gone' }, valid = false } } }
local profileReadable = true
package.preload['Input.Data'] = function()
  return {
    getUnitMarker = function() return 'Unit ' end,
    getProfileNameByUnitName = function(ty) return (profileReadable and ty == 'FA-18C_hornet') and 'F/A-18C' or nil end,
    getProfileModifiers = function() return {
      LShift = { event = 42, deviceId = 1 }, LCtrl = { event = 29, deviceId = 1 }, LAlt = { event = 56, deviceId = 1 },
      JOY_BTN2 = { event = 502, deviceId = 2, switch = false } } end,
    getProfileKeyCommands = function()
      profileReads = (profileReads or 0) + 1
      return {
        { name = 'Gear', down = 68, combos = { Keyboard = { { key = 'G', valid = true } } } },
        { name = 'Pilot Salute', down = 238, combos = saluteCombos } }
    end,
    createModifier = function(key, dev) return { key = key, event = EVENTS[key] or 99, deviceId = DEVICES[dev] } end,
  }
end
package.preload['Input.Utils'] = function() return { getInputEvent = function(k) return EVENTS[k] end } end
package.preload['Input.ProfileDatabase'] = function() return {} end
local function layerText()
  local l = layers['CATCC hold']
  if not l then return 'none' end
  table.sort(l.combos); table.sort(l.mods)
  return table.concat(l.combos, '; ') .. ' | modifiers ' .. table.concat(l.mods, ',')
end
local function stackText() return table.concat(stack, ' > ') end
assert(load(PILOT_SRC, 'pilot'))()
local function frame(dt) realTime = realTime + dt; cb.onSimulationFrame() end
local function frames(n, dt) for _ = 1, n do frame(dt) end end
local function holdList(p, c) server.inbox[#server.inbox + 1] = '{"type":"hold","p":[' .. p .. '],"c":[' .. c .. ']}' end
local function sentSince(n) return (server.sent:sub(n + 1):gsub('\\n', '|')) end
local function wasLogged(text) for _, m in ipairs(logged) do if m:find(text, 1, true) then return true end end return false end
cb.onSimulationStart()
`;

// deck crew on: the jet spawns chocked; the salute is held while PriFly holds the chocks
const saluteHold = `
frames(3, 0.5)
rec('before layer ' .. layerText() .. ' / ' .. stackText())
holdList('', '"Ace"')
frames(4, 0.5)
rec('held layer ' .. layerText())
rec('held stack ' .. stackText())
rec('held flags held=' .. tostring(MAIN.CATCC_CHOCKS.held) .. ' sal=' .. tostring(MAIN.CATCC_CHOCKS.sal))
-- the pilot presses his salute key: the layer sends our command, the gate device marks it
local before = #server.sent
args[997] = 0.25; frame(0.3); frame(0.3)
args[997] = 0
rec('key salute ' .. sentSince(before))
-- and the F8 "Salute!" item: counted by the patched menu, not sent
before = #server.sent
pressF8Salute()
frames(3, 0.5)
rec('F8 salute ' .. sentSince(before))
-- something puts the aircraft's layer back on top (a view change): ours goes back above it
I.setTopLayer('Unit FA-18C_hornet')
rec('pushed down ' .. stackText())
frames(2, 0.5)
rec('back on top ' .. stackText())
-- the radio menu's layer on top of ours is nobody's business
table.insert(stack, 1, 'CommandMenuItems')
frames(2, 0.5)
rec('menu open ' .. stackText())
table.remove(stack, 1)
-- the pilot binds the salute to another key as well: picked up at the next reading of the bindings
holdList('', '"Ace"')
saluteCombos.Keyboard[2] = { key = 'K', valid = true }
for _ = 1, 8 do holdList('', '"Ace"'); frames(8, 0.5) end
rec('rebound layer ' .. layerText())
rec('rebound stack ' .. stackText())
-- taxi instruction: PriFly lets go
holdList('', '')
frames(3, 0.5)
rec('released layer ' .. layerText() .. ' / ' .. stackText())
rec('released flags held=' .. tostring(MAIN.CATCC_CHOCKS.held) .. ' sal=' .. tostring(MAIN.CATCC_CHOCKS.sal))
pressF8Salute()
rec('asked ground crew ' .. tostring(wasLogged('asking the ground crew')))
-- held again, then PriFly goes quiet: fail-open
holdList('', '"Ace"')
frames(3, 0.5)
rec('held again ' .. (layers['CATCC hold'] and 'layer' or 'none'))
frames(30, 0.5)
rec('quiet ' .. layerText() .. ' / ' .. stackText())
-- on a catapult (launch bar down) the salute is the launch signal: never held there
args[85] = 0.9
holdList('"Ace"', '"Ace"')
frames(4, 0.5)
rec('on the cat ' .. layerText() .. ' sal=' .. tostring(MAIN.CATCC_CHOCKS.sal) .. ' held=' .. tostring(MAIN.CATCC_CHOCKS.held))
args[85] = 0
-- the mission stops while held: the layer goes
holdList('', '"Ace"')
frames(4, 0.5)
rec('before stop ' .. (layers['CATCC hold'] and 'layer' or 'none'))
cb.onSimulationStop()
rec('after stop ' .. layerText() .. ' / ' .. stackText())
return table.concat(out, '\\n')
`;

// the input system refuses the combination: no layer is left behind, the F8 item is still held
const saluteHoldFails = `
comboFails = true
holdList('', '"Ace"')
frames(6, 0.5)
rec('failed layer ' .. layerText() .. ' / ' .. stackText())
rec('failed flags sal=' .. tostring(MAIN.CATCC_CHOCKS.sal))
comboFails = false
holdList('', '"Ace"')
frames(6, 0.5)
rec('not retried ' .. layerText())
return table.concat(out, '\\n')
`;

// the aircraft's profile can't be read: the stock key is held all the same
const saluteHoldStockKey = `
profileReadable = false
holdList('', '"Ace"')
frames(4, 0.5)
rec('stock layer ' .. layerText())
return table.concat(out, '\\n')
`;

// the pilot has nothing bound to the salute: no layer, and the bindings are not read over and over
const saluteUnbound = `
saluteCombos.Keyboard, saluteCombos['Stick {A}'] = nil, nil
for _ = 1, 5 do holdList('', '"Ace"'); frames(8, 0.5) end
rec('unbound layer ' .. layerText() .. ' sal=' .. tostring(MAIN.CATCC_CHOCKS.sal) .. ' reads ' .. tostring(profileReads))
return table.concat(out, '\\n')
`;

// deck crew off: nothing chocks the jet, so the Hornet's ground crew is asked
const groundCrew = `
local function count(text, from)
  local n = 0
  for k = (from or 0) + 1, #out do if out[k] == text then n = n + 1 end end
  return n
end
args[23] = 0
GC_PLACES = true
frames(4, 0.5)
rec('unheld asks ' .. count('ground crew asked: place'))
holdList('', '"Ace"')
frames(4, 0.5)       -- 2 s into the hold: not yet
rec('asked early ' .. count('ground crew asked: place'))
frames(8, 0.5)
holdList('', '"Ace"')
frames(8, 0.5)
rec('asked ' .. count('ground crew asked: place') .. ' chocks ' .. args[23])
-- taxi instruction: the chocks this mod asked for come out
holdList('', '')
frames(4, 0.5)
rec('removed ' .. count('ground crew asked: remove') .. ' chocks ' .. args[23])
frames(8, 0.5)
rec('removed later ' .. count('ground crew asked: remove'))
-- the ground crew won't (deck crew on, its chocks already pulled): three tries, 45 s apart, then left
GC_PLACES = false
local mark = #out
for _ = 1, 50 do holdList('', '"Ace"'); frames(8, 0.5) end
rec('refused tries ' .. count('ground crew asked: place', mark))
holdList('', '')
frames(4, 0.5)
rec('refused removes ' .. count('ground crew asked: remove', mark))
-- another type of aircraft: its ground crew menu isn't ours to use
unitType, unitId = 'F-14B', '102'
mark = #out
for _ = 1, 4 do holdList('', '"Ace"'); frames(8, 0.5) end
rec('other type asks ' .. count('ground crew asked: place', mark))
return table.concat(out, '\\n')
`;

// chocks already in when the hold starts (the deck crew's): left to their owner on release
const crewChocks = `
for _ = 1, 4 do holdList('', '"Ace"'); frames(8, 0.5) end
holdList('', '')
frames(6, 0.5)
local n = 0
for _, l in ipairs(out) do if l:find('ground crew asked', 1, true) then n = n + 1 end end
rec('requests ' .. n .. ' chocks ' .. args[23])
return table.concat(out, '\\n')
`;

// the F10 test switch (Config/CATCC-test.lua chockTest = true) stands in for PriFly
const testSwitch = `
frames(4, 0.5)
rec('idle ' .. layerText())
MAIN.CATCC_CT.hold = 'on'
frames(4, 0.5)
rec('test on ' .. (layers['CATCC hold'] and 'layer' or 'none') .. ' held=' .. tostring(MAIN.CATCC_CHOCKS.held))
MAIN.CATCC_CT.hold = 'off'
holdList('', '"Ace"')       -- PriFly holds too: OFF wins while the switch is thrown
frames(4, 0.5)
rec('test off ' .. layerText() .. ' held=' .. tostring(MAIN.CATCC_CHOCKS.held))
MAIN.CATCC_CT.hold = nil
frames(4, 0.5)
rec('follows PriFly ' .. (layers['CATCC hold'] and 'layer' or 'none') .. ' held=' .. tostring(MAIN.CATCC_CHOCKS.held))
return table.concat(out, '\\n')
`;

// no config at all: nothing on screen
const quiet = `
local out = {}
local function rec(s) out[#out + 1] = s end
realTime = 0
log = { INFO = 1, write = function() end }
lfs = { writedir = function() return 'W/' end }
loadfile = function() return nil end
local server = { inbox = {} }
package.preload.socket = function()
  return {
    gettime = function() return realTime end,
    tcp = function()
      local s = {}
      function s:settimeout() end
      function s:connect() end
      function s:send() end
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
net = { get_my_player_id = function() return 7 end, get_player_info = function() return 'Ace' end }
net.dostring_in = function(state, code)
  if state ~= 'server' then return nil end
  return assert(load(code, 'main', 't', { tostring = tostring,
    world = { getPlayer = function() return { getID = function() return 77 end } end },
    trigger = { action = { outTextForUnit = function(id, text) rec('say ' .. text) end } } }))()
end
Export = { LoSetCommand = function(c, v) rec('gate ' .. c .. '=' .. v) end }
package.preload.Input = function() return { getEnvTable = function() return { Actions = {} } end } end
assert(load(PILOT_SRC, 'pilot'))()
cb.onSimulationStart()
for _ = 1, 20 do
  server.inbox[#server.inbox + 1] = '{"type":"hold","p":["Ace"],"c":["Ace"]}'
  realTime = realTime + 0.5
  cb.onSimulationFrame()
end
return table.concat(out, '\\n')
`;

function run(h: string = harness): string[] {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  lua.lua_pushstring(L, to_luastring(src));
  lua.lua_setglobal(L, to_luastring('PILOT_SRC'));
  const status = lauxlib.luaL_dostring(L, to_luastring(h));
  const out = lua.lua_tojsstring(L, -1) as string;
  if (status !== 0) throw new Error(out);
  return out.split('\n');
}
const line = (out: string[], start: string) => out.find((l) => l.startsWith(start));

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
    expect(line(out, 'salutes ')).toBe('salutes SALUTE Volt 3-1 | 401 Ace|SALUTE Volt 3-1 | 401 Ace|');
  });
  it('tells PriFly the launch bar is down (shooter ready) and back up', () => {
    expect(line(out, 'lb ')).toBe('lb EV lb1 Volt 3-1 | 401 Ace|EV lb0 Volt 3-1 | 401 Ace|');
  });
  it('tells the F8 menu while PriFly holds the chocks (Remove and Salute! are held there), and when it lets go', () => {
    expect(out.filter((l) => l.startsWith('menu flags '))).toEqual(['menu flags held=true sal=true', 'menu flags held=false sal=false']);
  });
  it('keeps the F8 chocks request while PriFly holds the chocks, then lets it through', () => {
    const i = out.indexOf('chocks kept EV taxi Volt 3-1 | 401 Ace|');
    expect(i).toBeGreaterThan(-1);
    expect(out.slice(0, i).some((l) => l.startsWith('chocks removed'))).toBe(false);
    expect(out.slice(i).filter((l) => l.startsWith('chocks')).slice(0, 3)).toEqual(['chocks kept EV taxi Volt 3-1 | 401 Ace|', 'chocks removed via menu', 'chocks removed (stock)']);
  });
  it('no longer has the gate device draw chocks (looks only: parked in pilot/experiments)', () => {
    expect(out.some((l) => l.startsWith('gate 11875='))).toBe(false);
  });
  it('asks nobody for chocks in an aircraft that is not a Hornet', () => {
    expect(out).not.toContain('chocks placed');
  });
  it('shows the pilot what the mod is doing when messages are on (single player or hosting: directly)', () => {
    for (const m of [
      'in contact with PriFly',
      'salute reported to PriFly',
      'PriFly holds your chocks until your taxi instruction',
      'chocks request kept: they come off with your taxi instruction',
      'PriFly let go: chocks coming off',
      'PriFly let go of your chocks',
      'lost contact with PriFly: nothing is held',
    ]) {
      expect(out).toContain('say CATCC: ' + m);
    }
    // the same message at most every 10 s (the first two salutes, 7 s apart: shown once)
    const end = out.findIndex((l) => l.startsWith('salutes '));
    expect(out.slice(0, end).filter((l) => l === 'say CATCC: salute reported to PriFly').length).toBe(1);
  });
  it('sends its messages through the server hook when it joined someone else\'s server', () => {
    expect(line(out, 'relay ')).toBe('relay MSG Volt 3-1 | 401 Ace\tPriFly holds your chocks until your taxi instruction|');
  });
  it('knows the pilot by the unit\'s pilot name too (single player)', () => {
    expect(out).toContain('gate 11873=1'); // held under the multiplayer name above; the single-player case follows
    expect(line(out, 'sp ')).toBe('sp gate 11873=1');
  });
  it('shows nothing on screen unless messages are turned on', () => {
    const q = run(quiet);
    expect(q.some((l) => l.startsWith('gate 11873=1'))).toBe(true); // it is working
    expect(q.some((l) => l.startsWith('say '))).toBe(false);
  });
});

describe('CATCC pilot hook: the salute is held while PriFly holds the chocks (deck crew on)', () => {
  const out = run(deck + saluteHold);
  // 1 = the keyboard, 2 = the stick; 31 = S, 505 = stick button 5, 42 / 29 / 56 = LShift / LCtrl / LAlt
  const combos = '1:31 with 1:29+1:42+1:56 -> 11876; 2:505 -> 11876';
  const mods = ' | modifiers 1:29,1:42,1:56,2:502';
  it('touches no input layer until PriFly holds the chocks', () => {
    expect(line(out, 'before layer ')).toBe('before layer none / Unit FA-18C_hornet > UiLayer');
  });
  it('puts a layer above the aircraft\'s with every valid salute binding, each sending the mod\'s own command', () => {
    expect(line(out, 'held layer ')).toBe('held layer ' + combos + mods);
    expect(line(out, 'held stack ')).toBe('held stack CATCC hold > Unit FA-18C_hornet > UiLayer');
  });
  it('gives the layer all of the profile\'s modifiers, so "modifier + button" is not taken for the button', () => {
    expect(line(out, 'held layer ')).toContain('2:502'); // BTN2, used by none of the salute bindings
  });
  it('holds the F8 "Salute!" item through the menu flag', () => {
    expect(line(out, 'held flags ')).toBe('held flags held=true sal=true');
  });
  it('tells PriFly the pilot is ready to taxi when he salutes by key or by the F8 item', () => {
    expect(line(out, 'key salute ')).toBe('key salute SALUTE Ace|');
    expect(line(out, 'F8 salute ')).toBe('F8 salute EV taxi Ace|');
    expect(out).toContain('say CATCC: ready call sent to PriFly: salute again once you have your taxi instruction');
    expect(out.indexOf('F8 salute sent (stock)')).toBeGreaterThan(out.findIndex((l) => l.startsWith('released layer ')));
  });
  it('goes back above the aircraft\'s layer when something puts that on top, and leaves other layers alone', () => {
    expect(line(out, 'pushed down ')).toBe('pushed down Unit FA-18C_hornet > CATCC hold > UiLayer');
    expect(line(out, 'back on top ')).toBe('back on top CATCC hold > Unit FA-18C_hornet > UiLayer');
    expect(line(out, 'menu open ')).toBe('menu open CommandMenuItems > CATCC hold > Unit FA-18C_hornet > UiLayer');
  });
  it('picks up a changed binding at the next reading', () => {
    expect(line(out, 'rebound layer ')).toBe('rebound layer 1:31 with 1:29+1:42+1:56 -> 11876; 1:37 -> 11876; 2:505 -> 11876' + mods);
    expect(line(out, 'rebound stack ')).toBe('rebound stack CATCC hold > Unit FA-18C_hornet > UiLayer');
  });
  it('removes the layer the moment PriFly lets go, and the F8 item is stock again', () => {
    expect(line(out, 'released layer ')).toBe('released layer none / Unit FA-18C_hornet > UiLayer');
    expect(line(out, 'released flags ')).toBe('released flags held=false sal=false');
    expect(out).toContain('F8 salute sent (stock)');
  });
  it('asks nobody for chocks when they are already in (the deck crew\'s)', () => {
    expect(line(out, 'asked ground crew ')).toBe('asked ground crew false');
    expect(out.some((l) => l.startsWith('ground crew asked'))).toBe(false);
  });
  it('fails open: the layer goes when PriFly goes quiet', () => {
    expect(line(out, 'held again ')).toBe('held again layer');
    expect(line(out, 'quiet ')).toBe('quiet none / Unit FA-18C_hornet > UiLayer');
  });
  it('never holds the salute on a catapult', () => {
    expect(line(out, 'on the cat ')).toBe('on the cat none sal=false held=true');
  });
  it('removes the layer when the mission stops', () => {
    expect(line(out, 'before stop ')).toBe('before stop layer');
    expect(line(out, 'after stop ')).toBe('after stop none / Unit FA-18C_hornet > UiLayer');
  });
  it('leaves no layer behind when the input system refuses, tries no more, and still holds the F8 item', () => {
    const f = run(deck + saluteHoldFails);
    expect(line(f, 'failed layer ')).toBe('failed layer none / Unit FA-18C_hornet > UiLayer');
    expect(line(f, 'failed flags ')).toBe('failed flags sal=true');
    expect(line(f, 'not retried ')).toBe('not retried none');
    expect(f.some((l) => l.startsWith('say CATCC: the salute key cannot be held here'))).toBe(true);
  });
  it('holds the stock key when the aircraft\'s bindings cannot be read', () => {
    const s = run(deck + saluteHoldStockKey);
    expect(line(s, 'stock layer ')).toContain('1:31 with 1:29+1:42+1:56 -> 11876');
  });
  it('says so when the installed radio menu is an older one without the Salute! line', () => {
    const warn = 'say CATCC: the F8 "Salute!" item is not held yet: run the CATCC installer again';
    expect(out).not.toContain(warn);
    const old = run('OLD_INSTALL = true\n' + deck + saluteHoldStockKey);
    expect(old.filter((l) => l === warn)).toHaveLength(1);
  });
  it('makes no layer when nothing is bound to the salute, and reads the bindings only every 30 s', () => {
    const u = run(deck + saluteUnbound);
    // 20 s held: read at the start of the hold only
    expect(line(u, 'unbound layer ')).toBe('unbound layer none sal=true reads 1');
  });
});

describe('CATCC pilot hook: ground crew chocks while PriFly holds a jet with none in (deck crew off)', () => {
  const out = run(deck + groundCrew);
  it('asks nobody while PriFly holds nothing, and waits a moment into the hold', () => {
    expect(out).toContain('unheld asks 0');
    expect(out).toContain('asked early 0');
  });
  it('asks the Hornet\'s ground crew once, on a carrier under way too, and knows the chocks as its own', () => {
    expect(out).toContain('asked 1 chocks 1');
    expect(out).toContain('say CATCC: ground crew chocks in: PriFly holds them until your taxi instruction');
  });
  it('has them taken out again when PriFly lets go, once', () => {
    expect(out).toContain('removed 1 chocks 0');
    expect(out).toContain('removed later 1');
  });
  it('gives up after three tries when the ground crew won\'t, and then has nothing to take out', () => {
    expect(out).toContain('refused tries 3');
    expect(out).toContain('refused removes 0');
  });
  it('leaves other aircraft types alone', () => {
    expect(out).toContain('other type asks 0');
  });
  it('leaves chocks that were already in to their owner', () => {
    const c = run(deck + crewChocks);
    expect(c).toContain('requests 0 chocks 1');
  });
});

describe('CATCC pilot hook: the F10 test switch stands in for PriFly (test config only)', () => {
  it('holds on ON, lets go on OFF even if PriFly holds, and follows PriFly when the switch is out', () => {
    const out = run('TEST_CONFIG = true\n' + deck + testSwitch);
    expect(line(out, 'idle ')).toBe('idle none');
    expect(line(out, 'test on ')).toBe('test on layer held=true');
    expect(line(out, 'test off ')).toBe('test off none held=false');
    expect(line(out, 'follows PriFly ')).toBe('follows PriFly layer held=true');
  });
  it('is not there without the test config', () => {
    const out = run(deck + testSwitch);
    expect(line(out, 'test on ')).toBe('test on none held=false');
  });
});
