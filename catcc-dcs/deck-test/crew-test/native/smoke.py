"""Smoke test of the built catcc_crew.dll under DCS's own lua.dll, outside DCS:

    python catcc-dcs/deck-test/crew-test/native/smoke.py [DCS dir]

The module is loaded the way the hook loads it (package.loadlib) and every function is called. DCS's
character DLLs are not loaded in this process, so every DCS function is "missing": the point is that the
Lua side of the module (tables built, values returned, errors given back as nil + message) works and
nothing crashes when DCS isn't what the module expects. The logic itself is covered by the self-test
(catcc_crew_selftest.cpp), which build.cmd runs."""
import ctypes
import os
import sys
import tempfile

dcs = sys.argv[1] if len(sys.argv) > 1 else r'C:\Program Files\Eagle Dynamics\DCS World'
bin_mt = os.path.join(dcs, 'bin-mt')
here = os.path.dirname(os.path.abspath(__file__))
dll = os.path.join(here, '..', 'bin', 'catcc_crew.dll')
log = os.path.join(tempfile.gettempdir(), 'catcc-crewtest-smoke.log')
if os.path.exists(log):
    os.remove(log)

os.add_dll_directory(bin_mt)
lua = ctypes.CDLL(os.path.join(bin_mt, 'lua.dll'))
lua.luaL_newstate.restype = ctypes.c_void_p
lua.luaL_openlibs.argtypes = [ctypes.c_void_p]
lua.luaL_loadstring.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
lua.lua_pcall.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int]
lua.lua_tolstring.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p]
lua.lua_tolstring.restype = ctypes.c_char_p
lua.lua_pushstring.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
lua.lua_setfield.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_char_p]
lua.lua_gettop.argtypes = [ctypes.c_void_p]

L = lua.luaL_newstate()
lua.luaL_openlibs(L)
# the worker thread's script for this test: answers every message; 'error': an error caught in a step; 'busy': 0.4 s
# of work; started with the argument 'die': an error that ends the script
worker = os.path.join(tempfile.gettempdir(), 'catcc-crewtest-smoke-worker.lua')
with open(worker, 'w', encoding='utf-8', newline='\n') as f:
    f.write('''local W = CATCC_W
if W.arg == 'die' then error('died as asked') end
while true do
  local s, why = W.recv(200)
  if why == 'quit' then return end
  if s == 'error' then
    local ok, e = pcall(error, 'boom')
    W.send('caught: ' .. tostring(e))
  elseif s == 'busy' then
    local t = W.clock()
    while W.clock() - t < 0.4 do end
    W.send('re:busy')
  elseif s == 'blob1' or s == 'blob2' then
    -- a packed list: a static's place (it has moved 3 m forward in blob2, a second of the mission later), a model
    -- argument of an object, one of the ship, a man's place; then the nine numbers
    local x = s == 'blob2' and 13 or 10
    W.bcmd(1, 16777472, 1, 0, 0, 0, 1, 0, 0, 0, 1, x, 20, 30)
    W.bcmd(3, 12345, 16777472, 2, 0.5)
    W.bcmd(4, 12345, 53, 0.25)
    W.bcmd(2, 1, 10, 9, 5, 1, 0)
    W.bflush(s == 'blob2' and 8 or 7, s == 'blob2' and 4 or 3, s == 'blob2' and 101.5 or 100.5, 42, 1, 1.25, 2, 3, 4.5)
  elseif s then
    W.send('re:' .. s)
  end
end
''')
for name, value in (('DLL', dll), ('LOGPATH', log), ('WORKER_SCRIPT', worker)):
    lua.lua_pushstring(L, value.encode())
    lua.lua_setfield(L, -10002, name.encode())  # LUA_GLOBALSINDEX

