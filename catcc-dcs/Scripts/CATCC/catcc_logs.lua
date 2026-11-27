-- CATCC LIVE LOGS: every DCS session on a PC with CATCC installed sends its logs to SDOBot as they are written
-- (POST /api/catcc/logs), which keeps them in Supabase (public.catcc_log_chunks) for reading on the development PC
-- (scripts/catcc/catcc-logs.mjs). Loaded by Scripts/Hooks/CATCC-logs-hook.lua; installed by the crew test's installer.
--
-- OFF unless Saved Games\DCS\Config\CATCC-logs.lua is there with a token (Config/CATCC-logs.example.lua; made by
-- scripts/catcc/catcc-logs-setup.ps1):
--   return { urls = { 'http://readyroom.fly.dev/api/catcc/logs', 'http://127.0.0.1:3001/api/catcc/logs' }, token = '...' }
-- The addresses are tried in turn: the first that takes a chunk is kept until it fails. http only: DCS's Lua has no
-- TLS. The token is SDOBot's CATCC_LOG_TOKEN.
--
-- WHAT IS SENT: Logs\dcs.log from its start, and every Logs\catcc-*.log from where it stood when DCS started (those
-- are appended to from run to run), each in chunks of whole lines (48 KB at most), at most every 2 s, with the PC's
-- name (COMPUTERNAME), a session id made when DCS starts, the file's name and the chunk's byte offset in the file.
-- The user's profile folder (USERPROFILE, in either slash) is replaced by %USERPROFILE% first. At most 16 MB of each
-- file in one session. What is sent is kept in Logs\catcc-logs-sent.lua; at the next start the rest of the previous
-- session goes too (dcs.log is then dcs.log.old): a crash's last lines, or what was written after the last send.
--
-- NEVER IN DCS'S WAY: one request at a time, non-blocking (connect, send and receive a little each tick), driven by
-- DCS's GUI update (the main menu too) and onSimulationFrame. Looking up an address (blocking) is done at the start,
-- and again only outside a mission. A failure tries the next address, then waits 5, 15, 60 s; nothing is lost while
-- the file is there.
local L = {}

L.DEF = {
  every = 2,             -- s between sends when nothing is waiting
  chunk = 49152,         -- file bytes in one request at most
  connect = 5,           -- s a connection may take
  timeout = 15,          -- s a request may take
  backoff = { 5, 15, 60 }, -- s to wait after every address failed, in turn
  cap = 16 * 1024 * 1024, -- bytes of one file in one session at most
  scan = 10,             -- s between looks for new catcc-*.log files
  hold = 10,             -- s a last line without its newline waits for it
  dns = 300,             -- s between address lookups that failed
}
L.STATE = 'catcc-logs-sent.lua'

-- http://host[:port]/path -> { host, port, path, hostHeader, ip (a literal address) }
function L.parseUrl(u)
  local scheme, rest = tostring(u):match('^(%a+)://(.+)$')
  if scheme ~= 'http' then
    return nil, scheme == 'https' and (u .. ': https is not possible from DCS (its Lua has no TLS): use http://') or (tostring(u) .. ': not an http:// address')
  end
  local hostport, path = rest:match('^([^/]+)(/.*)$')
  if not hostport then hostport, path = rest, '/' end
  local host, port = hostport:match('^(.-):(%d+)$')
  if not host then host, port = hostport, 80 end
  port = tonumber(port)
  return {
    url = u, host = host, port = port, path = path,
    hostHeader = port == 80 and host or (host .. ':' .. port),
    ip = host:match('^%d+%.%d+%.%d+%.%d+$') and host or nil,
  }
end

-- a function that puts %USERPROFILE% in place of the profile folder (any case, \ or /, doubled or not)
function L.scrubber(profile)
  if type(profile) ~= 'string' or not profile:find('[\\/]') then return function(s) return s end end
  local parts = {}
  for part in profile:gmatch('[^\\/]+') do
    parts[#parts + 1] = (part:gsub('.', function(c)
      if c:match('%a') then return '[' .. c:lower() .. c:upper() .. ']' end
      if c:match('%p') then return '%' .. c end
      return c
    end))
  end
  local pat = table.concat(parts, '[\\/]+')
  return function(s) return (s:gsub(pat, '%%USERPROFILE%%')) end
end

-- what a header may carry of the PC's name
function L.pcName(s)
  s = tostring(s or ''):gsub('[^%w%._%-]', '')
  if s == '' then return 'unknown' end
  return s:sub(1, 64)
