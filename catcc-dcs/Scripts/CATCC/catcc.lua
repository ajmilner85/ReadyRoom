-- CATCC export hook for DCS dedicated servers (GameGUI hook environment, Lua 5.1).
--
-- Listens on a TCP port (default 10310) and streams newline-delimited JSON to authenticated
-- clients (the CATCC room service). Data is gathered once per sample period from the mission
-- scripting environment by sampler.lua, via net.dostring_in.
--
-- Protocol (v1), one message per line:
--   server -> client  {"type":"hello","proto":1,"version":"...","server":"..."}
--   client -> server  AUTH <token>
--   server -> client  {"type":"auth","ok":true}  (or {"type":"error","error":"auth"} then close)
--   server -> client  {"type":"mission","state":"running"|"stopped","name":"...","theatre":"..."}
--   server -> client  {"type":"frame","seq":n,"mt":..,"abs":..,"date":"..","units":[...]}
--   server -> client  {"type":"env","start":..,"date":..,"theatre":..,"wx":{...},"routes":[...]}  every 30 s
--   client -> server  PING                       -> {"type":"pong"}
--   client -> server  CMD <json>                 -> {"type":"cmd","id":n,"ok":true} or {...,"ok":false,"error":".."}
--     Ship orders, only when Config/CATCC.lua sets commands = true (the hello says "cmds":true):
--       {"id":n,"op":"helm","g":"<ship group>","crs":<deg true>,"kt":<kt>}   steer a course at a speed
--       {"id":n,"op":"route","g":"<ship group>","pts":[{"lat":..,"lon":..,"kt":..},...]}   follow waypoints
--     DCS has no rudder or engine-order API for AI ships: both become a route (Mission task) the AI
--     steers at its own full-rudder radius. A helm order is a waypoint 60 NM ahead on the course.
--
-- Everything runs inside pcall: an error here must never affect the server.

local CATCC = { version = '0.1.0', proto = 1 }

local function logw(level, msg)
  if log and log.write then log.write('CATCC', level, msg) end
end
local function info(msg) logw(log and log.INFO or 0, msg) end
local function warn(msg) logw(log and log.WARNING or 0, msg) end

local writedir = (lfs and lfs.writedir and lfs.writedir()) or ''

-- ---------------------------------------------------------------- config
local cfg = {
  port = 10310,
  bind = '*',
  token = '',
  rate_hz = 1,
  max_clients = 16,
  max_buffer = 4 * 1024 * 1024,
  auth_timeout_s = 10,
  state = 'server', -- net.dostring_in state that reaches the mission scripting environment
  name = 'DCS',
  commands = false, -- accept ship orders (helm, route) from authenticated clients
  max_cmds_per_s = 5,
}

do
  local f = loadfile(writedir .. 'Config/CATCC.lua')
  if f then
    local ok, user = pcall(f)
    if ok and type(user) == 'table' then
      for k, v in pairs(user) do cfg[k] = v end
    else
      warn('Config/CATCC.lua did not return a table')
    end
  else
    warn('no Config/CATCC.lua; export disabled until a token is configured')
  end
end

if type(cfg.token) ~= 'string' or #cfg.token < 16 then
  warn('token missing or shorter than 16 characters; all clients will be refused')
  cfg.token = nil
end

-- ---------------------------------------------------------------- sockets
package.path = (package.path or '') .. ';.\\LuaSocket\\?.lua'
package.cpath = (package.cpath or '') .. ';.\\LuaSocket\\?.dll'
local socket = require('socket')

local server = nil
local nextBindAt = 0
local clients = {}
local seq = 0

local function now()
  if DCS and DCS.getRealTime then return DCS.getRealTime() end
  return socket.gettime()
end

local function jstr(s)
  s = tostring(s == nil and '' or s)
  return '"' .. s:gsub('[%c"\\]', function(ch)
    if ch == '"' then return '\\"' end
    if ch == '\\' then return '\\\\' end
    return string.format('\\u%04x', ch:byte())
  end) .. '"'
end

local function drop(c, why)
  if c.closed then return end
  c.closed = true
  pcall(function() c.sock:close() end)
  info('client ' .. c.peer .. ' dropped: ' .. why)
end

