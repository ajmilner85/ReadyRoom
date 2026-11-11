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
CV.id_ = 16777472 -- the runtime object id the Air Boss functions take
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
    Group = { Category = { AIRPLANE = 0, HELICOPTER = 1, GROUND = 2, SHIP = 3, TRAIN = 4 },
      getByName = function(n)
        local cat = (n == 'CSG-1' and 3) or (n == 'Volt 3' and 0) or nil
        if not cat then return nil end
        local unit = cat == 3 and CV or HORNET
        return {
          isExist = function() return true end,
          getCategory = function() return cat end,
          getUnit = function() return unit end,
          getController = function() return { setTask = function(_, task) M.lastTask = task end } end,
        }
      end },
    coalition = {
      side = { NEUTRAL = 0, RED = 1, BLUE = 2 },
      getGroups = function(side, cat) return (GROUPS[side] or {})[cat] or {} end,
      getMainRefPoint = function(side) return side == 2 and { x = 1000, y = 0, z = 2000 } or nil end,
    },
    coord = { LOtoLL = LOtoLL, LLtoLO = LLtoLO },
    atmosphere = {
      getWind = function(p) local d = gridDir(250); local s = p.y < 100 and 10 or 20; return { x = d.x * s, y = 0, z = d.z * s } end,
      getTemperatureAndPressure = function() return 288.15, 101325 end,
    },
    timer = { getTime = function() return 123.5 end, getAbsTime = function() return 43200 end },
    env = { mission = {
      date = { Year = 2026, Month = 11, Day = 8 }, theatre = 'PersianGulf', start_time = 64800,
      weather = { clouds = { base = 244, thickness = 400, density = 7, preset = 'Preset14', iprecptns = 1 }, visibility = { distance = 7400 }, enable_fog = false },
      coalition = { blue = { country = { { ship = { group = {
        { name = 'CSG-1', route = { points = { { x = 0, y = 0, speed = 12.9, ETA = 0 }, { x = 20000, y = 5000, speed = 12.9, ETA = 1600 } } } },
        { name = 'Gone', route = { points = {} } },
      } } } } } },
    } },
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
    return function() return { token = 'abcdefghijklmnop-token', rate_hz = 1, name = 'Test', commands = true, max_cmds_per_s = 5 } end
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

-- 3b. ship orders
local function cmd(line)
  good.inbox[#good.inbox + 1] = line
  M.lastTask = nil
  tick(0.01)
  local t = M.lastTask
  if t then
    local pts = {}
    for _, p in ipairs(t.params.route.points) do
      local lat, lon = LOtoLL({ x = p.x, y = 0, z = p.y })
      pts[#pts + 1] = string.format('{"lat":%.5f,"lon":%.5f,"kt":%.2f}', lat, lon, p.speed / KT)
    end
    rec('task', '{"id":"' .. t.id .. '","pts":[' .. table.concat(pts, ',') .. ']}')
  else
    rec('task', 'null')
  end
end
tick(1.0) -- a fresh rate-limit window
cmd('CMD {"id":1,"op":"helm","g":"CSG-1","crs":90,"kt":20}')
cmd('CMD {"id":2,"op":"route","g":"CSG-1","pts":[{"lat":26.1,"lon":56.2,"kt":15},{"lat":26.2,"lon":56.2,"kt":12}]}')
cmd('CMD {"id":3,"op":"helm","g":"Volt 3","crs":90,"kt":20}')
cmd('CMD {"id":4,"op":"helm","g":"CSG-1","crs":400,"kt":20}')
cmd('CMD {"id":5,"op":"helm","g":"CSG-1","crs":0,"kt":-5}')
cmd('CMD {"id":6,"op":"helm","g":"CSG-1","crs":0,"kt":5}')
drain(good, 'cmd')

-- 3c. Air Boss ship control: refused without the API, then driven through it once the sim provides it
tick(1.0)
cmd('CMD {"id":7,"op":"bridge","g":"CSG-1","crs":120,"bell":2}')
local abCalls = {}
orderShipDir = function(id, d) abCalls[#abCalls + 1] = string.format('{"f":"dir","id":%d,"v":%g}', id, d) end
orderShipSpeed = function(id, b) abCalls[#abCalls + 1] = string.format('{"f":"speed","id":%d,"v":%g}', id, b) end
automaticShipSpeedDir = function(id) abCalls[#abCalls + 1] = string.format('{"f":"auto","id":%d}', id) end
getShipSpeedDir = function(id) if id == 16777472 then return 12.5, 70 end return nil end
cmd('CMD {"id":8,"op":"bridge","g":"CSG-1","crs":120,"bell":2}')
cmd('CMD {"id":9,"op":"bridge","g":"CSG-1","bell":12}')
cmd('CMD {"id":10,"op":"route","g":"CSG-1","pts":[{"lat":26.1,"lon":56.2,"kt":15}]}')
drain(good, 'ab')

for _, c in ipairs(abCalls) do rec('abcall', c) end
orderShipDir, orderShipSpeed, automaticShipSpeedDir, getShipSpeedDir = nil, nil, nil, nil

-- 3d. launch holds: a pilot's mod connects without a token and hears only the hold list; the room's
-- list reaches it at once; a salute goes back to the room; holds lapse when the room stops refreshing
local pilot = newClientSock('10.0.0.9')
pending[#pending + 1] = pilot
tick()
pilot.inbox[#pilot.inbox + 1] = 'PILOT'
tick()
tick(1.0)
cmd('CMD {"id":11,"op":"launch","hold":["Volt 3-1 | 401 Ace"]}')
pilot.inbox[#pilot.inbox + 1] = 'SALUTE Volt 3-1 | 401 Ace'
tick(0.01)
cmd('CMD {"id":12,"op":"launch","hold":[42]}')
drain(pilot, 'pilot')
drain(good, 'launch')
tick(16) -- no refresh from the room: the hold lapses
tick(0.01)
drain(pilot, 'lapse')
rec('pilotOpen', tostring(not pilot.closed))
drain(good, 'afterLaunch')

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
