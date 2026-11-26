// The folded flag (catcc-dcs/deck-test/crew-test/model/flag.py): a model of our own .edm writer for a jet's glareshield,
// its height, pitch and lean on model arguments 10, 11, 12; and the crew test panel's "Flag" page tool
// (Scripts/CATCC/crewtest_flag.lua), run under fengari against a small stand-in for the mission's world.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error fengari ships no types
import { lauxlib, lua, lualib, to_luastring } from 'fengari';

const here = (p: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), p);
const MODEL = here('../deck-test/crew-test/model');
const MOD = here('../deck-test/crew-test/Mods/tech/CATCC-Crew');
const py = (args: string[]) => execFileSync('python', ['-I', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const FILES = ['Shapes/CATCC_Flag.edm', 'Shapes/CATCC_Flag_lod1.edm', 'Shapes/CATCC_Flag_lod2.edm', 'Shapes/CATCC_Flag_lod3.edm', 'Shapes/CATCC_Flag.lods', 'Shapes/textures/catcc_flag_diff.dds', 'Shapes/textures/catcc_flag_nm.dds', 'Shapes/textures/catcc_flag_diff_roughmet.dds'];

describe('the folded flag model', () => {
  it('the model and textures in the mod are what flag.py makes now (else: python -I model/flag.py)', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'catcc-flag-'));
    const said = py([path.join(MODEL, 'flag.py'), out]);
    expect(said).toMatch(/^folded flag: \d+ vertices, \d+ triangles; legs 0\.222 m, long edge 0\.323 m, point 0\.152 m up, 0\.038 m thick; 7 stars a face/);
    expect(Number(/ (\d+) triangles/.exec(said)![1])).toBeLessThan(4000);
    // four levels of detail, each simpler, the last to 200 m
    expect(said).toMatch(/levels of detail: CATCC_Flag (\d+) triangles to 6 m, CATCC_Flag_lod1 (\d+) triangles to 20 m, CATCC_Flag_lod2 (\d+) triangles to 60 m, CATCC_Flag_lod3 (\d+) triangles to 200 m/);
    const tris = /levels of detail: CATCC_Flag (\d+) triangles to 6 m, CATCC_Flag_lod1 (\d+) triangles to 20 m, CATCC_Flag_lod2 (\d+) triangles to 60 m, CATCC_Flag_lod3 (\d+) triangles/.exec(said)!.slice(1).map(Number);
    for (let i = 1; i < 4; i++) expect(tris[i], `level ${i}`).toBeLessThan(tris[i - 1] / 3);
    expect(fs.readFileSync(path.join(MOD, 'Shapes/CATCC_Flag.lods'), 'utf8')).toContain('{"CATCC_Flag.edm", 6.0},\n\t\t{"CATCC_Flag_lod1.edm", 20.0},\n\t\t{"CATCC_Flag_lod2.edm", 60.0},\n\t\t{"CATCC_Flag_lod3.edm", 200.0},');
    // standing on its long edge at the origin, along x (its corners a little rounded), its faces to either side
    expect(said).toContain("shape ['-0.154', '0.000', '-0.030'] to ['0.154', '0.148', '0.030']");
    for (const f of FILES) expect(fs.readFileSync(path.join(out, f)).equals(fs.readFileSync(path.join(MOD, f))), f).toBe(true);
    fs.rmSync(out, { recursive: true, force: true });
  }, 180000);

  it.each(['CATCC_Flag', 'CATCC_Flag_lod1', 'CATCC_Flag_lod2', 'CATCC_Flag_lod3'])('%s reads back as a version 10 file: height, pitch and lean nodes in a chain on arguments 10, 11, 12, the mesh under the last', (name) => {
    const dump = py([path.join(MODEL, 'edm.py'), path.join(MOD, `Shapes/${name}.edm`)]);
    expect(dump).toMatch(/'MATERIAL_NAME': 'def_material', 'NAME': 'catcc_flag'/);
    expect(dump).toContain("(0, 'catcc_flag_diff', -1, [2, 2, 10, 6]), (1, 'catcc_flag_nm', -1, [2, 2, 10, 6]), (2, 'catcc_flag_diff_roughmet', -1, [2, 2, 10, 6])");
    expect(dump).toContain("node 1 model::ArgPositionNode 'flag_height' parent 0 pos [10] rot [] scale 0");
    expect(dump).toContain("node 2 model::ArgRotationNode 'flag_pitch' parent 1 pos [] rot [11] scale 0");
    expect(dump).toContain("node 3 model::ArgRotationNode 'flag_lean' parent 2 pos [] rot [12] scale 0");
    expect(dump).toMatch(/RENDER_NODES model::RenderNode 'flag' material 0 parents \[\(3, -1\)\] vtx \d+ x 15/);
    expect(dump).toContain('round trip: IDENTICAL');
  });

  it("the keys: at 0 the user's pose on a Hornet (2.68 m over the deck, pitch 7, lean -45: drawn so without its arguments); 10 the height x (1 + it); 11 and 12 turn +-90 degrees from the base about z (nose up) and x (top to starboard)", () => {
    const k = JSON.parse(py(['-c', `import sys, json, math; sys.path.insert(0, ${JSON.stringify(MODEL)}); import edm
f = edm.read(open(${JSON.stringify(path.join(MOD, 'Shapes/CATCC_Flag.edm'))}, 'rb').read())
n = {x['name']: x for x in f['nodes'][1:]}
def deg(q, axis):
    return round(math.degrees(2 * math.atan2(q[axis], q[3])), 3)
keys = lambda name: {str(k[0]): k[1:] for k in n[name]['rot'][0][1]}
p, l = keys('flag_pitch'), keys('flag_lean')
print(json.dumps({'count': f['root']['unkC'][1], 'h': n['flag_height']['pos'][0][1],
  'pitch': [deg(p['-1.0'], 2), deg(p['0.0'], 2), deg(p['1.0'], 2)], 'lean': [deg(l['-1.0'], 0), deg(l['0.0'], 0), deg(l['1.0'], 0)]}))`]));
    expect(k.count).toBe(13);
    expect(k.h).toEqual([[-1, 0, 0, 0], [0, 0, 2.68, 0], [1, 0, 5.36, 0]]);
    expect(k.pitch).toEqual([-83, 7, 97]);
    expect(k.lean).toEqual([-135, -45, 45]);
  });

  it('the textures: BC1 colours and roughmet, a BC5 normal map, 1024 square with all their mipmaps', () => {
    for (const [f, four] of [['catcc_flag_diff', 'DXT1'], ['catcc_flag_nm', 'BC5U'], ['catcc_flag_diff_roughmet', 'DXT1']] as const) {
      const d = fs.readFileSync(path.join(MOD, 'Shapes/textures', `${f}.dds`));
      expect(d.subarray(0, 4).toString('latin1'), f).toBe('DDS ');
      expect([d.readUInt32LE(12), d.readUInt32LE(16), d.readUInt32LE(28)], f).toEqual([1024, 1024, 11]);
      expect(d.subarray(84, 88).toString('latin1'), f).toBe(four);
    }
  });
});

