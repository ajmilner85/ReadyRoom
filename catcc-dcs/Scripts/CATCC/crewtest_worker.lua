-- CATCC crew test: THE DECK SPOTTING DEMO'S OWN THREAD (catcc-handoff/WORKER-THREAD-PLAN.md).
--
-- This file runs in a Lua state of its own, on a thread the native module makes (catcc_crew.dll: worker_start). It
-- loads the hook (crewtest_hook.lua) and, through it, the demo (crewtest_demo.lua) a second time, WHOLE, with stand-ins
-- for everything of DCS's, as the test rig does outside DCS. The hook on DCS's main thread no longer runs the demo:
-- every frame it sends this state what the demo reads from DCS and applies the DCS calls this state asks for
-- (crewtest_hook.lua: Tow.Thr). NOTHING OF DCS'S IS CALLED FROM HERE: this state has no native module, no DCS, no
-- Export, no net: only CATCC_W (recv, send, clock, pending, arg), which the native module gives it.
--
-- A call the hook or the demo makes to DCS is one of three kinds (WORKER.kind, below):
--   a COMMAND  its result is not waited for: it goes into this step's list, which the main thread applies in order on
--              its next frame (an object's position, a model argument, a line for the log). What DCS answered the
--              FIRST one for an object (its class, whether it took the place) is sent back, and the later ones give
--              that same answer at once (while the demo makes its objects the first one is waited for). If one
--              fails, the main thread says so and the calls after it give the failure.
--   a READ     something DCS is asked every frame (the mission's clock, an elevator's argument, the ship's commands):
--              asked for once, and from then on the main thread sends its value with every frame in which it changed;
--              the call gives the last value sent. One that has not been asked for in 3 s is let go. WHAT IS ASKED
--              MUST NOT CHANGE FROM FRAME TO FRAME (a place, a time in the question): each new question is waited
--              for. Where the ship and the jet are is one value the main thread works out (h.deckctx).
--   a CALL     everything else (rare: making the static aircraft, a scan, an elevator's command): sent, and this
--              thread waits for the answer: a frame of DCS's at the most, which costs DCS nothing.
--
-- Messages are Lua table constructors as text (read with loadstring), both ways:
--   from the main thread: {k='f', n, mt, rt, ap, seq, r = {[key] = values}}   a frame: its number, the mission's clock,
--                           real time, active pause, the last list of commands applied, the reads that changed
--                         {k='r', id, v = values | err = text}                 the answer to a call
--                         {k='x', key, err}                                    a command that failed
--                         {k='a', key, v = values}                             what the first command for an object gave
--                         {k='run', c, id}                                     a command of the hook's (demo2|start ...)
--                         {k='sim', on}                                        the mission began / ended
--   to the main thread:   {k='c', seq, done, on, ran, {f=, n=, ...}, ...}      a list of commands (done: the frame
--                           it answers; on: the demo runs; ran: the hook command that is done)
--                         {k='q', id, f, key, a = values}                      a call (key: asked for as a read)
--                         'B' and bytes                                        places and model arguments, packed (see BLOB)
--                         {k='u', keys}                                        reads that are let go
--                         {k='e', err}                                         an error of this thread's own
local W = CATCC_W
local A = assert(loadstring('return ' .. W.arg))()
local unpack, select, type, tostring, pairs, fmt, concat = unpack, select, type, tostring, pairs, string.format, table.concat
local floor, huge = math.floor, math.huge

-- the switches the main state has set (the rig's CATCC_DEMO_...; none in DCS)
for k, v in pairs(A.globals or {}) do _G[k] = v end

local WORKER = { boot = true, on = false }
CATCC_WORKER = WORKER

-- ---------------------------------------------------------------- a value as text
-- (num: a whole number in full; anything else to 17 digits: a handle is a pointer; pose: 10 digits, for the numbers
-- of a position)
-- (COMMA: a C locale that writes 1,5: put right, or the other side could not read the number)
local COMMA = fmt('%.1f', 0.5):find(',', 1, true) ~= nil
local function num(v, pose)
  if v ~= v then return '(0/0)' end
  if v == huge then return 'math.huge' elseif v == -huge then return '-math.huge' end
  if v == floor(v) and v > -1e15 and v < 1e15 then return fmt('%.0f', v) end
  local s = fmt(pose and '%.10g' or '%.17g', v)
  if COMMA then s = s:gsub(',', '.') end
  return s
end
local function ser(v, pose)
  local t = type(v)
  if t == 'number' then return num(v, pose) end
  if t == 'string' then return fmt('%q', v) end
  if t == 'boolean' then return v and 'true' or 'false' end
  if t == 'table' then
    local out, n = {}, 0
    for k, x in pairs(v) do
      n = n + 1
      out[n] = '[' .. ser(k) .. ']=' .. ser(x, pose)
    end
    return '{' .. concat(out, ',') .. '}'
  end
  return 'nil'
end
local function serArgs(pose, ...)
  local n = select('#', ...)
  local out = { 'n=' .. n }
  for i = 1, n do out[i + 1] = ser((select(i, ...)), pose) end
  return concat(out, ',')
end
local function decode(s)
  local f, e = loadstring('return ' .. s)
  if not f then error('a message could not be read: ' .. tostring(e) .. ': ' .. s:sub(1, 200), 0) end
  return f()
end
local function copy(v)
  if type(v) ~= 'table' then return v end
  local o = {}
  for k, x in pairs(v) do o[k] = copy(x) end
  return o
end

-- ---------------------------------------------------------------- to the main thread
local F = { n = 0, mt = 0, rt = 0, ap = false, seq = 0 }   -- the frame this step is for
local pend                                               -- a frame that came while a step ran (the newest)
local inbox = {}                                         -- other messages that came while a call was waited for
local batch, nb, seq = {}, 0, 0
local cache, usedAt, over, first = {}, {}, {}, {}
local argNow, argCls, argRead = {}, {}, {}                            -- model arguments as last written here (objarg)
local steps = 0
local QUIT = {}

-- THE PACKED LIST (the native module's CATCC_W.bcmd / bflush; A.blob: the main thread's module can take it): places
-- and model arguments, which are nearly all of what a step sends, go to the main thread as numbers in a block the
-- module itself reads and applies, not as text for Lua (0.4 ms of every frame of DCS's in the user's run of
-- 2026-11-20, 07:54). A block and a text list are messages one after the other: whichever is being filled is sent
-- before a command of the other kind is added, so everything stays in its order. A step ends with a block (empty
-- if need be) that carries what the text list's `done` carried. CATCC_DEMO_NO_BLOB: text only, as before.
local BLOB = A.blob and W.bcmd and W.bflush and not CATCC_DEMO_NO_BLOB
local OP = { ['n.staticpos'] = 1, ['n.place'] = 2, ['n.objarg'] = 3, ['n.shiparg'] = 4 }
local nbin = 0
local function flushBlob(done, ms, calls, idle, idleMs)
  seq = seq + 1
  W.bflush(seq, steps, F.mt, done or -1, (CATCC_DEMO and CATCC_DEMO.on == true) and 1 or 0, ms or 0, calls or 0, idle or 0, idleMs or 0)
  nbin = 0
end
local function flush(extra)
  if nbin > 0 then flushBlob() end
  if nb == 0 and not extra then return end
  seq = seq + 1
  W.send('{k="c",seq=' .. seq .. ',st=' .. steps .. ',mt=' .. num(F.mt) .. (extra or '') .. ',' .. concat(batch, ',', 1, nb) .. '}')
  nb = 0
end
local function absorb(m)
  if m.k == 'f' then
    for k, v in pairs(m.r or {}) do cache[k] = v end
    pend = m
  elseif m.k == 'x' then
    -- a command failed on the main thread: the calls after it for the same object give the failure
    first[m.key] = { n = 2, nil, m.err }
  elseif m.k == 'a' then
    -- what DCS answered the first command for an object (see `command`)
    if first[m.key] then first[m.key] = m.v end
  else
    inbox[#inbox + 1] = m
  end
end
local callId = 0
local function call(f, key, ...)
  flush()
  callId = callId + 1
  local id = callId
  W.send('{k="q",id=' .. id .. ',f=' .. fmt('%q', f) .. (key and (',key=' .. fmt('%q', key)) or '') .. ',a={' .. serArgs(false, ...) .. '}}')
  WORKER.calls = (WORKER.calls or 0) + 1
  while true do
    local s, why = W.recv(1000)
    if why == 'quit' then error(QUIT, 0) end
    if s then
      local m = decode(s)
      if m.k == 'r' and m.id == id then
        if m.err then error(m.err, 0) end
        return m.v
      end
      absorb(m)
    end
  end
end

-- a command: answered at once with what the first one for its object gave.
-- THE FIRST ONE for an object: while the main thread waits for this thread (a command of the demo's being run: it
-- makes its aircraft and tractors then: WORKER.burst) it is asked and waited for, so what DCS answered is known. In a
-- step it is NOT waited for (a wait is a frame of DCS's in which every place this thread works out stands still: a tow
-- that begins writes five model arguments for the first time): it is taken to have worked, the main thread sends what
-- DCS answered when it has made the call (k = 'a'), and the calls after that give that answer, a failure too.
local UNKNOWN = 'not known yet: the main thread makes the call on its next frame'
local function command(f, key, ...)
  local got = first[key]
  if not got then
    if WORKER.burst then
      got = call(f, nil, ...)
      -- (kept only if it worked: one that failed is asked again, as the caller would see it fail again)
      if got[1] then first[key] = got end
      return unpack(got, 1, got.n)
    end
    got = { n = 2, true, UNKNOWN }
    first[key] = got
    if nbin > 0 then flushBlob() end
    nb = nb + 1
    batch[nb] = '{f=' .. fmt('%q', f) .. ',key=' .. fmt('%q', key) .. ',first=true,' .. serArgs(true, ...) .. '}'
    return true, UNKNOWN
  end
  if got[1] then
    local op = BLOB and OP[f]
    if op then
      if nb > 0 then flush() end
      W.bcmd(op, ...)
      nbin = nbin + 1
    else
      if nbin > 0 then flushBlob() end
      nb = nb + 1
      batch[nb] = '{f=' .. fmt('%q', f) .. ',key=' .. fmt('%q', key) .. ',' .. serArgs(true, ...) .. '}'
    end
  end
  return unpack(got, 1, got.n)
end
-- a command whose answer nobody looks at (a line for the log)
local function tell(f, ...)
  if nbin > 0 then flushBlob() end
  nb = nb + 1
  batch[nb] = '{f=' .. fmt('%q', f) .. ',' .. serArgs(false, ...) .. '}'
end
-- a read
-- (asked: by function, how many different questions were asked for the first time, and when: a function that is
-- asked something else every frame (a question with a place or a time in it) is waited for every frame, which is
-- what a read is there to avoid: said in the log, once a minute for each function)
local asked = {}
local CHURN = tonumber(CATCC_DEMO_CHURN) or 150 -- (the rig sets it lower: its frames are a quarter second)
local function read(f, ...)
  local key = f .. '(' .. serArgs(false, ...) .. ')'
  local o = over[key]
  if o then
    if F.seq >= o.seq then over[key] = nil else return o.v end
  end
  local c = cache[key]
  if c == nil then
    local a = asked[f]
    if not a then
      a = { t0 = F.rt, n = 0, said = -1e9, loose = -1e9 }
      asked[f] = a
    end
    if F.rt - a.t0 > 20 then a.t0, a.n = F.rt, 0 end
    a.n = a.n + 1
    if a.n >= CHURN then
      -- (150 different questions in 20 s: for a minute its answers are NOT KEPT: each is still waited for, but the
      -- main thread is not left asking DCS every one of them again every frame)
      a.loose, a.t0, a.n = F.rt + 60, F.rt, 0
      if F.rt - a.said > 60 then
        a.said = F.rt
        tell('h.log', fmt('demo thread: %s was asked %d different things in 20 s, each waited for (the last: %s): what it is asked changes all the time; for a minute its answers are not kept', f, CHURN, key:sub(1, 160)))
      end
    end
    if F.rt < a.loose then
      c = call(f, nil, ...)
    else
      c = call(f, key, ...)
      cache[key] = c
      usedAt[key] = F.rt
    end
  else
    usedAt[key] = F.rt
  end
  if c.err then error(c.err, 0) end
  if c.n == 1 then
    local v = c[1]
    return type(v) == 'table' and copy(v) or v
  end
  local out = {}
  for i = 1, c.n do out[i] = copy(c[i]) end
  return unpack(out, 1, c.n)
end
local function sync(f, ...)
  local v = call(f, nil, ...)
  return unpack(v, 1, v.n)
end

-- ---------------------------------------------------------------- the stand-ins
-- the native module: only what the real one has (A.natives), each call by its kind
local nativeFns = {}
do
  local function key2(f, a, b) return f .. ':' .. tostring(a) .. ':' .. tostring(b) end
  local make = {
    staticpos = function(id, ...)
      if select('#', ...) == 0 then return sync('n.staticpos', id) end
      return command('n.staticpos', 'n.staticpos:' .. tostring(id), id, ...)
    end,
    place = function(h, ...) return command('n.place', 'n.place:' .. tostring(h), h, ...) end,
    -- (where a driver's head is to go (crewtest_head.lua): said when it changes, not waited for; the main thread's
    -- module turns it there)
    head = function(h, ...) return command('n.head', 'n.head:' .. tostring(h), h, ...) end,
    forcepos = function(id, ...) return command('n.forcepos', 'n.forcepos:' .. tostring(id), id, ...) end,
    -- a model argument of an object of ours: nobody else writes it, so what it is now is what was last written here
    -- (asked of DCS once, if it is read before it was ever written): the tow reads the nose wheel's steering back
    -- every step
    objarg = function(h, id, n, v)
      local key = key2('n.objarg', id, n)
      if v == nil then
        -- (argRead: what DCS said the first time it was read here: false: it cannot be read (nil and why): then it
        -- cannot be read later either, whatever was written since: the user's first run on the thread: two tows
        -- that wrote the same nose wheel for a moment were told "something else writes it too", which the main
        -- thread, where that read gives nothing, never says)
        local can = argRead[key]
        if can == false then return nil, argCls[key] end
        local known = argNow[key]
        if can and known ~= nil then return known, argCls[key] end
        local r, cls = sync('n.objarg', h, id, n)
        if r == nil then
          argRead[key], argCls[key] = false, cls
          return nil, cls
        end
        argRead[key], argCls[key] = true, cls
        if known == nil then argNow[key] = r end
        return argNow[key], cls
      end
      local r, cls = command('n.objarg', key, h, id, n, v)
      if r ~= nil then
        argNow[key], argCls[key] = v, cls
        return v, cls
      end
      return r, cls
    end,
    shiparg = function(h, n, v)
      if v == nil then return read('n.shiparg', h, n) end
      local r, e = command('n.shiparg', key2('n.shiparg', h, n), h, n, v)
      if r == nil then return r, e end
      -- (read back before the main thread has written it: the value written)
      over['n.shiparg(' .. serArgs(false, h, n) .. ')'] = { v = v, seq = seq + 1 }
      return v
    end,
    -- (a command for a bubble or an elevator that is KEPT: DCS puts its own back, the hook gives ours again four
    -- times a second for as long as the demo runs (tickShipCmds: the fourth argument): not waited for. The user's
    -- first run on the thread: some 2,500 waits for these.)
    bubble = function(h, idx, cmd, quiet)
      if cmd == nil or not quiet then return sync('n.bubble', h, idx, cmd, quiet) end
      return command('n.bubble', 'n.bubble:' .. tostring(idx), h, idx, cmd, quiet)
    end,
    elevator = function(h, idx, cmd, quiet)
      if cmd == nil or not quiet then return sync('n.elevator', h, idx, cmd, quiet) end
      return command('n.elevator', 'n.elevator:' .. tostring(idx), h, idx, cmd, quiet)
    end,
    catorder = function(h, i, what, on, quiet)
      if not quiet then return sync('n.catorder', h, i, what, on, quiet) end
      return command('n.catorder', 'n.catorder:' .. tostring(i) .. ':' .. tostring(what) .. ':' .. tostring(on), h, i, what, on, quiet)
    end,
    state = function(...) return read('n.state', ...) end,
    anim = function(...) return read('n.anim', ...) end,
    orderpeek = function(...) return read('n.orderpeek', ...) end,
    shipcmds = function(...) return read('n.shipcmds', ...) end,
    deck = function(...) return read('n.deck', ...) end,
    setlog = function() end,
  }
  for _, name in ipairs(A.natives or {}) do
    if name:sub(1, 7) ~= 'worker_' then
      local f = 'n.' .. name
      nativeFns[name] = make[name] or function(...) return sync(f, ...) end
    end
  end
end

DCS = setmetatable({
  getModelTime = function() return F.mt end,
  getRealTime = function() return F.rt end,
  setUserCallbacks = function(h) WORKER.handler = h end,
}, { __index = function(t, name)
  if not A.dcs[name] then return nil end
  local f = 'D.' .. name
  local fn = function(...) return sync(f, ...) end
  rawset(t, name, fn)
  return fn
end })
Export = setmetatable({
  LoSimulationOnActivePause = function() return F.ap end,
  LoGetCameraPosition = A.export.LoGetCameraPosition and function() return read('E.LoGetCameraPosition') end or nil,
  LoGetPlayerPlaneId = A.export.LoGetPlayerPlaneId and function() return read('E.LoGetPlayerPlaneId') end or nil,
}, { __index = function(t, name)
  if not A.export[name] then return nil end
  local f = 'E.' .. name
  local fn = function(...) return sync(f, ...) end
  rawset(t, name, fn)
  return fn
end })
net = {
  -- the mission's scripting state: what is asked every frame (where the ship and the jet are) is a read; what gives
  -- an answer is a call; the rest (a message on the screen) a command
  dostring_in = function(state, code)
    if type(code) == 'string' then
      if code:find('^return %(CATCC_CR and CATCC_CR%.ctx%)') or code == 'return type(CATCC_CR)' then return read('N.dostring_in', state, code) end
      if not code:find('^%s*return') then
        tell('N.dostring_in', state, code)
        return ''
      end
    end
    return sync('N.dostring_in', state, code)
  end,
}
lfs = { writedir = function() return A.writedir end }
log = nil
-- (LuaSocket's clock, which the hook and the demo time themselves with: the performance counter)
do
  local realRequire = require
  require = function(name)
    -- (not in the rig, where each frame waits for this thread's step: nothing there goes by a clock, as on its main
    -- thread, so that a run is the same run every time)
    if name == 'socket' and not A.lockstep then return { gettime = W.clock } end
    error("module '" .. tostring(name) .. "' not found: there is none on the demo's thread", 0)
  end
  WORKER.require = realRequire
end
package.loadlib = function() return function() return nativeFns end end
-- the files: the scripts from where the main state says they are (A.files: by the end of the path); the hook's panel
-- is not loaded here
do
  local realLoadfile = loadfile
  loadfile = function(p)
    p = tostring(p)
    for tail, how in pairs(A.files or {}) do
      if p:sub(-#tail) == tail then
        if how == false then return nil, 'not on the demo\'s thread' end
        if type(how) == 'table' then return loadstring(how.src, tail) end
        return realLoadfile(how)
      end
    end
    return realLoadfile(p)
  end
end

-- what the hook calls instead of its own log, message and command line when it runs here (crewtest_hook.lua)
function WORKER.log(s) if not WORKER.boot then tell('h.log', s) end end
function WORKER.info(s) if not WORKER.boot then tell('h.info', s) end end
function WORKER.say(text, secs, clear) tell('h.say', text, secs, clear) end
-- (the deck as the slot picker shows it: the demo's M.deckMap, to the main thread's crewtest_slots.lua)
function WORKER.deckmap(text) tell('h.deckmap', text) end
-- (an object's model arguments all at once, read on the main thread: crewtest_hook.lua Tow.objargs; one call)
function WORKER.objargs(h, id, max) return sync('h.objargs', h, id, max) end
WORKER.clock = W.clock
WORKER.read = read
WORKER.lockstep = A.lockstep

-- ---------------------------------------------------------------- the hook, and the demo with it
do
  local f, e = loadfile(A.writedir .. 'Scripts/CATCC/crewtest_hook.lua')
  if not f then error('the hook could not be loaded on the demo\'s thread: ' .. tostring(e), 0) end
  f()
  if not (WORKER.handler and WORKER.run) then error('the hook did not start on the demo\'s thread (Config/CATCC-test.lua: crewTest?)', 0) end
  if not CATCC_DEMO then error('the demo was not loaded on its thread', 0) end
end
WORKER.boot = false
-- (the demo's planning by the clock: its share of a step; see SHARE, below)
if not A.lockstep and CATCC_DEMO.SLICE and not CATCC_DEMO.SLICE.calls then CATCC_DEMO.SLICE.ms = tonumber(A.stepMs) or 2 end

-- ---------------------------------------------------------------- the loop
local function guarded(what, f, a)
  -- (Lua 5.1's xpcall passes no arguments on)
  local ok, e = xpcall(function() return f(a) end, function(err)
    if err == QUIT then return err end
    return debug.traceback(tostring(err), 2)
  end)
  if not ok then
    if e == QUIT then error(QUIT, 0) end
    W.send('{k="e",err=' .. fmt('%q', what .. ': ' .. tostring(e)) .. '}')
  end
  return ok
end
local simOn = false
-- PLANNING GOES ON BETWEEN THE FRAMES (not in the rig's lockstep). In a step the demo's planning has a small share
-- (SHARE.step ms: the step's positions are not kept waiting for it); when a step has left planning unfinished and no
-- frame waits, the demo's tick is run again for the same moment of the mission, SHARE.idle ms of planning at a time:
-- nothing moves in it (the tows are driven by the hook's own tick, the give-way pass goes by the mission's clock), the
-- planners take up where they stopped. So planning has what is left of a processor core, and a frame's positions are
-- never more than one such piece late.
local SHARE = { step = tonumber(A.stepMs) or 2, idle = tonumber(A.idleMs) or 8, n = 0, ms = 0 }
local want = false
local function idle()
  local D = CATCC_DEMO
  if not (D.on and D.tick and D.SLICE) then
    want = false
    return
  end
  local c0 = W.clock()
  local before = D.slices or 0
  D.SLICE.ms = SHARE.idle
  D.tick(F.rt)
  D.SLICE.ms = SHARE.step
  want = (D.slices or 0) > before
  SHARE.n, SHARE.ms = SHARE.n + 1, SHARE.ms + (W.clock() - c0) * 1000
end
local function handle(m)
  -- (the clocks come with it: this thread may have had no frame yet)
  if m.mt then F.mt, F.rt, F.ap = m.mt, m.rt or F.rt, m.ap == true end
  if m.k == 'sim' then
    simOn = m.on
    if m.on then guarded('mission start', WORKER.handler.onSimulationStart) else guarded('mission stop', WORKER.handler.onSimulationStop) end
    flush(',on=' .. tostring(CATCC_DEMO.on == true) .. ',ran=' .. num(m.id or 0))
  elseif m.k == 'run' then
    -- (the demo makes or takes away its objects: what was known of the old ones, by their numbers, is let go)
    first, argNow, argCls, argRead = {}, {}, {}, {}
    WORKER.burst = true
    guarded('command ' .. tostring(m.c), WORKER.run, m.c)
    WORKER.burst = nil
    if not CATCC_DEMO.on then first, argNow, argCls, argRead = {}, {}, {}, {} end
    if CATCC_DEMO.on and CATCC_DEMO.SLICE and not A.lockstep and not CATCC_DEMO.SLICE.calls and not WORKER.saidShare then
      WORKER.saidShare = true
      CATCC_DEMO.SLICE.ms = SHARE.step
      tell('h.log', fmt('demo: on its own thread: its planning has %d ms of each step and goes on between the frames, %d ms at a time', SHARE.step, SHARE.idle))
    end
    flush(',on=' .. tostring(CATCC_DEMO.on == true) .. ',ran=' .. num(m.id or 0))
  elseif m.k == 'set' then
    for k, v in pairs(m.g or {}) do _G[k] = v end
  end
end
local function step()
  local m = pend
  pend = nil
  F.n, F.mt, F.rt, F.ap, F.seq = m.n, m.mt, m.rt, m.ap, m.seq
  steps = steps + 1
  local c0 = W.clock()
  local before = CATCC_DEMO.slices or 0
  if simOn then guarded('frame', WORKER.handler.onSimulationFrame) end
  want = not A.lockstep and (CATCC_DEMO.slices or 0) > before
  -- READS NOBODY HAS ASKED FOR IN 3 s ARE LET GO (the main thread asks DCS each of them every frame for as long as it
  -- is kept: 600 steps were too long: the user's first run on the thread had 650 to 830 kept that were asked once
  -- each). Looked at every 20 steps; and never more than 400 in all: the longest unused go first.
  if steps % 20 == 0 then
    local gone, kept = {}, 0
    for key, at in pairs(usedAt) do
      if F.rt - at > 3 then
        gone[#gone + 1] = fmt('%q', key)
        usedAt[key], cache[key] = nil, nil
      else
        kept = kept + 1
      end
    end
    if kept > 400 then
      local list = {}
      for key, at in pairs(usedAt) do list[#list + 1] = { key, at } end
      table.sort(list, function(a, b) return a[2] < b[2] end)
      for i = 1, kept - 400 do
        gone[#gone + 1] = fmt('%q', list[i][1])
        usedAt[list[i][1]], cache[list[i][1]] = nil, nil
      end
    end
    if #gone > 0 then W.send('{k="u",keys={' .. concat(gone, ',') .. '}}') end
  end
  if BLOB then
    if nb > 0 then flush() end
    flushBlob(m.n, (W.clock() - c0) * 1000, WORKER.calls or 0, SHARE.n, SHARE.ms)
  else
    flush(',done=' .. num(m.n) .. ',on=' .. tostring(CATCC_DEMO.on == true) .. ',ms=' .. fmt('%.3f', (W.clock() - c0) * 1000) .. ',calls=' .. num(WORKER.calls or 0)
      .. ',idle=' .. SHARE.n .. ',idleMs=' .. fmt('%.3f', SHARE.ms))
  end
  WORKER.calls, SHARE.n, SHARE.ms = 0, 0, 0
end

local ok, err = pcall(function()
  W.send('{k="ready"}')
  while true do
    -- everything that waits is taken first (of several frames the newest counts); then one step
    local s, why
    if #inbox > 0 then
      handle(table.remove(inbox, 1))
    else
      s, why = W.recv((pend or want) and 0 or 100)
      if why == 'quit' then return end
      if s then
        local m = decode(s)
        if m.k == 'quit' then return end
        if m.k == 'f' or m.k == 'x' or m.k == 'a' then absorb(m) else handle(m) end
      elseif pend then
        step()
      elseif want and simOn then
        -- (nothing waits: what the demo has to work out goes on between the frames)
        if not guarded('planning between the frames', idle) then want = false end
        flush()
      end
    end
  end
end)
if not ok and err ~= QUIT then W.send('{k="e",err=' .. fmt('%q', 'the loop: ' .. tostring(err)) .. '}') end