end

-- (UTC; only digits and the dash kept, whatever the os.date)
function L.sessionId(date, rnd)
  return (date('!%Y%m%d-%H%M%S'):gsub('[^%d%-]', '')) .. '-' .. string.format('%06x', rnd(0, 0xffffff))
end

-- the state file's text, and back
function L.stateText(t)
  local names = {}
  for k in pairs(t.files) do names[#names + 1] = k end
  table.sort(names)
  local out = { 'return { session = ', string.format('%q', t.session), ', started = ', string.format('%d', t.started), ', files = {' }
  for _, k in ipairs(names) do out[#out + 1] = string.format(' [%q] = %d,', k, t.files[k]) end
  out[#out + 1] = ' } }\n'
  return table.concat(out)
end
function L.readState(text)
  if type(text) ~= 'string' then return nil end
  local f = (loadstring or load)(text)
  if not f then return nil end
  local ok, t = pcall(f)
  if not ok or type(t) ~= 'table' or type(t.session) ~= 'string' or type(t.files) ~= 'table' then return nil end
  return t
end

-- the last newline's position in s, or nil
local function lastNewline(s)
  return s:match('^.*()\n')
end

-- env (DCS's, or the test's): socket, now(), size(path), mtime(path), read(path, off, n), list(dir), readText(path),
-- writeText(path, text), log(text), date, rnd, profile, pc, logs (the Logs folder, ending in /)
function L.new(env, cfg)
  local S = { env = env, cfg = {}, eps = {}, items = {}, ep = 1, fails = 0, nextAt = 0, scanAt = 0, said = {}, stored = 0 }
  for k, v in pairs(L.DEF) do S.cfg[k] = v end
  for k, v in pairs(cfg or {}) do if L.DEF[k] ~= nil then S.cfg[k] = v end end
  local urls = cfg and (cfg.urls or (cfg.url and { cfg.url })) or {}
  for _, u in ipairs(urls) do
    local ep, why = L.parseUrl(u)
    if ep then S.eps[#S.eps + 1] = ep else env.log('CATCC logs: ' .. why) end
  end
  if #S.eps == 0 then S.off = 'no http:// address in Config/CATCC-logs.lua' end
  if not (cfg and type(cfg.token) == 'string' and #cfg.token >= 16) then S.off = 'no token in Config/CATCC-logs.lua' end
  S.token = cfg and cfg.token
  S.scrub = L.scrubber(env.profile)
  S.pc = L.pcName(env.pc)
  S.session = L.sessionId(env.date, env.rnd)

  -- (each thing said once, until it changes)
  local function say(key, text)
    if S.said[key] == text then return end
    S.said[key] = text
    if text then env.log('CATCC logs: ' .. text) end
  end
  S.say = say

  local function save()
    local files = {}
    for _, it in ipairs(S.items) do
      if it.session == S.session then files[it.label] = it.off end
    end
    env.writeText(env.logs .. L.STATE, L.stateText({ session = S.session, started = S.started, files = files }))
  end
  S.save = save

  local function track(label, path, off, session, stop)
    local it = { label = label, path = path, off = off, session = session, stop = stop, sent = 0 }
    S.items[#S.items + 1] = it
    return it
  end
  local function tracked(label)
    for _, it in ipairs(S.items) do
      if it.label == label and it.session == S.session then return it end
    end
  end

  local function catccLogs()
    local t = {}
    for _, n in ipairs(env.list(env.logs) or {}) do
      if n:match('^catcc%-.+%.log$') then t[#t + 1] = n end
    end
    table.sort(t)
    return t
  end

  -- what is sent this session, and what was left of the previous one
  function S.start()
    if S.off then return say('off', 'off: ' .. S.off) end
    S.started = env.time()
    local prev = L.readState(env.readText(env.logs .. L.STATE))
    local left = {}
    if prev and prev.session ~= S.session then
      -- (the previous run's dcs.log is dcs.log.old now: if it is newer than that run's start)
      local o = prev.files['dcs.log']
      local old = env.logs .. 'dcs.log.old'
      local size = env.size(old)
      if o and size and size > o and (env.mtime(old) or 0) >= (prev.started or 0) then
        track('dcs.log', old, o, prev.session, size)
        left[#left + 1] = string.format('dcs.log %d KB', math.ceil((size - o) / 1024))
      end
    end
    track('dcs.log', env.logs .. 'dcs.log', 0, S.session)
    for _, n in ipairs(catccLogs()) do
      local path = env.logs .. n
      local size = env.size(path) or 0
      local o = prev and prev.session ~= S.session and prev.files[n]
      if o and size > o then
        track(n, path, o, prev.session, size)
        left[#left + 1] = string.format('%s %d KB', n, math.ceil((size - o) / 1024))
      end
      -- (shorter than the previous run left it: made again since, so all of it is this run's)
      track(n, path, (o and size < o) and 0 or size, S.session)
    end
    S.scanAt = env.now() + S.cfg.scan
    save()
    local names = {}
    for _, it in ipairs(S.items) do if it.session == S.session then names[#names + 1] = it.label end end
    local urls = {}
    for _, ep in ipairs(S.eps) do urls[#urls + 1] = ep.url end
    say('start', string.format('session %s on %s: sending %s to %s%s', S.session, S.pc, table.concat(names, ', '),
      table.concat(urls, ' or '), #left > 0 and ('; and what was left of session ' .. prev.session .. ': ' .. table.concat(left, ', ')) or ''))
  end

  -- the next chunk to send, or nil
  function S.nextChunk(now)
    if S.retry then return S.retry end
    if now >= S.scanAt then
      S.scanAt = now + S.cfg.scan
      for _, n in ipairs(catccLogs()) do
        if not tracked(n) then track(n, env.logs .. n, 0, S.session) end
      end
    end
    for _, it in ipairs(S.items) do
      if not it.capped then
        local size = env.size(it.path)
        if size and size < it.off and not it.stop then
          -- (made again: from its start)
          it.off = 0
        end
        local limit = size and (it.stop and math.min(it.stop, size) or size)
        if limit and limit > it.off then
          local data = env.read(it.path, it.off, math.min(S.cfg.chunk, limit - it.off))
          if data and #data > 0 then
            -- (whole lines: up to the last newline; a line longer than a chunk is cut)
            local cut = #data
            if data:sub(-1) ~= '\n' then
              local nl = lastNewline(data)
              if nl then
                cut = nl
              elseif #data < S.cfg.chunk and not it.stop then
                -- (a line still being written: it waits for its end, a little)
                it.held = it.held or now
                if now - it.held < S.cfg.hold then cut = 0 end
              end
            end
            if cut > 0 then
              it.held = nil
              if it.sent + cut > S.cfg.cap then
                return { item = it, off = it.off, raw = 0, capped = true,
                  body = string.format('[CATCC logs: %s reached %.0f MB in this session: the rest of it is not sent]\n', it.label, S.cfg.cap / 1048576) }
              end
              return { item = it, off = it.off, raw = cut, body = S.scrub(data:sub(1, cut)) }
            end
          end
        end
      end
    end
  end

  local function request(ep, c)
    return table.concat({
      'POST ' .. ep.path .. ' HTTP/1.1',
      'Host: ' .. ep.hostHeader,
      'Authorization: Bearer ' .. S.token,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Length: ' .. #c.body,
      'X-CATCC-Session: ' .. c.item.session,
      'X-CATCC-PC: ' .. S.pc,
      'X-CATCC-File: ' .. c.item.label,
      'X-CATCC-Offset: ' .. string.format('%d', c.off),
      'Connection: close',
      '', '',
    }, '\r\n') .. c.body
  end

  local function close(r)
    if r and r.tcp then pcall(function() r.tcp:close() end) end
  end

  -- a request that did not work: the next address; after all of them, a wait
  local function fail(c, now, why)
    close(S.req)
    S.req = nil
    S.retry = c
    local ep = S.eps[S.ep]
    say('fail ' .. ep.url, ep.url .. ': ' .. why)
    say('ok', nil)
    S.fails = S.fails + 1
    S.ep = S.ep % #S.eps + 1
    if S.fails % #S.eps == 0 then
      local n = math.min(math.floor(S.fails / #S.eps), #S.cfg.backoff)
      S.nextAt = now + S.cfg.backoff[n]
    else
      S.nextAt = now
    end
  end

  local function done(c, now)
    close(S.req)
    S.req = nil
    S.retry = nil
    local it = c.item
    it.off = it.off + c.raw
    it.sent = it.sent + c.raw
    if c.capped then it.capped = true end
    if it.stop and it.off >= it.stop then
      for i, x in ipairs(S.items) do if x == it then table.remove(S.items, i) break end end
    end
    S.stored = S.stored + 1
    local ep = S.eps[S.ep]
    say('fail ' .. ep.url, nil)
    say('ok', 'stored by ' .. ep.url)
    S.fails = 0
    save()
    S.nextAt = now
  end

  -- the addresses not looked up yet (blocking: only at the start and outside a mission)
  function S.resolve(now)
    for _, ep in ipairs(S.eps) do
      if not ep.ip and now >= (ep.dnsAt or 0) then
        local ip, err = env.socket.dns.toip(ep.host)
        if ip then
          ep.ip = ip
        else
          ep.dnsAt = now + S.cfg.dns
          say('dns ' .. ep.url, ep.url .. ': no address for ' .. ep.host .. ' (' .. tostring(err) .. ')')
        end
      end
    end
  end

  local function begin(c, now, mayBlock)
    local ep = S.eps[S.ep]
    if not ep.ip and mayBlock then S.resolve(now) end
    if not ep.ip then
      -- (another address that is known, or a wait: no lookup in a mission)
      for i, e in ipairs(S.eps) do
        if e.ip then S.ep, ep = i, e break end
      end
      if not ep.ip then
        S.retry, S.nextAt = c, now + S.cfg.every
        return
      end
    end
    local tcp = env.socket.tcp()
    tcp:settimeout(0)
    local ok, err = tcp:connect(ep.ip, ep.port)
    S.req = { c = c, tcp = tcp, t0 = now, data = request(ep, c), sent = 0, got = {} }
    if ok then
      S.req.phase = 'send'
    elseif err == 'timeout' or tostring(err):find('progress') then
      S.req.phase = 'connect'
    else
      return fail(c, now, 'no connection (' .. tostring(err) .. ')')
    end
  end

  local function step(now)
    local r = S.req
    local c = r.c
    if r.phase == 'connect' then
      local _, w = env.socket.select(nil, { r.tcp }, 0)
      if w and (w[r.tcp] or w[1]) and r.tcp:getpeername() then
        r.phase = 'send'
      elseif now - r.t0 > S.cfg.connect then
        return fail(c, now, 'no connection in ' .. S.cfg.connect .. ' s')
      else
        return
      end
    end
    if now - r.t0 > S.cfg.timeout then return fail(c, now, 'no answer in ' .. S.cfg.timeout .. ' s') end
    if r.phase == 'send' then
      local i, err, last = r.tcp:send(r.data, r.sent + 1)
      if i then
        r.sent = i
      elseif err == 'timeout' then
        r.sent = last or r.sent
      else
        return fail(c, now, 'sending: ' .. tostring(err))
      end
      if r.sent < #r.data then return end
      r.phase = 'recv'
    end
    local s, err, part = r.tcp:receive('*a')
    local closed = s ~= nil or err == 'closed'
    if s then r.got[#r.got + 1] = s elseif part and part ~= '' then r.got[#r.got + 1] = part end
    if not closed and err ~= 'timeout' then return fail(c, now, 'receiving: ' .. tostring(err)) end
    local text = table.concat(r.got)
    local code = tonumber(text:match('^HTTP/%d%.%d (%d%d%d)'))
    local head, body = text:match('^(.-\r\n)\r\n(.*)$')
    local len = head and tonumber(head:lower():match('content%-length:%s*(%d+)'))
    if not closed and not (len and #body >= len) then return end
    if code and code >= 200 and code < 300 then return done(c, now) end
    if code == 413 and S.cfg.chunk >= 2048 then
      -- (too big for the server: smaller chunks, at once)
      S.cfg.chunk = math.floor(S.cfg.chunk / 2)
      close(r)
      S.req, S.retry, S.nextAt = nil, nil, now
      return
    end
    local why = code and ('HTTP ' .. code) or 'no answer'
    if code == 401 then why = why .. ' (the token is not the server\'s CATCC_LOG_TOKEN)' end
    if code == 404 then why = why .. ' (that SDOBot has no /api/catcc/logs yet)' end
    if code == 503 then why = why .. ' (that SDOBot has no CATCC_LOG_TOKEN)' end
    if code == 301 or code == 302 or code == 307 or code == 308 then why = why .. ' (it sends http to https: DCS has no TLS)' end
    local msg = body and body:match('"error"%s*:%s*"([^"]*)"')
    return fail(c, now, why .. (msg and (': ' .. msg) or ''))
  end

  -- every tick: a little of the request under way, or the next one when it is time
  -- mayBlock: an address may be looked up (outside a mission)
  function S.tick(now, mayBlock)
    if S.off or not S.started then return end
    if S.req then return step(now) end
    if now < S.nextAt then return end
    local c = S.nextChunk(now)
    if not c then
      S.nextAt = now + S.cfg.every
      return
    end
    begin(c, now, mayBlock)
    if S.req then step(now) end
  end

  -- is anything still to send (or under way)?
  function S.pending(now)
    if S.off or not S.started then return false end
    return S.req ~= nil or S.nextChunk(now) ~= nil
  end

  -- send what is waiting, for budget s at most (blocking: the end of a mission when DCS gives no ticks outside one)
  function S.flush(budget, sleep)
    local t0 = env.now()
    S.nextAt = 0
    while env.now() - t0 < budget and S.pending(env.now()) do
      S.tick(env.now(), true)
      if S.req and sleep then sleep(0.01) end
      if not S.req and S.nextAt > env.now() then break end
    end
  end

  return S
end

if CATCC_LOGS_TEST then return L end

-- ---------------------------------------------------------------- in DCS (the GUI hook state)
local writedir = lfs.writedir()
local cfgFile = writedir .. 'Config/CATCC-logs.lua'
local function dcslog(s)
  if log and log.write then log.write('CATCC-LOGS', log.INFO, s) end
end
local f = loadfile(cfgFile)
if not f then return dcslog('off: no ' .. cfgFile) end
local ok, cfg = pcall(f)
if not ok or type(cfg) ~= 'table' then return dcslog('off: ' .. cfgFile .. ' does not give a table: ' .. tostring(cfg)) end

local socket = require('socket')
math.randomseed(os.time() + math.floor((os.clock() * 1e6) % 1e6))
local env = {
  socket = socket,
  now = function() return socket.gettime() end,
  time = os.time,
  date = os.date,
  rnd = math.random,
  size = function(p) return lfs.attributes(p, 'size') end,
  mtime = function(p) return lfs.attributes(p, 'modification') end,
  read = function(p, off, n)
    local h = io.open(p, 'rb')
    if not h then return nil end
    h:seek('set', off)
    local s = h:read(n)
    h:close()
    return s
  end,
  list = function(d)
    local t = {}
    local okd = pcall(function() for n in lfs.dir(d) do t[#t + 1] = n end end)
    return okd and t or {}
  end,
  readText = function(p)
    local h = io.open(p, 'rb')
    if not h then return nil end
    local s = h:read('*a')
    h:close()
    return s
  end,
  writeText = function(p, s)
    local h = io.open(p, 'wb')
    if h then h:write(s) h:close() end
  end,
  log = dcslog,
  -- (the profile folder: Saved Games is in it)
  profile = (os.getenv and os.getenv('USERPROFILE')) or writedir:match('^(.-)[\\/][Ss]aved [Gg]ames[\\/]'),
  pc = os.getenv and os.getenv('COMPUTERNAME'),
  logs = writedir .. 'Logs/',
}

local S = L.new(env, cfg)
local okStart, err = pcall(function()
  S.start()
  -- (the addresses looked up now, while DCS starts: a lookup blocks)
  if not S.off then S.resolve(env.now()) end
end)
if not okStart then return dcslog('failed to start: ' .. tostring(err)) end
CATCC_LOGS = S

local inSim = false
local menuTicks = false
local function tick()
  if not inSim and not menuTicks then
    menuTicks = true
    dcslog('ticks outside a mission too (DCS\'s GUI update)')
  end
  local okt, e = pcall(S.tick, env.now(), not inSim)
  if not okt then S.say('tick', 'tick failed: ' .. tostring(e)) end
end

-- DCS's GUI update: every frame, the main menu too (Scripts/UserHooks.lua: Gui.AddUpdateCallback(UpdateManager.update))
local okUm, UM = pcall(require, 'UpdateManager')
if okUm and type(UM) == 'table' and UM.add then
  UM.add(function() tick() end)
end

local handler = {}
-- (a mission loading: an address not found yet may be looked up once more)
function handler.onMissionLoadBegin() if not S.off then pcall(S.resolve, env.now()) end end
function handler.onSimulationStart() inSim = true end
function handler.onSimulationFrame()
  if not menuTicks then pcall(S.tick, env.now(), false) end
end
function handler.onSimulationStop()
  inSim = false
  -- (no GUI ticks seen outside a mission: what is waiting goes now, 2 s at most)
  if not menuTicks then pcall(S.flush, 2, socket.sleep) end
end
DCS.setUserCallbacks(handler)