local function send(c, line)
  if c.closed then return end
  c.out[#c.out + 1] = line .. '\n'
  c.outBytes = c.outBytes + #line + 1
  if c.outBytes > cfg.max_buffer then drop(c, 'send buffer overflow (slow client)') end
end

local function flush(c)
  while not c.closed and #c.out > 0 do
    if #c.out > 1 then
      -- coalesce queued messages into one buffer, keeping the already-sent offset valid
      c.out = { table.concat(c.out) }
    end
    local data = c.out[1]
    local last, err, partial = c.sock:send(data, c.sent + 1)
    local idx = last or partial or c.sent
    if idx >= #data then
      c.out = {}
      c.outBytes = 0
      c.sent = 0
    else
      c.sent = idx
      if err == 'closed' then drop(c, 'closed by peer') end
      return
    end
  end
  if c.closeAfterFlush and not c.closed and #c.out == 0 then drop(c, 'closing') end
end

local function broadcast(line)
  for _, c in ipairs(clients) do
    if c.authed and not c.closed then send(c, line) end
  end
end

-- ---------------------------------------------------------------- mission state
local missionRunning = false
local samplerInstalled = false
local samplerSource = nil
local lastSampleAt = 0
local lastEnvAt = -1e9
local lastSamplerWarnAt = -1e9

local function missionMessage()
  local name = (DCS and DCS.getMissionName and DCS.getMissionName()) or ''
  return '{"type":"mission","state":"' .. (missionRunning and 'running' or 'stopped') .. '","name":' .. jstr(name) .. '}'
end

local function readSampler()
  if samplerSource then return samplerSource end
  local fh = io.open(writedir .. 'Scripts/CATCC/sampler.lua', 'r')
  if not fh then
    warn('cannot read Scripts/CATCC/sampler.lua')
    return nil
  end
  samplerSource = fh:read('*a')
  fh:close()
  return samplerSource
end

local function dostring(code)
  local res = net.dostring_in(cfg.state, code)
  return res
end

local function samplerWarn(msg)
  local t = now()
  if t - lastSamplerWarnAt > 60 then
    lastSamplerWarnAt = t
    warn(msg)
  end
end

local function installSampler()
  local src = readSampler()
  if not src then return false end
  local res = dostring(src .. '\nreturn (type(CATCC_sample) == "function") and "CATCC_OK" or "CATCC_FAIL"')
  if res ~= 'CATCC_OK' then
    samplerWarn('installing sampler in state "' .. tostring(cfg.state) .. '" failed: ' .. tostring(res) ..
      ' (check autoexec.cfg: net.allow_dostring_in must include "' .. tostring(cfg.state) .. '")')
    return false
  end
  info('sampler installed in state "' .. cfg.state .. '"')
  samplerInstalled = true
  return true
end

local function sample()
  if not samplerInstalled and not installSampler() then return end
  local res = dostring('return (type(CATCC_sample) == "function") and CATCC_sample() or "CATCC_NOFN"')
  if res == 'CATCC_NOFN' then
    samplerInstalled = false -- mission environment was reset; reinstall next period
    return
  end
  if type(res) ~= 'string' or res:sub(1, 1) ~= '{' then
    samplerWarn('sampler returned unexpected value: ' .. tostring(res):sub(1, 200))
    return
  end
  if res:sub(1, 7) == '{"err":' then samplerWarn('sampler error: ' .. res:sub(1, 300)) end
  seq = seq + 1
  broadcast('{"type":"frame","seq":' .. seq .. ',' .. res:sub(2))
end

-- Weather and ship routes change rarely: every 30 s.
local function sampleEnv()
  local res = dostring('return (type(CATCC_env) == "function") and CATCC_env() or "CATCC_NOFN"')
  if type(res) ~= 'string' or res:sub(1, 1) ~= '{' then return end
  if res:sub(1, 7) == '{"err":' then samplerWarn('env error: ' .. res:sub(1, 300)) return end
  broadcast('{"type":"env",' .. res:sub(2))
end

-- ---------------------------------------------------------------- commands
-- A small JSON decoder (objects, arrays, strings, numbers, true/false/null): the GameGUI's
-- net.json2lua isn't in every build, and this keeps the hook testable offline.
local function decodeJson(s)
  local i = 1
  local function ws() i = s:find('[^ \t\r\n]', i) or (#s + 1) end
  local val
  local function str()
    local out = {}
    i = i + 1
    while true do
      local ch = s:sub(i, i)
      if ch == '' then error('unterminated string') end
      if ch == '"' then i = i + 1 break end
      if ch == '\\' then
        local e = s:sub(i + 1, i + 1)
        local map = { ['"'] = '"', ['\\'] = '\\', ['/'] = '/', b = '\b', f = '\f', n = '\n', r = '\r', t = '\t' }
        if map[e] then out[#out + 1] = map[e]; i = i + 2
        elseif e == 'u' then
          local cp = tonumber(s:sub(i + 2, i + 5), 16) or 63
          out[#out + 1] = cp < 128 and string.char(cp) or '?'
          i = i + 6
        else error('bad escape') end
      else
        out[#out + 1] = ch
        i = i + 1
      end
    end
    return table.concat(out)
  end
  val = function(depth)
    if depth > 8 then error('too deep') end
    ws()
    local ch = s:sub(i, i)
    if ch == '{' then
      local o = {}
      i = i + 1; ws()
      if s:sub(i, i) == '}' then i = i + 1 return o end
      while true do
        ws()
        if s:sub(i, i) ~= '"' then error('expected key') end
        local k = str(); ws()
        if s:sub(i, i) ~= ':' then error('expected :') end
        i = i + 1
        o[k] = val(depth + 1); ws()
        local d = s:sub(i, i); i = i + 1
        if d == '}' then return o end
        if d ~= ',' then error('expected , or }') end
      end
    elseif ch == '[' then
      local a = {}
      i = i + 1; ws()
      if s:sub(i, i) == ']' then i = i + 1 return a end
      while true do
        a[#a + 1] = val(depth + 1); ws()
        local d = s:sub(i, i); i = i + 1
        if d == ']' then return a end
        if d ~= ',' then error('expected , or ]') end
        if #a > 64 then error('array too long') end
      end
    elseif ch == '"' then return str()
    elseif s:sub(i, i + 3) == 'true' then i = i + 4 return true
    elseif s:sub(i, i + 4) == 'false' then i = i + 5 return false
    elseif s:sub(i, i + 3) == 'null' then i = i + 4 return nil
    else
      local n = s:match('^-?%d+%.?%d*[eE]?[-+]?%d*', i)
      if not n or n == '' then error('unexpected ' .. ch) end
      i = i + #n
      return tonumber(n)
    end
  end
  local v = val(0)
  return v
end

local function finite(n, lo, hi) return type(n) == 'number' and n == n and n >= lo and n <= hi end

-- Validate an order and turn it into a call of the sampler's CATCC_cmd (mission environment).
local function cmdCode(m)
  if type(m) ~= 'table' then return nil, 'not an object' end
  if type(m.g) ~= 'string' or #m.g < 1 or #m.g > 64 then return nil, 'bad group' end
  if m.op == 'helm' then
    if not finite(m.crs, 0, 360) or not finite(m.kt, -40, 40) then return nil, 'bad course or speed' end
    return string.format('return CATCC_cmd_helm(%q, %.2f, %.2f)', m.g, m.crs, m.kt)
  elseif m.op == 'route' then
    if type(m.pts) ~= 'table' or #m.pts < 1 or #m.pts > 20 then return nil, 'route needs 1-20 points' end
    local pts = {}
    for _, p in ipairs(m.pts) do
      if type(p) ~= 'table' or not finite(p.lat, -90, 90) or not finite(p.lon, -180, 180) or not finite(p.kt, 0, 40) then
        return nil, 'bad route point'
      end
      pts[#pts + 1] = string.format('{%.7f,%.7f,%.2f}', p.lat, p.lon, p.kt)
    end
    return string.format('return CATCC_cmd_route(%q, {%s})', m.g, table.concat(pts, ','))
  end
  return nil, 'unknown op'
end

local function handleCmd(c, body)
  local ok, m = pcall(decodeJson, body)
  local id = (ok and type(m) == 'table' and finite(m.id, 0, 1e12)) and string.format('%d', m.id) or 'null'
  local function reply(err)
    send(c, '{"type":"cmd","id":' .. id .. ',"ok":' .. (err and 'false,"error":' .. jstr(err) or 'true') .. '}')
  end
  if not cfg.commands then return reply('commands are off (Config/CATCC.lua: commands = true)') end
  if not ok then return reply('bad JSON') end
  local t = now()
  if t - (c.cmdWindow or 0) >= 1 then c.cmdWindow = t; c.cmdCount = 0 end
  c.cmdCount = (c.cmdCount or 0) + 1
  if c.cmdCount > cfg.max_cmds_per_s then return reply('too many commands') end
  if not missionRunning then return reply('no mission running') end
  if not samplerInstalled and not installSampler() then return reply('sampler not installed') end
  local code, err = cmdCode(m)
  if not code then return reply(err) end
  local res = dostring(code)
  if res == 'OK' then
    info('order ' .. tostring(m.op) .. ' for ' .. m.g .. ' from ' .. c.peer)
    return reply(nil)
  end
  reply(type(res) == 'string' and res:gsub('^ERR:', ''):sub(1, 200) or 'no reply')
end

-- ---------------------------------------------------------------- client I/O
local function handleLine(c, line)
  if not c.authed then
    local tok = line:match('^AUTH%s+(%S+)%s*$')
    if cfg.token and tok == cfg.token then
      c.authed = true
      send(c, '{"type":"auth","ok":true}')
      send(c, missionMessage())
      info('client ' .. c.peer .. ' authenticated')
    else
      send(c, '{"type":"error","error":"auth"}')
      c.closeAfterFlush = true
    end
    return
  end
  if line:match('^PING') then
    send(c, '{"type":"pong"}')
  elseif line:match('^CMD ') then
    handleCmd(c, line:sub(5))
  end
end

local function readClient(c)
  for _ = 1, 32 do
    if c.closed then return end
    local line, err, partial = c.sock:receive('*l')
    if line then
      local full = c.rbuf .. line
      c.rbuf = ''
      handleLine(c, full)
    else
      if partial and partial ~= '' then c.rbuf = c.rbuf .. partial end
      if #c.rbuf > 8192 then drop(c, 'line too long') end
      if err == 'closed' then drop(c, 'closed by peer') end
      return
    end
  end
end

local function acceptClients()
  if not server then
    if now() < nextBindAt then return end
    local s, err = socket.bind(cfg.bind, cfg.port)
    if not s then
      nextBindAt = now() + 10
      samplerWarn('cannot listen on port ' .. tostring(cfg.port) .. ': ' .. tostring(err) ..
        ' (is another mod such as LotATC using it?)')
      return
    end
    s:settimeout(0)
    server = s
    info('listening on port ' .. tostring(cfg.port))
  end
  for _ = 1, 4 do
    local sock = server:accept()
    if not sock then return end
    sock:settimeout(0)
    pcall(function() sock:setoption('tcp-nodelay', true) end)
    local ip, port = sock:getpeername()
    local c = {
      sock = sock, peer = tostring(ip) .. ':' .. tostring(port), authed = false, closed = false,
      out = {}, outBytes = 0, sent = 0, rbuf = '', connectedAt = now(),
    }
    local open = 0
    for _, o in ipairs(clients) do if not o.closed then open = open + 1 end end
    clients[#clients + 1] = c
    if open >= cfg.max_clients then
      send(c, '{"type":"error","error":"too many clients"}')
      c.closeAfterFlush = true
    else
      send(c, '{"type":"hello","proto":' .. CATCC.proto .. ',"version":' .. jstr(CATCC.version) ..
        ',"server":' .. jstr(cfg.name) .. ',"cmds":' .. (cfg.commands and 'true' or 'false') .. '}')
    end
  end
end

local function tick()
  acceptClients()
  local t = now()
  local alive = {}
  for _, c in ipairs(clients) do
    if not c.closed then
      readClient(c)
      if not c.authed and not c.closeAfterFlush and t - c.connectedAt > cfg.auth_timeout_s then
        drop(c, 'auth timeout')
      end
    end
    if not c.closed then alive[#alive + 1] = c end
  end
  clients = alive

  if missionRunning and t - lastSampleAt >= 1 / cfg.rate_hz then
    lastSampleAt = t
    local anyAuthed = false
    for _, c in ipairs(clients) do if c.authed then anyAuthed = true end end
    if anyAuthed then
      sample()
      if samplerInstalled and t - lastEnvAt >= 30 then
        lastEnvAt = t
        sampleEnv()
      end
    end
  end

  for _, c in ipairs(clients) do flush(c) end
end

-- ---------------------------------------------------------------- DCS callbacks
local handler = {}

function handler.onSimulationStart()
  missionRunning = true
  lastEnvAt = -1e9
  samplerInstalled = false
  broadcast(missionMessage())
end

function handler.onSimulationStop()
  missionRunning = false
  samplerInstalled = false
  broadcast(missionMessage())
  for _, c in ipairs(clients) do pcall(flush, c) end
end

function handler.onSimulationFrame()
  local ok, err = pcall(tick)
  if not ok then samplerWarn('tick error: ' .. tostring(err)) end
end

DCS.setUserCallbacks(handler)
info('CATCC hook ' .. CATCC.version .. ' loaded (port ' .. tostring(cfg.port) .. ', ' .. tostring(cfg.rate_hz) .. ' Hz)')

return CATCC
