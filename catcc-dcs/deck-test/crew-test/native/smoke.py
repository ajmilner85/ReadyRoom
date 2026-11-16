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
for name, value in (('DLL', dll), ('LOGPATH', log)):
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
    'functions: anim animinfo anims attach bubble catcrews catorder debugset deck dump elevator envflags forcepos heapscan info objarg orderpeek override place play prop registry scan setlog shiparg shipcmds state staticinfo staticpos stop teleport time walk',
    'info: version crewtest-17, 74 DCS functions missing, thread number, cookie offset -1',
    'orderpeek: nil, no such character (scan again)',
    'debugset: nil, AnimatorLogic::debug_settings was not found in animator_logic.dll',
    'anim: nil, no such character (scan again)',
    'animinfo: nil, no such character (scan again)',
    'prop: nil, no such character (scan again)',
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