code = r'''
local out = {}
local function p(s) out[#out + 1] = s end
local loader, err = package.loadlib(DLL, 'luaopen_catcc_crew')
assert(loader, err)
local m = loader()
assert(type(m) == 'table' and catcc_crew == m, 'luaopen returns the module table')
local names = {}
for k in pairs(m) do names[#names + 1] = k end
table.sort(names)
p('functions: ' .. table.concat(names, ' '))
local inf = m.info()
p(string.format('info: version %s, %d DCS functions missing, thread %s, cookie offset %d', inf.version, #inf.missing, type(inf.thread), inf.cookieOff))
p('first missing: ' .. tostring(inf.missing[1]))
m.setlog(LOGPATH)
local r = m.scan()
p(string.format('scan: envs %d, envObjects %d, envErr %d, regCount %d, regErr %d, people %d, classes %d, strOk %d, strBad %d, noRtti %d',
  r.envs, r.envObjects, r.envErr, r.regCount, r.regErr, #r.people, #r.classes, r.strOk, r.strBad, r.noRtti))
local g = m.registry(0x40)
p(string.format('registry: n %d, err %d, characters %d, people %d, classes %d', g.n, g.err, g.characters, #g.people, #g.classes))
local h = m.heapscan(10)
p(string.format('heapscan: err %d, faults %d, people %d, memory scanned %s, hits a number %s, classes a table %s', h.err, h.faults, #h.people,
  tostring(h.bytes > 1e6), tostring(type(h.hits) == 'number'), tostring(type(h.classes) == 'table')))
-- every command with a handle nobody has: nil + a message, no crash
local function bad(name, ...)
  local a, b = m[name](...)
  p(string.format('%s: %s, %s', name, tostring(a), tostring(b)))
end
bad('anims', 12345)
bad('play', 12345, 'idle')
bad('override', 12345, 'Idle')
bad('attach', 12345, 'RightStick', true)
bad('walk', 12345, 1, 2, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0)
bad('stop', 12345)
bad('state', 12345, true)
bad('dump', 12345, 0, 16)
bad('play', 12345, 'sign_taxifwdloop_0', 2)
bad('anim', 12345)
bad('animinfo', 12345)
bad('prop', 12345, 'angle', 10)
bad('prop', 12345, 'angle')
bad('head', 12345, 30)
p('head forgotten: ' .. tostring(m.head(12345)) .. '; headtick: ' .. table.concat({ m.headtick() }, ' '))
bad('catcrews', 12345)
bad('catorder', 12345, 0, 'free', true)
bad('envflags', 12345, 1, 1)
bad('catorder', 12345, 0, 'free', true, true)
bad('orderpeek', 12345, 0)
bad('debugset')
bad('debugset', 3, 1)
bad('bubble', 12345, 0, 2)
bad('elevator', 12345, 0, 2)
bad('deck', 12345)
bad('teleport', 12345, 16777472, 1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 20, 30)
bad('shipcmds', 12345)
bad('shiparg', 12345, 53, 0.5)
bad('forcepos', 16777472, 1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 20, 30)
bad('staticpos', 16777472, 1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 20, 30, 4, 1, 1)
bad('staticinfo', 16777472)
bad('place', 1, 10, 9, 5, 1, 0)
bad('objarg', 12345, 16777472, 2, 0.5)
bad('catorder', 12345, 0, 'dropjet')
p('time: ' .. tostring(m.time()))
-- many scans in a row: the stack stays level and nothing accumulates
for i = 1, 200 do m.scan() end
p('200 scans: ok')
-- THE WORKER THREAD: a Lua state of its own on a thread of the module's, messages both ways (the deck spotting demo's
-- thread: Scripts/CATCC/crewtest_worker.lua)
do
  local got = {}
  local function take()
    local t = m.worker_poll()
    for _, s in ipairs(t or {}) do got[#got + 1] = s end
    return #got
  end
  local function wait(n, ms)
    for _ = 1, ms / 5 do
      if take() >= n then return true end
      m.worker_wait(5)
    end
    return take() >= n
  end
  p('worker: before any: ' .. (m.worker_state()) .. ', post ' .. tostring(m.worker_post('x')) .. ', poll ' .. tostring(m.worker_poll()))
  local times = 0
  for i = 1, 20 do
    assert(m.worker_start(WORKER_SCRIPT, 'echo'))
    m.worker_post('a' .. i)
    got = {}
    assert(wait(1, 3000) and got[1] == 're:a' .. i, 'no answer')
    assert(m.worker_stop(3000), 'it did not stop')
    times = times + 1
  end
  p('worker: started, answered and stopped ' .. times .. ' times')
  assert(m.worker_start(WORKER_SCRIPT, 'echo'))
  local r2, why2 = m.worker_start(WORKER_SCRIPT, 'echo')
  p('worker: a second one while the first runs: ' .. tostring(r2) .. ', ' .. tostring(why2))
  for i = 1, 10000 do m.worker_post(tostring(i)) end
  got = {}
  assert(wait(10000, 30000), 'not all came back')
  local inOrder = #got == 10000
  for i = 1, 10000 do if got[i] ~= 're:' .. i then inOrder = false end end
  p('worker: 10000 messages each way, in their order: ' .. tostring(inOrder))
  m.worker_post('error')
  m.worker_post('after')
  got = {}
  assert(wait(2, 3000))
  p('worker: an error in a step: ' .. tostring(got[1]):gsub('^.-:%d+: ', '') .. '; and it still answers: ' .. tostring(got[2]))
  -- THE PACKED LIST: the worker's places and model arguments as bytes, applied by the module itself
  do
    m.worker_post('blob1')
    got = {}
    assert(wait(1, 3000))
    local b1 = got[1]
    p('blob: a message of ' .. #b1 .. ' bytes beginning ' .. b1:sub(1, 1) .. '; its nine numbers: ' .. table.concat({ m.worker_blobinfo(b1) }, ' '))
    -- outside DCS the module reaches nothing: every command fails, with its reason, and nothing crashes
    local fails, seq, st, t, done, on, ms, calls, idle, idleMs, count = m.worker_blob(b1)
    p(string.format('blob: applied by the module: %d commands, %d failed (%s | %s | %s | %s); seq %d step %d time %.1f frame %d on %d', count, #fails,
      fails[1][5], fails[2][5], fails[3][5], fails[4][5], seq, st, t, done, on))
    p('blob: the failed ones: ' .. table.concat({ fails[1][1], fails[1][2], fails[2][1], fails[2][3], fails[2][4], fails[3][1], fails[3][3], fails[4][1], fails[4][2] }, ' '))
    -- with stand-ins (the rig's way): each command reaches its function with its numbers, in its order
    local calls2 = {}
    local sink = {}
    for _, name in ipairs({ 'staticpos', 'place', 'objarg', 'shiparg' }) do
      sink[name] = function(...) calls2[#calls2 + 1] = name .. '(' .. table.concat({ ... }, ',') .. ')' return true end
    end
    m.worker_moves()
    local f2, _, _, _, _, _, _, _, _, _, n2 = m.worker_blob(b1, sink)
    p('blob: through stand-ins: ' .. n2 .. ' commands, ' .. #f2 .. ' failed: ' .. table.concat(calls2, ' '))
    -- what moves is followed: the same static 3 m on a second later; then a list is late: moved on by half a second's worth
    m.worker_post('blob2')
    got = {}
    assert(wait(1, 3000))
    m.worker_blob(got[1], sink)
    calls2 = {}
    local moved = m.worker_carry(102.0, 102.5, sink)
    p('blob: a list is late: ' .. moved .. ' object(s) moved on: ' .. table.concat(calls2, ' '))
    calls2 = {}
    p('blob: asked again for the same moment: ' .. m.worker_carry(102.0, 102.5, sink) .. ' moved; followed: ' .. m.worker_moves() .. ', then ' .. m.worker_moves())
    p('blob: not a packed list: ' .. tostring(m.worker_blob('xyz')) .. ' / ' .. tostring(select(2, m.worker_blob('xyz'))))
  end
  m.worker_post('busy')
  m.worker_wait(50)
  local ended = m.worker_stop(30)
  p('worker: told to stop while it is busy: ended in 30 ms ' .. tostring(ended))
  local over = false
  for _ = 1, 600 do
    if (m.worker_state()) == 'ended' then over = true break end
    take() -- (what it still sent is taken: worker_wait does not wait while a message is there)
    m.worker_wait(5)
  end
  p('worker: and when its step is over: ' .. (m.worker_state()) .. ' ' .. tostring(over and m.worker_stop(1000)))
  assert(m.worker_start(WORKER_SCRIPT, 'die'))
  got = {}
  assert(wait(2, 3000))
  p('worker: an error that ends its script: ' .. tostring(got[1]):sub(1, 1) .. ' ' .. tostring(got[1]):gsub('^.-:%d+: ', '') .. ', then ' .. tostring(got[2]))
  p('worker: stopped after it: ' .. tostring(m.worker_stop(2000)))
end
return table.concat(out, '\n')
'''
if lua.luaL_loadstring(L, code.encode()) != 0:
    print('LOAD ERROR:', lua.lua_tolstring(L, -1, None).decode())
    sys.exit(1)
