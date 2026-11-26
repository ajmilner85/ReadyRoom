"""Run a crew test script under DCS's own Lua 5.1 (bin-mt/lua.dll) with the test harness of catcc-dcs/test/crewtest.test.ts
(its mocked DCS and stand-in native module), some fifty times as fast as the fengari the tests themselves run in: for
long runs (the deck spotting demo from start to finish).

  1. the harness and its sources written to a folder (any one hook test will do):
       set CATCC_LUA_DUMP=<folder>   then   npx vitest run catcc-dcs/test/crewtest.test.ts -t "ten items"
  2. python -I luarun.py <folder> <script.lua> [NAME=value ...]
     script.lua: what a test gives hook() (it may use START-like lines: HANDLER.onSimulationStart(), frames(n), click(..),
     rec(..)); NAME=value: the harness's switches set before it (DEMO_ON=true, UI_ON=true ...; FLAG is true).
     Prints what the script recorded (rec) and, after "#LOG", the hook's log.
The sources are read again from the repository on every run (the folder's copies are only a fallback), so a change to
the hook or the demo needs no new dump."""
import ctypes
import os
import sys

BIN = r'C:\Program Files\Eagle Dynamics\DCS World\bin-mt'
HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.normpath(os.path.join(HERE, '..', '..', 'Scripts', 'CATCC'))
LIVE = {'HOOK_SRC': 'crewtest_hook.lua', 'MENU_SRC': 'crewtest.lua', 'ROUTES_REAL': 'crewtest_routes.lua', 'UI_SRC': 'crewtest_ui.lua', 'DEMO_SRC': 'crewtest_demo.lua',
        'HANGAR_SRC': 'crewtest_hangar.lua', 'SLOTS_SRC': 'crewtest_slots.lua', 'HEAD_SRC': 'crewtest_head.lua',
        'COCKPIT_SRC': 'crewtest_cockpit.lua'}
# what Lua 5.3 (fengari) has and 5.1 has under another name
SHIM = b"""
REAL_CLOCK = os.clock
REAL_LOADLIB = package.loadlib
local ls, rawload = loadstring, load
load = function(chunk, name, mode, env)
  if type(chunk) ~= 'string' then return rawload(chunk, name) end
  local f, e = ls(chunk, name)
  if f and env then setfenv(f, env) end
  return f, e
end
table.unpack = table.unpack or unpack
local main = ...
local ok, err = xpcall(main, debug.traceback)
if not ok then OUT = 'ERROR ' .. tostring(err) end
"""


def main():
    folder, script = sys.argv[1], sys.argv[2]
    sets = [a for a in sys.argv[3:] if '=' in a]
    os.add_dll_directory(BIN)
    lua = ctypes.CDLL(os.path.join(BIN, 'lua.dll'))
    vp = ctypes.c_void_p
    lua.luaL_newstate.restype = vp
    lua.luaL_openlibs.argtypes = [vp]
    lua.luaL_loadbuffer.argtypes = [vp, ctypes.c_char_p, ctypes.c_size_t, ctypes.c_char_p]
    lua.lua_pcall.argtypes = [vp, ctypes.c_int, ctypes.c_int, ctypes.c_int]
    lua.lua_pushlstring.argtypes = [vp, ctypes.c_char_p, ctypes.c_size_t]
    lua.lua_setfield.argtypes = [vp, ctypes.c_int, ctypes.c_char_p]
    lua.lua_getfield.argtypes = [vp, ctypes.c_int, ctypes.c_char_p]
    lua.lua_tolstring.argtypes = [vp, ctypes.c_int, ctypes.POINTER(ctypes.c_size_t)]
    lua.lua_tolstring.restype = ctypes.c_void_p
    GLOBALS = -10002
    L = lua.luaL_newstate()
    lua.luaL_openlibs(L)

    def text(i):
        n = ctypes.c_size_t(0)
        q = lua.lua_tolstring(L, i, ctypes.byref(n))
        return ctypes.string_at(q, n.value).decode('utf-8', 'replace') if q else '(nothing)'

    for name in sorted(os.listdir(folder)):
        if name.endswith('.txt'):
            key = name[:-4]
            live = os.path.join(SCRIPTS, LIVE.get(key, '?'))
            data = open(live if os.path.exists(live) else os.path.join(folder, name), 'rb').read()
            if key == 'ROUTES_REAL':
                data = data.replace(b'\r\n', b'\n')
            lua.lua_pushlstring(L, data, len(data))
            lua.lua_setfield(L, GLOBALS, key.encode())
    world = open(os.path.join(folder, 'world.lua'), 'rb').read()
    # (for THREAD=true, the demo on its own thread: where the scripts and the native module are)
    paths = ('SCRIPTS_DIR = [[%s/]]\nDLL_PATH = [[%s]]\n' % (SCRIPTS.replace(os.sep, '/'), os.path.join(HERE, 'bin', 'catcc_crew.dll'))).encode()
    pre = b'FLAG = true\nNO_NATIVE = false\nUI_ON = false\nDEMO_ON = false\n' + paths + b''.join(a.encode() + b'\n' for a in sets)
    prog = pre + world + b'\n' + open(script, 'rb').read() + b'\ndone()'
    if lua.luaL_loadbuffer(L, SHIM, len(SHIM), b'shim') != 0:
        sys.exit('shim: ' + text(-1))
    if lua.luaL_loadbuffer(L, prog, len(prog), b'harness') != 0:
        sys.exit('COMPILE ERROR ' + text(-1))
    if lua.lua_pcall(L, 1, 0, 0) != 0:
        sys.exit('ERROR ' + text(-1))
    lua.lua_getfield(L, GLOBALS, b'OUT')
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    print(text(-1))


main()
