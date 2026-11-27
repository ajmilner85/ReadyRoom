-- CATCC live logs (Scripts/CATCC/catcc_logs.lua) under fengari: a made-up Logs folder, clock and network (socket.tcp
-- and select with connections that connect a tick later, take 1000 bytes a send and answer in two parts). Each
-- scenario adds lines "label<TAB>text" to OUT; logs.test.ts reads them. LOGS_SRC: the module's source.
CATCC_LOGS_TEST = true
local L = assert(load(LOGS_SRC, 'catcc_logs.lua'))()
local OUT = {}
local function out(label, s) OUT[#OUT + 1] = label .. '\t' .. tostring(s) end

local function world(opts)
  opts = opts or {}
  local W = { T = 100, FS = {}, LOG = {}, reqs = {}, dns = 0, behave = opts.behave or {} }
  function W.file(name, data, mtime) W.FS['L/' .. name] = { data = data, mtime = mtime or 1000 } end
  function W.add(name, data) local f = W.FS['L/' .. name]; f.data = f.data .. data end
  local function respond(t)
    -- the request as the server saw it
    local text = t.buf
    local head, body = text:match('^(.-)\r\n\r\n(.*)$')
    if not head then return nil end
    local len = tonumber(head:match('Content%-Length: (%d+)'))
    if #body < len then return nil end
    local lines = {}
    for l in head:gmatch('[^\r\n]+') do lines[#lines + 1] = l end
    local r = { line = lines[1], h = {}, body = body, ip = t.ip, port = t.port }
    for i = 2, #lines do
      local k, v = lines[i]:match('^([^:]+): (.*)$')
      r.h[k] = v
    end
    W.reqs[#W.reqs + 1] = r
    local b = W.behave[t.ip .. ':' .. t.port]
    local code = type(b) == 'function' and b(r) or b or 200
    local msg = code == 200 and '{"ok":true}' or '{"error":"nope"}'
    return 'HTTP/1.1 ' .. code .. ' X\r\nContent-Type: application/json\r\nContent-Length: ' .. #msg .. '\r\nConnection: close\r\n\r\n' .. msg
  end
  local socket = {
    dns = {
      toip = function(host)
        W.dns = W.dns + 1
        if host == 'nowhere.invalid' then return nil, 'host not found' end
        return '10.0.0.' .. #host
      end,
    },
    tcp = function()
      local t = { buf = '', got = nil, sentTo = 0 }
      function t:settimeout() end
      function t:connect(ip, port)
        self.ip, self.port = ip, port
        local b = W.behave[ip .. ':' .. port]
        if b == 'refuse' then return nil, 'connection refused' end
        if b == 'hang' then self.hang = true end
        return nil, 'timeout'
      end
      function t:getpeername() if self.up then return self.ip, self.port end end
      function t:send(data, i)
        local j = math.min(#data, i + 999)
        self.buf = self.buf .. data:sub(i, j)
        if j < #data then return nil, 'timeout', j end
        return j
      end
      function t:receive()
        if not self.got then
          self.got = respond(self)
          if not self.got then return nil, 'timeout', '' end
          local half = math.floor(#self.got / 2)
          local a = self.got:sub(1, half)
          self.got = self.got:sub(half + 1)
          return nil, 'timeout', a
        end
        local s = self.got
        self.got = ''
        return s
      end
      function t:close() self.closed = true end
      return t
    end,
    select = function(_, w)
      local res = {}
      for i, s in ipairs(w) do
        if not s.hang then
          if s.ready then s.up = true res[i] = s res[s] = true else s.ready = true end
        end
      end
      return {}, res
    end,
  }
  W.env = {
    socket = socket,
    now = function() return W.T end,
    time = function() return 1000 + math.floor(W.T) end,
    date = function() return '20261126-120000' end,
    rnd = function() return 0xabcdef end,
    size = function(p) return W.FS[p] and #W.FS[p].data end,
    mtime = function(p) return W.FS[p] and W.FS[p].mtime end,
    read = function(p, off, n) local f = W.FS[p]; return f and f.data:sub(off + 1, off + n) end,
    list = function(d)
      local t = {}
      for p in pairs(W.FS) do if p:sub(1, #d) == d then t[#t + 1] = p:sub(#d + 1) end end
      table.sort(t)
      return t
    end,
    readText = function(p) return W.FS[p] and W.FS[p].data end,
    writeText = function(p, s) W.FS[p] = { data = s, mtime = 1000 + math.floor(W.T) } end,
    log = function(s) W.LOG[#W.LOG + 1] = s end,
    profile = 'C:\\Users\\Pilot',
    pc = 'TEST PC!',
    logs = 'L/',
  }
  function W.ship(cfg)
    W.S = L.new(W.env, cfg)
    W.S.start()
    return W.S
  end
  function W.run(secs, mayBlock)
    local stop = W.T + secs
    while W.T < stop do
      W.S.tick(W.T, mayBlock ~= false)
      W.T = W.T + 0.1
    end
  end
  function W.say(label)
    for _, r in ipairs(W.reqs) do
      out(label, string.format('%s:%d %s %s %s %s %q', r.ip, r.port, r.h['X-CATCC-Session'], r.h['X-CATCC-File'], r.h['X-CATCC-Offset'], r.h['X-CATCC-PC'], r.body))
    end
    for _, l in ipairs(W.LOG) do out(label .. ' log', l) end
  end
  return W
end

local TOKEN = '0123456789abcdef0123456789abcdef'
local FLY = 'http://fly.example/api/catcc/logs'
local HOME = 'http://127.0.0.1:3001/api/catcc/logs'

-- 1. what is sent: whole lines, the profile folder replaced, a held last line, the headers
do
  local W = world()
  W.file('dcs.log', 'one\nloading C:\\Users\\pilot\\Saved Games\\DCS\\x.lua and C:/USERS/PILOT/Saved Games/DCS\npart')
  W.file('catcc-crewtest.log', 'old\n')
  W.file('other.log', 'not ours\n')
  W.ship({ urls = { FLY }, token = TOKEN })
  W.add('catcc-crewtest.log', 'new line\n')
  W.run(3)
  W.add('dcs.log', 'ial\n')
  W.run(3)
  local r = W.reqs[1]
  out('basic head', r.line .. ' | ' .. r.h.Host .. ' | ' .. r.h.Authorization .. ' | ' .. r.h['Content-Type'] .. ' | ' .. r.h['Content-Length'] .. '=' .. #r.body .. ' | ' .. r.h.Connection)
  W.say('basic')
  out('basic state', W.FS['L/catcc-logs-sent.lua'].data)
  out('basic dns', W.dns)
end

-- 2. a line without its end waits 10 s for it, then goes as it is
do
  local W = world()
  W.file('dcs.log', 'no end yet')
  W.ship({ urls = { FLY }, token = TOKEN })
  W.run(9)
  out('held', #W.reqs)
  W.run(2)
  W.say('held')
end

-- 3. the first address fails (no route there yet): the second is used, and kept
do
  local W = world({ behave = { ['10.0.0.11:80'] = 404 } })
  W.file('dcs.log', 'a\n')
  W.ship({ urls = { FLY, HOME }, token = TOKEN })
  W.run(1)
  W.add('dcs.log', 'b\n')
  W.run(3)
  W.say('fallback')
end

-- 4. every address fails: waits of 5 s, then 15 s; the same chunk again when one answers
do
  local W = world({ behave = { ['10.0.0.11:80'] = 'refuse', ['127.0.0.1:3001'] = 503 } })
  W.file('dcs.log', 'x\n')
  W.ship({ urls = { FLY, HOME }, token = TOKEN })
  W.run(4.5)
  out('backoff 4.5 s', #W.reqs)
  W.run(1)
  out('backoff 5.5 s', #W.reqs)
  W.add('dcs.log', 'y\n')
  W.run(14)
  out('backoff 19.5 s', #W.reqs)
  W.behave['127.0.0.1:3001'] = 200
  W.run(2)
  W.say('backoff')
end

-- 5. no connection in 5 s: the next address
do
  local W = world({ behave = { ['10.0.0.11:80'] = 'hang' } })
  W.file('dcs.log', 'z\n')
  W.ship({ urls = { FLY, HOME }, token = TOKEN })
  W.run(6)
  W.say('hang')
end

-- 6. what the previous run left: dcs.log is dcs.log.old now; catcc-*.log goes on from where it stopped
do
  local W = world()
  W.file('catcc-logs-sent.lua', L.stateText({ session = '20261125-200000-000001', started = 900, files = { ['dcs.log'] = 4, ['catcc-crewtest.log'] = 4 } }))
  W.file('dcs.log.old', 'old\nlast words\n', 950)
  W.file('dcs.log', 'new\n')
  W.file('catcc-crewtest.log', 'was\nunsent\n')
  W.ship({ urls = { FLY }, token = TOKEN })
  W.add('catcc-crewtest.log', 'this run\n')
  W.run(6)
  W.say('left')
end

-- 7. a dcs.log.old older than the previous run's start is not that run's: left alone
do
  local W = world()
  W.file('catcc-logs-sent.lua', L.stateText({ session = '20261125-200000-000001', started = 900, files = { ['dcs.log'] = 0 } }))
  W.file('dcs.log.old', 'stale\n', 800)
  W.file('dcs.log', 'new\n')
  W.ship({ urls = { FLY }, token = TOKEN })
  W.run(3)
  W.say('stale')
end

-- 8. too big for the server (413): halves until it fits; nothing lost
do
  local W = world({ behave = { ['10.0.0.11:80'] = function(r) return #r.body > 3000 and 413 or 200 end } })
  W.file('dcs.log', string.rep(string.rep('x', 99) .. '\n', 90))
  W.ship({ urls = { FLY }, token = TOKEN, chunk = 8192 })
  W.run(8)
  local got, ok = {}, 0
  for _, r in ipairs(W.reqs) do if #r.body <= 3000 then got[#got + 1] = r.h['X-CATCC-Offset'] .. '+' .. #r.body; ok = ok + #r.body end end
  out('413', table.concat(got, ' ') .. ' = ' .. ok .. ' of 9000; chunk now ' .. W.S.cfg.chunk .. '; ' .. #W.reqs .. ' requests')
end

-- 9. 16 MB a file a session (here 25 bytes): a note, then nothing more of it
do
  local W = world()
  W.file('dcs.log', 'aaaaaaaaa\nbbbbbbbbb\n')
  W.ship({ urls = { FLY }, token = TOKEN, cap = 25 })
  W.run(1)
  W.add('dcs.log', 'ccccccccc\n')
  W.run(4)
  W.add('dcs.log', 'ddddddddd\n')
  W.run(4)
  W.say('cap')
end

-- 10. a catcc-*.log made during the session goes from its start; one made again goes from its start again
do
  local W = world()
  W.file('dcs.log', '')
  W.file('catcc-crewtest.log', 'old old old\n')
  W.ship({ urls = { FLY }, token = TOKEN })
  W.file('catcc-new.log', 'first\n')
  W.run(11)
  W.file('catcc-crewtest.log', 'again\n')
  W.run(3)
  W.say('new')
end

-- 11. off: no token, an https address; addresses looked up only when that may block
do
  local W = world()
  W.file('dcs.log', 'a\n')
  W.ship({ urls = { 'https://fly.example/x' }, token = TOKEN })
  W.run(3)
  W.ship({ urls = { FLY } })
  W.run(3)
  W.say('off')
  local W2 = world()
  W2.file('dcs.log', 'a\n')
  W2.ship({ urls = { FLY }, token = TOKEN })
  W2.run(3, false)
  out('in mission', #W2.reqs .. ' requests, ' .. W2.dns .. ' lookups')
  W2.run(3, true)
  out('outside', #W2.reqs .. ' requests, ' .. W2.dns .. ' lookups')
  local W3 = world()
  W3.file('dcs.log', 'a\n')
  W3.ship({ urls = { 'http://nowhere.invalid/x', HOME }, token = TOKEN })
  W3.run(3)
  W3.say('no address')
end

-- 12. flush (the end of a mission when DCS gives no ticks outside one): everything waiting, blocking
do
  local W = world()
  W.file('dcs.log', 'one\n')
  W.file('catcc-a.log', '')
  W.ship({ urls = { FLY }, token = TOKEN })
  W.add('catcc-a.log', 'two\n')
  W.S.flush(2, function(dt) W.T = W.T + dt end)
  out('flush', #W.reqs .. ' requests in ' .. string.format('%.2f', W.T - 100) .. ' s; pending ' .. tostring(W.S.pending(W.T)))
end

-- 14. in DCS: the boot (its settings from Config, DCS's GUI update and callbacks), with DCS's globals made up
local function boot(cfg)
  local W = world()
  W.FS['W/Logs/dcs.log'] = { data = 'boot line\n', mtime = 1000 }
  local B = { W = W, updaters = {}, written = {} }
  CATCC_LOGS_TEST = nil
  CATCC_LOGS = nil
  lfs = {
    writedir = function() return 'W/' end,
    attributes = function(p, k) local f = W.FS[p]; if not f then return nil end return k == 'size' and #f.data or f.mtime end,
    dir = function(d)
      local names = W.env.list(d)
      local i = 0
      return function() i = i + 1 return names[i] end
    end,
  }
  log = { INFO = 1, ERROR = 2, write = function(_, _, s) B.written[#B.written + 1] = s end }
  DCS = { setUserCallbacks = function(h) B.handler = h end }
  loadfile = function(p)
    if p == 'W/Config/CATCC-logs.lua' and cfg then return function() return cfg end end
  end
  io.open = function(p, mode)
    if mode:find('w') then
      local h = { buf = '' }
      function h:write(s) self.buf = self.buf .. s end
      function h:close() W.FS[p] = { data = self.buf, mtime = 1000 } end
      return h
    end
    local f = W.FS[p]
    if not f then return nil end
    local h = { pos = 0 }
    function h:seek(_, off) self.pos = off return off end
    function h:read(n)
      local s = n == '*a' and f.data:sub(self.pos + 1) or f.data:sub(self.pos + 1, self.pos + n)
      self.pos = self.pos + #s
      return s
    end
    function h:close() end
    return h
  end
  os.getenv = function(k) return ({ USERPROFILE = 'C:\\Users\\Pilot', COMPUTERNAME = 'BOOTPC' })[k] end
  W.env.socket.gettime = function() return W.T end
  W.env.socket.sleep = function(dt) W.T = W.T + dt end
  package.loaded.socket, package.loaded.UpdateManager = nil, nil
  package.preload.socket = function() return W.env.socket end
  package.preload.UpdateManager = function() return { add = function(f) B.updaters[#B.updaters + 1] = f end } end
  assert(load(LOGS_SRC, 'catcc_logs.lua'))()
  function B.gui(secs)
    local stop = W.T + secs
    while W.T < stop do
      for _, f in ipairs(B.updaters) do f() end
      W.T = W.T + 0.1
    end
  end
  return B
end
do
  local B = boot({ urls = { HOME }, token = TOKEN })
  B.gui(2)
  B.handler.onMissionLoadBegin()
  B.handler.onSimulationStart()
  B.W.FS['W/Logs/dcs.log'].data = B.W.FS['W/Logs/dcs.log'].data .. 'in the mission\n'
  local n = #B.W.reqs
  for _ = 1, 30 do B.handler.onSimulationFrame(); B.W.T = B.W.T + 0.1 end
  out('boot frames alone', #B.W.reqs - n)
  B.gui(3)
  B.handler.onSimulationStop()
  B.W.say('boot')
  for _, s in ipairs(B.written) do out('boot dcs.log', s) end
  out('boot global', tostring(CATCC_LOGS ~= nil) .. ' ' .. #B.updaters .. ' updater(s) ' .. tostring(B.handler ~= nil))
  local B2 = boot(nil)
  for _, s in ipairs(B2.written) do out('boot off', s) end
  out('boot off global', tostring(CATCC_LOGS ~= nil) .. ' ' .. #B2.updaters .. ' updater(s) ' .. tostring(B2.handler ~= nil))
end

-- 13. helpers
out('url', table.concat({ L.parseUrl('http://a.b:3001/x/y').hostHeader, L.parseUrl('http://a.b/').hostHeader, tostring(L.parseUrl('http://1.2.3.4:9/p').ip), select(2, L.parseUrl('https://a.b/')) }, ' | '))
out('pc', L.pcName('DESK TOP-1_a.b/c') .. ' ' .. L.pcName(nil))
out('scrub', L.scrubber('C:\\Users\\A.B (x)')('at C:\\\\users\\\\a.b (X)\\f and c:/USERS/a.b (x)/g; C:\\Users\\AxB (x)'))

return table.concat(OUT, '\n')