if lua.lua_pcall(L, 0, 1, 0) != 0:
    print('ERROR:', lua.lua_tolstring(L, -1, None).decode())
    sys.exit(1)
text = lua.lua_tolstring(L, -1, None).decode()
print(text)
print('stack top after the run:', lua.lua_gettop(L))
print('--- module log')
print(open(log).read() if os.path.exists(log) else '(no log)')

expect = [
    'functions: anim animinfo anims attach bubble catcrews catorder debugset deck dump elevator envflags forcepos head headtick heapscan info objarg orderpeek override place play prop registry scan setlog shiparg shipcmds state staticinfo staticpos stop teleport time walk worker_blob worker_blobinfo worker_carry worker_moves worker_poll worker_post worker_start worker_state worker_stop worker_wait',
    'info: version crewtest-21, 74 DCS functions missing, thread number, cookie offset -1',
    'worker: before any: none, post false, poll nil',
    'worker: started, answered and stopped 20 times',
    'worker: a second one while the first runs: nil, a worker is still running',
    'worker: 10000 messages each way, in their order: true',
    'worker: an error in a step: caught: boom; and it still answers: re:after',
    'worker: told to stop while it is busy: ended in 30 ms false',
    'worker: and when its step is over: ended true',
    'worker: an error that ends its script: E died as asked, then X',
    'worker: stopped after it: true',
    'blob: a message of 289 bytes beginning B; its nine numbers: 7 3 100.5 42 1 1.25 2 3 4.5',
    'blob: applied by the module: 4 commands, 4 failed (the object could not be placed | no such character (scan again) | no such character (scan again) | no such character (scan again)); seq 7 step 3 time 100.5 frame 42 on 1',
    'blob: the failed ones: 1 16777472 3 16777472 2 4 53 2 1',
    'blob: through stand-ins: 4 commands, 0 failed: staticpos(16777472,1,0,0,0,1,0,0,0,1,10,20,30) objarg(12345,16777472,2,0.5) shiparg(12345,53,0.25) place(1,10,9,5,1,0)',
    'blob: a list is late: 1 object(s) moved on: staticpos(16777472,1,0,0,0,1,0,0,0,1,14.5,20,30)',
    'blob: asked again for the same moment: 0 moved; followed: 2, then 0',
    'blob: not a packed list: nil / not a packed list',
    'orderpeek: nil, no such character (scan again)',
    'debugset: nil, AnimatorLogic::debug_settings was not found in animator_logic.dll',
    'anim: nil, no such character (scan again)',
    'animinfo: nil, no such character (scan again)',
    'prop: nil, no such character (scan again)',
    'head: nil, no such character (scan again)',
    'head forgotten: true; headtick: 0 0',
    'time: -1',
    'scan: envs 0, envObjects 0, envErr -1, regCount 0, regErr -1, people 0, classes 0, strOk 0, strBad 0, noRtti 0',
    'registry: n 0, err -1, characters 0, people 0, classes 0',
    'anims: nil, no such character (scan again)',
    'walk: nil, no such character (scan again)',
    'state: nil, no such character (scan again)',
    '200 scans: ok',
]
missing = [e for e in expect if e not in text]
ok = not missing and 'heapscan: err 0, faults' in text and 'people 0, memory scanned true' in text and lua.lua_gettop(L) == 1
print('\nSMOKE TEST', 'PASSED' if ok else 'FAILED: ' + '; '.join(missing))
sys.exit(0 if ok else 1)
