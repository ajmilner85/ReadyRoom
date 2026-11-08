-- Offline harness for the CATCC hook (runs under fengari / Lua 5.3 from hook.test.ts).
-- HOOK_SRC and SAMPLER_SRC are injected as globals. Returns a JSON-ish transcript: each
-- line "<label>\t<payload>" so the JS side can assert on it.

math.atan2 = math.atan2 or math.atan
local transcript = {}
local function rec(label, payload) transcript[#transcript + 1] = label .. '\t' .. payload end

-- ------------------------------------------------------------ fake clock and logs
local realTime = 100
log = { INFO = 1, WARNING = 2, ERROR = 3, write = function(_, lvl, msg) rec('log' .. lvl, msg) end }
lfs = { writedir = function() return 'W/' end }

-- ------------------------------------------------------------ fake LuaSocket
local pending = {}
local function newClientSock(peer)
  local s = { inbox = {}, sent = '', closed = false, peer = peer }
  function s:settimeout() end
  function s:setoption() end
  function s:getpeername() return peer, 5000 end
  function s:close() self.closed = true end
  function s:receive()
    if self.closed then return nil, 'closed', '' end
    local l = table.remove(self.inbox, 1)
    if l then return l end
    return nil, 'timeout', ''
  end
  function s:send(data, i)
    if self.closed then return nil, 'closed', (i or 1) - 1 end
    self.sent = self.sent .. data:sub(i or 1)
    return #data
  end
  return s
end
package.preload.socket = function()
  return {
    gettime = function() return realTime end,
    bind = function()
      return { settimeout = function() end, accept = function() return table.remove(pending, 1) end }
    end,
  }
end

-- ------------------------------------------------------------ fake mission environment
local THETA = math.rad(3) -- grid north points 3 deg east of true north
local KT = 1852 / 3600
local M = {}
local function LOtoLL(p)
  local n = p.x * math.cos(THETA) - p.z * math.sin(THETA)
  local e = p.x * math.sin(THETA) + p.z * math.cos(THETA)
  return 26 + n / 111000, 56 + e / (111000 * math.cos(math.rad(26))), p.y
end
local function LLtoLO(lat, lon)
  local n = (lat - 26) * 111000
  local e = (lon - 56) * 111000 * math.cos(math.rad(26))
  return { x = n * math.cos(THETA) + e * math.sin(THETA), y = 0, z = -n * math.sin(THETA) + e * math.cos(THETA) }
end
-- grid-frame unit vector for a TRUE bearing
local function gridDir(trueDeg)
  local g = math.rad(trueDeg) - THETA
  return { x = math.cos(g), y = 0, z = math.sin(g) }
end

local function mkUnit(o)
  local u = {}
  function u:isExist() return true end
  function u:isActive() return true end
  function u:getID() return o.id end
  function u:getName() return o.name end
  function u:getTypeName() return o.type end
  function u:getCallsign() return o.callsign end
  function u:getPlayerName() return o.player end
  function u:getPoint() return o.p end
  function u:getPosition() return { x = gridDir(o.hdg), p = o.p } end
  function u:getVelocity()
    local d = gridDir(o.crs)
    return { x = d.x * o.gsKt * KT, y = o.vsMs or 0, z = d.z * o.gsKt * KT }
  end
  function u:getFuel() return o.fuel end
  function u:inAir() return o.air end
  return u
end
local function mkGroup(name, units)
  return { isExist = function() return true end, getName = function() return name end, getUnits = function() return units end }
end

local CV = mkUnit({ id = 1001, name = 'CSG-1-1', type = 'CVN_72', callsign = 'CSG11', p = { x = 0, y = 20, z = 0 }, hdg = 70, crs = 70, gsKt = 25 })
local HORNET = mkUnit({ id = 2001, name = 'Volt 3-1', type = 'FA-18C_hornet', callsign = 'Volt31', player = 'Volt 3-1 | 401 "Ace"',
  p = { x = 20000, y = 6000, z = -5000 }, hdg = 345, crs = 343.5, gsKt = 420, vsMs = -15, fuel = 0.62, air = true })
local HELO = mkUnit({ id = 3001, name = 'Angel', type = 'SH-60B', callsign = 'Angel1', p = { x = 1000, y = 100, z = 500 }, hdg = 90, crs = 90, gsKt = 0, fuel = 0.8, air = true })

local GROUPS = {
  [2] = { [0] = { mkGroup('Volt 3', { HORNET }) }, [1] = { mkGroup('Angel', { HELO }) }, [3] = { mkGroup('CSG-1', { CV }) } },
}

local function newMissionEnv()
  local E = {
    math = math, string = string, table = table, pcall = pcall, ipairs = ipairs, pairs = pairs,
    tostring = tostring, tonumber = tonumber, type = type,
    Group = { Category = { AIRPLANE = 0, HELICOPTER = 1, GROUND = 2, SHIP = 3, TRAIN = 4 } },
    coalition = { getGroups = function(side, cat) return (GROUPS[side] or {})[cat] or {} end },
    coord = { LOtoLL = LOtoLL, LLtoLO = LLtoLO },
    atmosphere = {
      getWind = function(p) local d = gridDir(250); local s = p.y < 100 and 10 or 20; return { x = d.x * s, y = 0, z = d.z * s } end,
      getTemperatureAndPressure = function() return 288.15, 101325 end,
    },
    timer = { getTime = function() return 123.5 end, getAbsTime = function() return 43200 end },
    env = { mission = { date = { Year = 2026, Month = 11, Day = 8 }, theatre = 'PersianGulf' } },
  }
  E._G = E
  return E
end
M.env = newMissionEnv()

net = {
  dostring_in = function(state, code)
    if state ~= 'server' then return '' end
    local f, err = load(code, 'dostring', 't', M.env)
    if not f then return 'compile error: ' .. tostring(err) end
    local ok, res = pcall(f)
    if not ok then return tostring(res) end
    return tostring(res)
  end,
}

-- ------------------------------------------------------------ DCS + loaders
local callbacks
DCS = {
  setUserCallbacks = function(h) callbacks = h end,
  getRealTime = function() return realTime end,
  getMissionName = function() return 'Cruise Wk6' end,
}
local realLoadfile = loadfile
loadfile = function(path)
  if path == 'W/Config/CATCC.lua' then
    return function() return { token = 'abcdefghijklmnop-token', rate_hz = 1, name = 'Test' } end
  end
  return realLoadfile(path)
end
io = io or {}
io.open = function(path)
  if path == 'W/Scripts/CATCC/sampler.lua' then
    return { read = function() return SAMPLER_SRC end, close = function() end }
  end
  return nil
end

assert(load(HOOK_SRC, 'catcc.lua'))()

local function tick(dt)
  realTime = realTime + (dt or 0.02)
  callbacks.onSimulationFrame()
end
local function drain(s, label)
  for line in s.sent:gmatch('([^\n]*)\n') do rec(label, line) end
  s.sent = ''
end

-- 1. bad token is refused and closed
local bad = newClientSock('10.0.0.1')
pending[#pending + 1] = bad
tick()
bad.inbox[#bad.inbox + 1] = 'AUTH wrong-token-wrong-token'
tick()
drain(bad, 'bad')
rec('badClosed', tostring(bad.closed))

-- 2. good client authenticates before the mission runs: no frames yet
local good = newClientSock('10.0.0.2')
pending[#pending + 1] = good
tick()
good.inbox[#good.inbox + 1] = 'AUTH abcdefghijklmnop-token'
tick(); tick(1.5)
drain(good, 'pre')

-- 3. mission starts: frames at ~1 Hz
callbacks.onSimulationStart()
tick(1.1)
tick(0.2) -- too soon for another frame
tick(1.0)
drain(good, 'run')

-- 4. mission env reset (sampler lost) is recovered automatically
M.env = newMissionEnv()
tick(1.1) -- detects missing sampler
tick(1.1) -- reinstalls and samples
drain(good, 'reset')

-- 5. silent unauthenticated client times out
local idle = newClientSock('10.0.0.3')
pending[#pending + 1] = idle
tick(); tick(11)
rec('idleClosed', tostring(idle.closed))

callbacks.onSimulationStop()
tick()
drain(good, 'stop')

return table.concat(transcript, '\n')
