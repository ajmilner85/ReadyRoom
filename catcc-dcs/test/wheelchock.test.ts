// The Navy's universal wheel chock (catcc-dcs/deck-test/crew-test/model/wheel_chock.py): a model of our own .edm writer with
// its spacing on model argument 10, and its textures.
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
// (python -c with the model's folder on the path: the generator's own functions)
const chock = (code: string) => py(['-c', `import sys; sys.path.insert(0, ${JSON.stringify(MODEL)}); import wheel_chock as wc\n${code}`]);
const FILES = ['Shapes/CATCC_WheelChock.edm', 'Shapes/textures/catcc_wheelchock_diff.dds', 'Shapes/textures/catcc_wheelchock_nm.dds',
  'Shapes/textures/catcc_wheelchock_diff_roughmet.dds'];

describe('the wheel chock model', () => {
  it('the model and textures in the mod are what wheel_chock.py makes now (else: python -I model/wheel_chock.py)', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'catcc-chock-'));
    const said = py([path.join(MODEL, 'wheel_chock.py'), out]);
    // blocks 0.300 long (across the tyre), 0.145 deep (along the bar), 0.150 high; a 0.041 m square bar 1.057 m long
    expect(said).toMatch(/^wheel chock: \d+ vertices, \d+ triangles; blocks 0\.300 x 0\.145 x 0\.150 m \(long x deep x high\), chamfers 0\.040; bar 0\.041 m square, 1\.057 m long; yellow bar/);
    // light: the pads, ribs, teeth and holes are in the textures
    expect(Number(/ (\d+) triangles/.exec(said)![1])).toBeLessThan(800);
    expect(said).toContain('argument 10: each tyre-side plate this far from the centre point (m), from 0.012 (0.024 apart) to 0.360 (0.720 apart); the bar 1.057 m end to end');
    expect(said).toContain('the tyre stands on a span of 0.2135 m beside the bar (its middle is the origin)');
    // (where nothing writes it: a multiplayer client whose server does not allow object export)
    expect(said).toContain("argument 10 untouched (0): 0.338, a parked Hornet's fit");
    // the F/A-18C's wheels as DCS has them (FA-18C_hornet.lua: 0.5385 and 0.68 m across)
    expect(said).toContain('F/A-18C: nose wheel (r 0.2692) 0.2171, main wheels (r 0.3400) 0.2504');
    for (const f of FILES) expect(fs.readFileSync(path.join(out, f)).equals(fs.readFileSync(path.join(MOD, f))), f).toBe(true);
    fs.rmSync(out, { recursive: true, force: true });
  }, 120000);

  it('reads back as a version 10 file: one material with the three textures, the fixed half and the sliding half each on argument 10', () => {
    const dump = py([path.join(MODEL, 'edm.py'), path.join(MOD, 'Shapes/CATCC_WheelChock.edm')]);
    expect(dump).toContain("root 'Scene Root' v0 props [('__VERSION__', 3)]");
    expect(dump).toMatch(/'MATERIAL_NAME': 'def_material', 'NAME': 'catcc_wheelchock'/);
    expect(dump).toContain("(0, 'catcc_wheelchock_diff', -1, [2, 2, 10, 6]), (1, 'catcc_wheelchock_nm', -1, [2, 2, 10, 6]), (2, 'catcc_wheelchock_diff_roughmet', -1, [2, 2, 10, 6])");
    expect(dump).toContain("('normalMapValue', 1.0)");
    expect(dump).toContain("node 1 model::ArgPositionNode 'chock_fixed' parent 0 pos [10] rot [] scale 0");
    expect(dump).toContain("node 2 model::ArgPositionNode 'chock_sliding' parent 0 pos [10] rot [] scale 0");
    expect(dump).toMatch(/RENDER_NODES model::RenderNode 'chock_fixed' material 0 parents \[\(1, -1\)\] vtx \d+ x 15/);
    expect(dump).toMatch(/RENDER_NODES model::RenderNode 'chock_sliding' material 0 parents \[\(2, -1\)\] vtx \d+ x 15/);
    // standing on the deck (y 0 to the blocks' 0.150), the tail reaching aft, the bar on the +z side
    expect(dump).toContain("bbox ['-0.883', '0.000', '-0.107', '0.522', '0.150', '0.275']");
    expect(dump).toContain('round trip: IDENTICAL');
  });

  it("the argument is the spacing in metres: the fixed half moves forward by it, the sliding half back, from 0.012 to 0.36, held at 0.36; untouched (0, and below) a parked Hornet's fit, 0.338", () => {
    const keys = JSON.parse(py(['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(MODEL)}); import edm
f = edm.read(open(${JSON.stringify(path.join(MOD, 'Shapes/CATCC_WheelChock.edm'))}, 'rb').read())
print(json.dumps({'count': f['root']['unkC'][1], 'nodes': {n['name']: n['pos'] for n in f['nodes'][1:]}}))`]));
    expect(keys.count).toBe(11);
    expect(keys.nodes.chock_fixed).toEqual([[10, [[-1, 0.338, 0, 0], [0, 0.338, 0, 0], [0.012, 0.012, 0, 0], [0.36, 0.36, 0, 0], [1, 0.36, 0, 0]]]]);
    expect(keys.nodes.chock_sliding).toEqual([[10, [[-1, -0.338, 0, 0], [0, -0.338, 0, 0], [0.012, -0.012, 0, 0], [0.36, -0.36, 0, 0], [1, -0.36, 0, 0]]]]);
  });

  it('the textures: BC1 colours and roughmet, a BC5 normal map, 1024 square with all their mipmaps', () => {
    for (const [f, four, size] of [['catcc_wheelchock_diff', 'DXT1', 699192], ['catcc_wheelchock_nm', 'BC5U', 1398256], ['catcc_wheelchock_diff_roughmet', 'DXT1', 699192]] as const) {
      const d = fs.readFileSync(path.join(MOD, 'Shapes/textures', `${f}.dds`));
      expect(d.subarray(0, 4).toString('latin1'), f).toBe('DDS ');
      expect([d.readUInt32LE(12), d.readUInt32LE(16), d.readUInt32LE(28)], f).toEqual([1024, 1024, 11]);
      expect(d.subarray(84, 88).toString('latin1'), f).toBe(four);
      expect(d.length, f).toBe(size);
    }
  });

  it('spacing(r): the block touches the tyre, nothing of it inside, for small to large wheels', () => {
    const rs = [0.1, 0.2692, 0.34, 0.45, 0.5715];
    const got: number[] = JSON.parse(chock(`import json; print(json.dumps([wc.spacing(r) for r in ${JSON.stringify(rs)}]))`));
    const [H, C, D] = [0.15, 0.04, 0.145];
    rs.forEach((r, i) => {
      const s = got[i];
      // the fixed block's section facing the tyre: its tyre-side plate, upper wheel-bearing plate and top face
      const pts: [number, number][] = [[s, C], [s, H - C], [s + C, H], [s + D, H]];
      let near = Infinity;
      for (let k = 0; k + 1 < pts.length; k++) {
        const [[ax, ay], [bx, by]] = [pts[k], pts[k + 1]];
        const [dx, dy] = [bx - ax, by - ay];
        const t = Math.max(0, Math.min(1, ((0 - ax) * dx + (r - ay) * dy) / (dx * dx + dy * dy)));
        near = Math.min(near, Math.hypot(ax + dx * t, ay + dy * t - r));
      }
      expect(near, `r ${r}`).toBeCloseTo(r, 4);
    });
  });

  it("the normal map is DCS's way round (red across, green DOWN the texture): a pad on the top face reads as raised", () => {
    // DCS's own models and Heatblur's F-14 chock (its BC5 normal map, decoded) have it so: red is the normal's part along
    // the texture's width, green its part down the texture. A raised pad's left and upper edges then go below 128.
    const v = JSON.parse(chock(`import json
col, nx, ny, ao, ro, me = wc.atlas()
r = wc.R['top_F']
ca, cb = wc.FIELD[0] + 12.0 + 3 * wc.ROW_P, wc.FIELD[2] + 10.0 + wc.COL_P + wc.COL_P / 2   # a pad of row 3 (odd: offset)
px = lambda a, b: int(r.y0 + b * r.db) * wc.W + int(r.x0 + a * r.da)
print(json.dumps({'left': nx[px(ca - 11.0, cb)], 'right': nx[px(ca + 11.0, cb)], 'up': ny[px(ca, cb - 9.2)], 'down': ny[px(ca, cb + 9.2)], 'top': [nx[px(ca, cb)], ny[px(ca, cb)]]}))`));
    expect(v.left).toBeLessThan(110);
    expect(v.right).toBeGreaterThan(146);
    expect(v.up).toBeLessThan(110);
    expect(v.down).toBeGreaterThan(146);
    expect(v.top.every((x: number) => Math.abs(x - 128) <= 3)).toBe(true);
  }, 120000);
});

// The crew test panel's "Chocks" page (Scripts/CATCC/crewtest_chocks.lua; the page itself: crewtest.test.ts): its
// numbers are the model's, and its fit is the generator's spacing(r) for an upright tyre
describe("the chock tool's numbers", () => {
  /** the tool under fengari, with nothing of DCS: returns what rec() wrote */
  function tool(script: string): string[] {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    lua.lua_pushstring(L, to_luastring(fs.readFileSync(here('../Scripts/CATCC/crewtest_chocks.lua'), 'utf8')));
    lua.lua_setglobal(L, to_luastring('TOOL_SRC'));
    const pre = `REC = {}
function rec(s) REC[#REC + 1] = tostring(s) end
C = assert(load(TOOL_SRC, 'crewtest_chocks'))({ log = function() end, now = function() return 0 end })`;
    if (lauxlib.luaL_dostring(L, to_luastring(`${pre}\n${script}\nOUT = table.concat(REC, '\\n')`)) !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
    lua.lua_getglobal(L, to_luastring('OUT'));
    return lua.lua_tojsstring(L, -1).split('\n');
  }

  it("the model's sizes, its spacing's range and argument, and its type are wheel_chock.py's", () => {
    const [t] = tool("rec(string.format('%.4f %.4f %.4f %.4f %.4f %d %s', C.M.H, C.M.C, C.M.SPAN, C.M.MIN, C.M.MAX, C.M.ARG, C.M.TYPE))");
    const g = chock("print('%.4f %.4f %.4f %.4f %.4f %d CATCC_WheelChock' % (wc.H, wc.C, wc.SPAN, wc.S_MIN, wc.S_MAX, wc.CHOCK_ARG))").trim();
    expect(t).toBe(g);
  });

  it("its fit for a tyre whose axle is its own radius up is the generator's spacing(r); a tyre pressed flat sits wider; the range holds", () => {
    const rs = [0.1, 0.2692, 0.34, 0.45, 0.5715];
    const t = tool(`for _, r in ipairs({ ${rs.join(', ')} }) do rec(string.format('%.5f', C.fitFor(r, r))) end`).map(Number);
    const g = chock(`for r in (${rs.join(', ')}): print('%.5f' % wc.spacing(r))`).trim().split(/\s+/).map(Number);
    t.forEach((v, i) => expect(v, `r ${rs[i]}`).toBeCloseTo(g[i], 4));
    // (the F/A-18C's as the tool takes them: the nose tyre 0.269 on an axle 0.257 up, the mains 0.39 on 0.37)
    expect(tool("rec(string.format('%.4f %.4f %.4f %.4f', C.fitFor(0.269, 0.257), C.fitFor(0.39, 0.37), C.fitFor(0.05, 0.05), C.fitFor(2, 2)))")[0]).toBe('0.2253 0.2907 0.0500 0.3600');
  });

  it("a Hornet's main wheel from its strut (fa-18c.edm's hub): the player's jet as it stood when the user set the chocks (1.826 m above the deck, struts 0.90) gives the axle the fit was made for and no move; the statics' 0.778 a lower axle, a wider fit, 1.3 cm forward; the hangar floor its own deck", () => {
    const [mine, statics, hangar, platform] = tool(`local h, dx = C.wheelAt(21.975, 0.90) rec(string.format('%.3f %+.4f %.4f', h, dx, C.fitFor(0.39, h)))
h, dx = C.wheelAt(21.975, 0.778) rec(string.format('%.3f %+.4f %.4f', h, dx, C.fitFor(0.39, h)))
h, dx = C.wheelAt(8.711 + 1.826, 0.90) rec(string.format('%.3f %+.4f', h, dx))
-- (on an elevator's platform partway up: measured from the platform's surface, not from the flight deck above it)
h, dx = C.wheelAt(21.636, 0.778, 21.636 - 1.856) rec(string.format('%.3f %.4f', h, C.fitFor(0.39, h)))`);
    expect(platform).toBe('0.305 0.3377');
    // (0.3703 m: the fit used for the player, 0.370 m, to 0.3 mm)
    expect(platform).toBeDefined();
    expect(mine).toBe('0.370 +0.0000 0.2904');
    expect(statics).toBe('0.275 +0.0126 0.3534');
    expect(hangar).toBe('0.370 +0.0000');
  });

  // ON A MULTIPLAYER CLIENT (the user's two-PC run, 2026-11-26: the client saw the built-in chocks and ours closed): no
  // mission to ask, so the world through DCS's export API; the Hornets' 23 and our chocks' 10 written on this PC
  it("on a multiplayer client: the Hornets and our chocks found through the export API; the built-in chocks hidden, ours given their wheel's spacing; the page says so where the server does not allow object export; a host does not use it", () => {
    const world = `
WRITES, CALLS = {}, 0
ARGS = { [8000001] = { [23] = 1, [4] = 0.778, [6] = 0.778 } }
-- a carrier 1000 m north, 2000 m east, heading north; a parked Hornet 150 m forward, 8 m to starboard, 22.005 m above
-- its origin, nose aft (its right: the ship's port); our two chocks at its main wheels, 2.35 m aft of it, 1.63 m out
OBJS = {
  [1] = { Name = 'CVN_71', Type = { level1 = 3 }, Position = { x = 1000, y = 0, z = 2000 }, Heading = 0, Pitch = 0 },
  [8000001] = { Name = 'FA-18C_hornet', Type = { level1 = 1 }, Position = { x = 1150, y = 22.005, z = 2008 }, Heading = math.pi, Flags = { Static = true } },
  [8000100] = { Name = 'CATCC_WheelChock', Type = { level1 = 2 }, Position = { x = 1152.35, y = 20.149, z = 2006.37 }, Heading = math.pi },
  [8000101] = { Name = 'CATCC_WheelChock', Type = { level1 = 2 }, Position = { x = 1152.35, y = 20.149, z = 2009.63 }, Heading = 0 },
}
ALLOWED, MP, SERVER = true, true, false
DCS = { isMultiplayer = function() return MP end, isServer = function() return SERVER end }
Export = { LoIsObjectExportAllowed = function() return ALLOWED end, LoGetWorldObjects = function() CALLS = CALLS + 1 return OBJS end }
NOW = 0
local api = { log = function(s) rec('log ' .. s) end, now = function() return NOW end,
  jetId = function() return 16777000, 'FA-18C_hornet' end, jet = function() return nil, 'no jet' end,
  dostring = function() return 'ERR|no mission here' end, split = function(s) local t = {} for p in (s .. '|'):gmatch('(.-)|') do t[#t + 1] = p end return t end,
  objarg = function(id, n, v)
    ARGS[id] = ARGS[id] or {}
    if v ~= nil then ARGS[id][n] = v WRITES[#WRITES + 1] = id .. '/' .. n .. '=' .. string.format('%.4f', v) end
    return ARGS[id][n] or 0
  end }
C = assert(load(TOOL_SRC, 'crewtest_chocks'))(api)
function frames(n) for _ = 1, n do NOW = NOW + 0.25 C.tick() end end
`;
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    lua.lua_pushstring(L, to_luastring(fs.readFileSync(here('../Scripts/CATCC/crewtest_chocks.lua'), 'utf8')));
    lua.lua_setglobal(L, to_luastring('TOOL_SRC'));
    const script = `REC = {}
function rec(s) REC[#REC + 1] = tostring(s) end
${world}
frames(4)
rec(string.format('client: 23 %s; chocks %.4f %.4f; export asked %d times', tostring(ARGS[8000001][23]), ARGS[8000100][10] or -1, ARGS[8000101][10] or -1, CALLS))
-- the server does not allow object export: from its next asking, nothing more written; the page says so
ALLOWED = false
frames(12)
ARGS[8000001][23] = 1
frames(4)
rec('not allowed: 23 ' .. tostring(ARGS[8000001][23]) .. '; ' .. C.status():gsub('\\n', ' / '))
-- a host (or single player) does not use it
C.reset()
ALLOWED, SERVER, CALLS = true, true, 0
frames(12)
rec('host: export asked ' .. CALLS .. ' times')
OUT = table.concat(REC, '\\n')`;
    if (lauxlib.luaL_dostring(L, to_luastring(script)) !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
    lua.lua_getglobal(L, to_luastring('OUT'));
    const r = lua.lua_tojsstring(L, -1).split('\n');
    // the built-in chocks hidden (0.25), both of ours at the parked Hornets' fit (axle 0.305 m up at struts 0.778)
    expect(r).toContain('client: 23 0.25; chocks 0.3377 0.3377; export asked 1 times');
    expect(r).toContain('log chocks (client): from the export API: 1 ship(s), 1 Hornet(s), 2 of our chocks (2 matched to a wheel)');
    expect(r).toContain("log chocks (client): the server does not allow object export (its allow_object_export)");
    expect(r.find((l) => l.startsWith("not allowed"))).toBe("not allowed: 23 1; No chocks. / Other aircraft: the server does not allow object export (its allow_object_export)");
    expect(r).toContain('host: export asked 0 times');
  });
});