describe('the flag tool (the panel\'s "Flag" page)', () => {
  /** the tool under fengari: the mission's world stood in for (a ship at the origin, its axes the world's; aircraft in
   * WORLD by object id), CATCC_CR.marker recording what is made; returns what rec() wrote */
  function tool(script: string): string[] {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    lua.lua_pushstring(L, to_luastring(fs.readFileSync(here('../Scripts/CATCC/crewtest_flag.lua'), 'utf8')));
    lua.lua_setglobal(L, to_luastring('TOOL_SRC'));
    const pre = `REC, MADE, ARGS, LOG = {}, {}, {}, {}
function rec(s) REC[#REC + 1] = tostring(s) end
NOW = 0
local I = { x = 1, y = 0, z = 0 }
local J = { x = 0, y = 1, z = 0 }
local K = { x = 0, y = 0, z = 1 }
SHIP = { id_ = 77, getName = function() return 'CVN' end, isExist = function() return true end, getPosition = function() return { p = { x = 0, y = 0, z = 0 }, x = I, y = J, z = K } end }
WORLD = {}
-- an aircraft: id, type, name, kind ('u' unit / 's' static), its position and its axes (nose, up, right)
function plane(id, typ, name, kind, p, X, Y, Z)
  local o = { id_ = id, kind = kind, p = p, X = X or I, Y = Y or J, Z = Z or K, air = false }
  o.isExist = function() return WORLD[id] == o end
  o.getTypeName = function() return typ end
  o.getName = function() return name end
  o.inAir = function() return o.air end
  o.getPosition = function() return { p = o.p, x = o.X, y = o.Y, z = o.Z } end
  WORLD[id] = o
  return o
end
local seq = 1000
local ENV = setmetatable({
  coalition = {
    side = { BLUE = 2, RED = 1, NEUTRAL = 0 },
    getGroups = function(side, cat)
      if side ~= 2 then return {} end
      if cat == 3 then return { { getUnits = function() return { SHIP } end } } end
      if cat == 0 then
        local us = {}
        for _, o in pairs(WORLD) do if o.kind == 'u' then us[#us + 1] = o end end
        return { { getUnits = function() return us end } }
      end
      return {}
    end,
    getStaticObjects = function(side)
      local ss = {}
      if side == 2 then for _, o in pairs(WORLD) do if o.kind == 's' then ss[#ss + 1] = o end end end
      return ss
    end,
  },
  Group = { Category = { AIRPLANE = 0, HELICOPTER = 1, SHIP = 3 } },
  CATCC_CR = { marker = function(key, typ, fwd, stbd, ang, cat, ship)
    if typ == '' then
      MADE[#MADE + 1] = string.format('away %s', key)
      return 'OK|0|put away'
    end
    seq = seq + 1
    MADE[#MADE + 1] = string.format('%s %s on %s at %.3f %.3f %.1f deg', key, typ, tostring(ship), fwd, stbd, math.deg(ang))
    return string.format('OK|%d|%s %d', seq, key, seq)
  end },
}, { __index = _G })
local function split(s) local t = {} for v in (s .. '|'):gmatch('([^|]*)|') do t[#t + 1] = v end return t end
JET = 101
DECK = { list = {}, shown = true, ship = 'CVN', pose = function(e) return e.x, e.z, 0 end }
F = assert(load(TOOL_SRC, 'crewtest_flag'))({
  dostring = function(code) return assert(load(code, 'mission', 't', ENV))() end,
  split = split,
  objarg = function(id, n, v) ARGS[id .. '/' .. n] = v return v end,
  jetId = function() return JET, WORLD[JET] and WORLD[JET].getTypeName() end,
  deck = DECK,
  log = function(s) LOG[#LOG + 1] = s end,
  now = function() return NOW end,
})
-- (the tests' own glareshield point, the first one, so they do not move with the defaults; those kept in DEFAULT)
local S = F.SPOTS['FA-18C_hornet']
DEFAULT = { x = S.x, y = S.y, z = S.z, pitch = S.pitch, lean = S.lean, turn = S.turn }
S.x, S.y, S.z, S.pitch, S.lean, S.turn = 4.40, 0.929, -0.20, -12.0, 0.0, 0.0
function args(id) return string.format('%.4f %.4f %.4f', ARGS[id .. '/10'], ARGS[id .. '/11'], ARGS[id .. '/12']) end
function last() return MADE[#MADE] end`;
    if (lauxlib.luaL_dostring(L, to_luastring(`${pre}\n${script}\nOUT = table.concat(REC, '\\n')`)) !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
    lua.lua_getglobal(L, to_luastring('OUT'));
    return lua.lua_tojsstring(L, -1).split('\n');
  }

  it("its model numbers are flag.py's", () => {
    const [t] = tool("rec(string.format('%s %d %d %d %.3f %.2f %.2f %.1f', F.M.TYPE, F.M.HEIGHT, F.M.PITCH, F.M.LEAN, F.M.BASE_HEIGHT, F.M.BASE_PITCH, F.M.BASE_LEAN, F.M.TURN_MAX))");
    const g = py(['-c', `import sys; sys.path.insert(0, ${JSON.stringify(MODEL)}); import flag as f; print('CATCC_Flag %d %d %d %.3f %.2f %.2f %.1f' % (f.HEIGHT_ARG, f.PITCH_ARG, f.LEAN_ARG, f.BASE_HEIGHT, f.BASE_PITCH, f.BASE_LEAN, f.TURN_MAX))`]).trim();
    expect(t).toBe(g);
  });

  it("the F/A-18C's glareshield point is where the user put it in DCS (their Report of 2026-11-26; the lean the -45 the model then turned to)", () => {
    expect(tool("rec(string.format('%.3f %.3f %.3f %.1f %.1f %.1f', DEFAULT.x, DEFAULT.y, DEFAULT.z, DEFAULT.turn, DEFAULT.pitch, DEFAULT.lean))")[0]).toBe('4.270 0.879 -0.322 188.0 7.0 -45.0');
  });

  it("on the player's Hornet: at its glareshield (4.40 forward, 0.929 up, 0.20 to port of its origin), over the deck by the arguments; pressed again, taken off", () => {
    const r = tool(`plane(101, 'FA-18C_hornet', 'Me', 'u', { x = 10, y = 21.975, z = 5 })
rec(F.toggle('jet'))
rec(last())
rec(args(1001))
rec(F.status():gsub('\\n', ' / '))
rec(F.toggle('jet'))
rec(last())
rec(F.status():match('^[^\\n]*'))`);
    expect(r[0]).toBe('flag: on Me. 1 flag(s).');
    expect(r[1]).toBe('catcc-flag-101 CATCC_Flag on CVN at 14.400 4.800 0.0 deg');
    // 21.975 + 0.929 - 20.149 = 2.755 m over the flight deck (/ 2.68 - 1); pitch -12 (from 7, / 90); no lean (from -45)
    expect(r[2]).toBe('0.0280 -0.2111 0.5000');
    expect(r[3]).toMatch(/^Flags: Me \/ 4\.400 fwd, 0\.929 up, -0\.200 stbd; turn 0\.0, pitch -12\.0, lean 0\.0 deg/);
    expect(r[4]).toBe('flag: taken off Me. 0 flag(s).');
    expect(r[5]).toBe('away catcc-flag-101');
    expect(r[6]).toBe('No flags.');
  });

  it("carried with the aircraft's own pose: nose up 3 degrees, rolled; a static turned to starboard, selected on the deck page; not on another type", () => {
    const r = tool(`local c, s = math.cos(math.rad(3)), math.sin(math.rad(3))
plane(101, 'FA-18C_hornet', 'Me', 'u', { x = 0, y = 21.9, z = 0 }, { x = c, y = s, z = 0 }, { x = -s, y = c, z = 0 }, { x = 0, y = 0, z = 1 })
rec(F.toggle('jet'))
rec(last())
rec(args(1001))
local cr, sr = math.cos(math.rad(2)), math.sin(math.rad(2))
-- (the static: its nose to starboard, its right wing 2 degrees up)
plane(202, 'FA-18C_hornet', 'Spot 7', 's', { x = 40, y = 21.9, z = -3 }, { x = 0, y = 0, z = 1 }, { x = sr, y = cr, z = 0 }, { x = -cr, y = sr, z = 0 })
DECK.list[1], DECK.lock = { x = 40.5, z = -3.2 }, 1
rec(F.toggle('lock'))
rec(last())
rec(args(1002))
plane(303, 'F-14B', 'Tomcat', 's', { x = 80, y = 21.9, z = 0 })
DECK.list[1] = { x = 80, z = 0 }
rec(select(2, F.toggle('lock')))
DECK.list[1] = { x = 120, z = 0 }
rec(select(2, F.toggle('lock')))`);
    expect(r[0]).toBe('flag: on Me. 1 flag(s).');
    // forward 4.40 cos 3 - 0.929 sin 3; up 4.40 sin 3 + 0.929 cos 3; the pitch -12 + 3
    expect(r[1]).toBe('catcc-flag-101 CATCC_Flag on CVN at 4.345 -0.200 0.0 deg');
    expect(r[2]).toBe(`${((21.9 + 4.4 * Math.sin(Math.PI / 60) + 0.929 * Math.cos(Math.PI / 60) - 20.149) / 2.68 - 1).toFixed(4)} -0.1778 0.5000`);
    expect(r[3]).toBe('flag: on Spot 7. 2 flag(s).');
    // its nose to starboard: the glareshield 4.40 to starboard, 0.20 forward (its port side is the ship's forward)
    expect(r[4]).toMatch(/^catcc-flag-202 CATCC_Flag on CVN at 40\.\d+ 1\.400 90\.0 deg$/);
    // the right wing up: the top leans to port (-2 degrees)
    expect(r[5]).toMatch(/ -0\.2111 0\.4778$/);
    expect(r[6]).toBe("flag: not made on Tomcat: only the F/A-18C's glareshield is known (this is F-14B)");
    expect(r[7]).toBe('flag: no aircraft stands where the selected one is.');
  });

  it('moves: fore / aft and turns make every flag anew; up, pitch and lean only write its arguments; kept for the next flags', () => {
    const r = tool(`plane(101, 'FA-18C_hornet', 'Me', 'u', { x = 10, y = 21.975, z = 5 })
F.toggle('jet')
local n = #MADE
rec(F.move('fwd', 0.05))
rec(last())
rec(F.move('up', -0.01))
rec(#MADE - n)
rec(args(1002))
F.move('pitch', 2)
F.move('lean', -10)
rec(args(1002))
F.move('turn', 10)
rec(last())
rec(F.report())`);
    expect(r[0]).toMatch(/^flag: 4\.450 fwd, 0\.929 up, -0\.200 stbd; turn 0\.0, pitch -12\.0, lean 0\.0 deg \(moved \+0\.050 fwd/);
    expect(r[1]).toBe('catcc-flag-101 CATCC_Flag on CVN at 14.450 4.800 0.0 deg');
    expect(r[3]).toBe('1');
    expect(r[4]).toBe('0.0243 -0.2111 0.5000');
    expect(r[5]).toBe('0.0243 -0.1889 0.3889');
    expect(r[6]).toBe('catcc-flag-101 CATCC_Flag on CVN at 14.450 4.800 10.0 deg');
    expect(r[7]).toMatch(/^flag: 4\.450 fwd, 0\.919 up, -0\.200 stbd; turn 10\.0, pitch -10\.0, lean -10\.0 deg/);
  });

  it('follows its aircraft: arguments kept every half second; towed: made anew where it stops; in the air or gone: taken away', () => {
    const r = tool(`local me = plane(101, 'FA-18C_hornet', 'Me', 'u', { x = 10, y = 21.975, z = 5 })
local other = plane(202, 'FA-18C_hornet', 'Spot 7', 's', { x = 40, y = 21.9, z = -3 })
F.toggle('jet')
DECK.list[1], DECK.lock = { x = 40, z = -3 }, 1
F.toggle('lock')
local n = #MADE
ARGS['1001/10'] = nil
NOW = 0.6
rec(tostring(F.tick()))
rec(tostring(ARGS['1001/10'] ~= nil) .. ' ' .. (#MADE - n))
me.p = { x = 10.01, y = 21.975, z = 5 }
NOW = 1.7
F.tick()
rec('jitter: ' .. (#MADE - n))
other.p = { x = 45, y = 21.9, z = -3 }
NOW = 2.8
F.tick()
rec(last())
me.air = true
NOW = 3.9
rec(F.tick())
WORLD[202] = nil
NOW = 5.0
rec(F.tick())
rec(F.status():match('^[^\\n]*'))
F.toggle('jet')
F.reset()
rec(F.status():match('^[^\\n]*'))`);
    expect(r[0]).toBe('nil');
    expect(r[1]).toBe('true 0');
    expect(r[2]).toBe('jitter: 0');
    expect(r[3]).toBe('catcc-flag-202 CATCC_Flag on CVN at 49.400 -3.200 0.0 deg');
    expect(r[4]).toBe('flag: Me took off: its flag taken away.');
    expect(r[5]).toBe('flag: Spot 7 is gone: its flag taken away.');
    expect(r[6]).toBe('No flags.');
    expect(r[8] ?? r[7]).toBe('No flags.');
  });
});
